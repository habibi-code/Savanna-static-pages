(() => {
  'use strict';

  // Short passages let a learner approve individual clips from a long lesson.
  function passages(text) {
    const parts = [];
    let rest = text.replace(/\s+/gu, ' ').trim();
    while (rest.length > 100) {
      let end = rest.lastIndexOf('።', 99) + 1 || rest.lastIndexOf(' ', 100);
      if (end <= 0) end = /[\uD800-\uDBFF]/.test(rest[99]) ? 99 : 100;
      parts.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  class SpeechRequestError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function requestSpeech(action, body, signal) {
    const response = await fetch('/api/speech/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new SpeechRequestError(response.status, typeof detail?.error === 'string' ? detail.error : 'Speech is unavailable. Try again.');
    }
    if (response.headers.get('Content-Type')?.startsWith('audio/mpeg')) return response.blob();
    const offer = await response.json();
    if (action !== 'estimate' || typeof offer.quoteId !== 'string' || typeof offer.voice !== 'string' ||
        offer.currency !== 'ETB' || !Number.isFinite(offer.estimatedCost) ||
        offer.estimatedCost < 0 || offer.estimatedCost > 1) throw new Error();
    return offer;
  }

  async function audioForPassage(text, approval, signal) {
    const estimate = () => requestSpeech('estimate', { text }, signal);
    if (!approval) return estimate();

    let quote = approval;
    if (Date.now() >= approval.expiresAt) {
      quote = await estimate();
      // This click approved only the displayed passage, price and voice.
      if (quote instanceof Blob || quote.estimatedCost !== approval.estimatedCost || quote.voice !== approval.voice) return quote;
    }
    signal.throwIfAborted();
    try {
      return await requestSpeech('generate', { quoteId: quote.quoteId, confirmed: true }, signal);
    } catch (error) {
      // The server can invalidate a token or detect a new price during redemption.
      if (!(error instanceof SpeechRequestError) || error.status !== 409) throw error;
      return estimate();
    }
  }

  window.InkluAmharicAudio = class {
    constructor(container) {
      this.tools = document.createElement('div');
      this.tools.className = 'audio-tools';
      this.tools.innerHTML = `
          <button type="button" data-action="pause" hidden>Pause</button>
          <button type="button" data-action="stop" aria-label="Stop Amharic audio" hidden>Stop</button>
          <span class="playing" hidden>Playing</span>
          <p role="status" id="speech-status" aria-atomic="true"></p>
          <div class="quote-actions" role="group" hidden>
            <button type="button" data-action="confirm" aria-describedby="speech-status">Confirm generation</button>
            <button type="button" data-action="cancel">Cancel</button>
          </div>`;
      this.container = container;
      this.pauseButton = this.tools.querySelector('[data-action="pause"]');
      this.playing = this.tools.querySelector('.playing');
      this.stopButton = this.tools.querySelector('[data-action="stop"]');
      this.confirm = this.tools.querySelector('[data-action="confirm"]');
      this.status = this.tools.querySelector('[role="status"]');
      container.addEventListener('click', event => {
        const button = event.target.closest('button[data-passage]');
        if (!button) return;
        if (button !== this.listen) {
          this.deactivate();
          this.listen = button;
          this.pauseButton.setAttribute('aria-label', 'Pause passage ' + button.dataset.passage);
          this.confirm.parentElement.setAttribute('aria-label', 'Audio confirmation for passage ' + button.dataset.passage);
          const card = button.closest('li');
          card.classList.add('active');
          card.append(this.tools);
          this.text = card.querySelector('[lang="am"]').textContent;
        }
        if (this.request) return;
        if (this.quote) this.confirm.focus();
        else if (this.audio) this.play();
        else this.fetchAudio(false);
      });
      this.confirm.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.repeat) event.preventDefault();
      });
      this.confirm.addEventListener('click', event => {
        if (event.detail <= 1 && this.quote && !this.request) this.fetchAudio(true);
      });
      this.cancel = this.tools.querySelector('[data-action="cancel"]');
      this.cancel.addEventListener('click', () => {
        if (this.request) return;
        this.reset('Audio request cancelled.');
        this.listen.focus();
      });
      this.pauseButton.addEventListener('click', () => this.audio?.pause());
      this.stopButton.addEventListener('click', () => {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        this.setStatus('Playback stopped.');
      });
    }

    setTranslation(text) {
      this.deactivate();
      const parts = text.split(/\n+/u).flatMap(passages);
      this.container.replaceChildren(...parts.map((part, index) => {
        const card = document.createElement('li');
        card.className = 'passage';
        card.innerHTML = '<span class="passage-label"></span><p lang="am" dir="auto"></p><button type="button" data-passage></button>';
        card.firstElementChild.textContent = 'Passage ' + String(index + 1).padStart(2, '0');
        card.querySelector('p').textContent = part;
        const button = card.querySelector('button');
        button.textContent = 'Listen';
        button.dataset.passage = String(index + 1);
        button.setAttribute('aria-label', 'Listen to passage ' + (index + 1));
        return card;
      }));
    }

    deactivate() {
      if (!this.listen) return;
      this.reset('');
      this.listen.closest('li').classList.remove('active');
      this.tools.remove();
      this.listen = null;
    }

    reset(message) {
      this.request?.abort();
      this.request = null;
      this.quote = null;
      if (this.audio) {
        const audio = this.audio;
        this.audio = null;
        audio.pause();
        const url = audio.src;
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
      }
      this.confirm.parentElement.hidden = true;
      this.confirm.removeAttribute('aria-busy');
      this.cancel.hidden = false;
      this.pauseButton.hidden = true;
      this.stopButton.hidden = true;
      this.listen.removeAttribute('aria-busy');
      this.setPassageAction('Listen');
      this.setStatus(message);
    }

    setPassageAction(action) {
      this.listen.textContent = action;
      this.listen.setAttribute('aria-label', (action === 'Listen' ? 'Listen to' : action) + ' passage ' + this.listen.dataset.passage);
    }

    setStatus(message) {
      this.playing.hidden = true;
      this.status.textContent = message;
    }

    async play() {
      const audio = this.audio;
      if (!audio.paused) return;
      try {
        await audio.play();
      } catch (error) {
        if (audio === this.audio && error.name !== 'AbortError') this.setStatus('Playback could not start. Try Play again.');
      }
    }

    async fetchAudio(confirmed) {
      const controller = new AbortController();
      this.request = controller;
      const timer = setTimeout(() => controller.abort(), confirmed ? 140000 : 30000);
      const trigger = confirmed ? this.confirm : this.listen;
      trigger.setAttribute('aria-busy', 'true');
      this.cancel.hidden = confirmed;
      this.confirm.removeAttribute('aria-describedby');
      this.setStatus(confirmed ? 'Preparing audio…' : 'Checking availability and cost…');
      // Keep confirmation visible while focused. Restore focus only if its group disappears.
      const returnFocus = () => {
        if (this.confirm.parentElement.contains(this.container.getRootNode().activeElement)) this.listen.focus();
      };
      try {
        const result = await audioForPassage(this.text, confirmed ? this.quote : null, controller.signal);
        if (controller !== this.request) return;
        if (result instanceof Blob) {
          const audio = new Audio(URL.createObjectURL(result));
          this.setPassageAction('Play or resume');
          returnFocus();
          this.confirm.parentElement.hidden = true;
          this.quote = null;
          this.audio = audio;
          audio.onplaying = () => {
            if (this.audio !== audio || audio.paused) return;
            // Keep playback state readable without speaking over the beginning of the clip.
            this.status.textContent = '';
            this.playing.hidden = false;
          };
          audio.onpause = () => {
            if (this.audio === audio && audio.paused && !audio.ended && !this.playing.hidden) {
              this.setStatus('Playback paused.');
            }
          };
          audio.onended = () => { if (this.audio === audio) this.setStatus('Playback finished.'); };
          audio.onerror = () => {
            if (this.audio !== audio) return;
            const focused = this.container.getRootNode().activeElement;
            if (focused === this.pauseButton || focused === this.stopButton) this.listen.focus();
            this.reset('Playback failed. Choose Listen to try again.');
          };
          this.pauseButton.hidden = false;
          this.stopButton.hidden = false;
          this.setStatus('Audio ready.');
        } else {
          this.quote = result;
          const cost = document.createElement('strong');
          cost.textContent = result.estimatedCost + ' ETB';
          const voice = document.createElement('span');
          voice.className = 'quote-voice';
          voice.textContent = 'Voice: ' + result.voice;
          const label = confirmed ? 'Review the refreshed estimate and confirm again: ' : 'Estimated cost: ';
          this.status.replaceChildren(label, cost, ' ', voice);
          this.confirm.parentElement.hidden = false;
          this.confirm.setAttribute('aria-describedby', 'speech-status');
          this.cancel.hidden = false;
        }
      } catch (error) {
        if (controller === this.request) {
          returnFocus();
          this.reset(error instanceof SpeechRequestError ? error.message : 'Speech request failed or timed out. Choose Listen to try again.');
        }
      } finally {
        clearTimeout(timer);
        if (controller === this.request) {
          this.request = null;
          trigger.removeAttribute('aria-busy');
        }
      }
    }
  };
})();
