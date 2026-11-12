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

  window.InkluAmharicAudio = class {
    constructor(container) {
      this.tools = document.createElement('div');
      this.tools.className = 'audio-tools';
      this.tools.innerHTML = `
          <button type="button" data-action="stop" aria-label="Stop Amharic audio" hidden>Stop</button>
          <p role="status" id="speech-status" aria-atomic="true"></p>
          <div class="quote-actions" hidden>
            <button type="button" data-action="confirm" aria-describedby="speech-status">Confirm generation</button>
            <button type="button" data-action="cancel">Cancel</button>
          </div>`;
      this.container = container;
      this.stopButton = this.tools.querySelector('[data-action="stop"]');
      this.confirm = this.tools.querySelector('[data-action="confirm"]');
      this.status = this.tools.querySelector('[role="status"]');
      container.addEventListener('click', event => {
        const button = event.target.closest('button[data-passage]');
        if (!button) return;
        if (button !== this.listen) {
          this.deactivate();
          this.listen = button;
          const card = button.closest('li');
          card.classList.add('active');
          card.append(this.tools);
          this.text = card.querySelector('[lang="am"]').textContent;
        }
        if (this.request || this.quote) return;
        if (this.audio) this.togglePlayback();
        else this.fetchAudio(false);
      });
      this.confirm.addEventListener('click', () => {
        if (this.quote && !this.request) this.fetchAudio(true);
      });
      this.cancel = this.tools.querySelector('[data-action="cancel"]');
      this.cancel.addEventListener('click', () => {
        if (this.request) return;
        this.reset('Audio request cancelled.');
        this.listen.focus();
      });
      this.stopButton.addEventListener('click', () => {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        this.playbackState('Play', 'Playback stopped.');
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
      this.confirm.removeAttribute('aria-disabled');
      this.cancel.removeAttribute('aria-disabled');
      this.stopButton.hidden = true;
      this.listen.removeAttribute('aria-disabled');
      this.playbackState('Listen', message);
    }

    playbackState(action, message) {
      this.listen.textContent = action;
      this.listen.setAttribute('aria-label', (action === 'Listen' ? 'Listen to' : action) + ' passage ' + this.listen.dataset.passage);
      this.status.textContent = message;
    }

    async togglePlayback() {
      const audio = this.audio;
      if (!audio.paused) {
        audio.pause();
        this.playbackState('Resume', 'Playback paused.');
        return;
      }
      try {
        await audio.play();
      } catch (error) {
        if (audio === this.audio && error.name !== 'AbortError') this.playbackState('Play', 'Playback could not start. Try Play again.');
      }
    }

    async fetchAudio(confirmed) {
      const controller = new AbortController();
      this.request = controller;
      const timer = setTimeout(() => controller.abort(), confirmed ? 140000 : 30000);
      this.listen.setAttribute('aria-disabled', 'true');
      this.confirm.setAttribute('aria-disabled', String(confirmed));
      this.cancel.setAttribute('aria-disabled', String(confirmed));
      this.status.textContent = confirmed ? 'Generating audio…' : 'Checking availability and cost…';
      // Keep confirmation visible while focused. Restore focus only if its group disappears.
      const returnFocus = () => {
        if (this.confirm.parentElement.contains(this.container.getRootNode().activeElement)) this.listen.focus();
      };
      try {
        const response = await fetch(confirmed ? '/api/speech/generate' : '/api/speech/estimate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, redirect: 'error',
          body: JSON.stringify(confirmed ? { quoteId: this.quote, confirmed: true } : { text: this.text }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (controller !== this.request) return;
          returnFocus();
          this.reset(typeof body.error === 'string' ? body.error : 'Speech is unavailable. Try again.');
          return;
        }
        if (response.headers.get('Content-Type')?.startsWith('audio/mpeg')) {
          const blob = await response.blob();
          if (controller !== this.request) return;
          returnFocus();
          this.reset('');
          const audio = new Audio(URL.createObjectURL(blob));
          this.audio = audio;
          audio.onplaying = () => { if (this.audio === audio && !audio.paused) this.playbackState('Pause', 'Playing Amharic audio.'); };
          audio.onpause = () => {
            if (this.audio === audio && audio.paused && !audio.ended && this.listen.textContent === 'Pause') {
              this.playbackState('Resume', 'Playback paused.');
            }
          };
          audio.onended = () => { if (this.audio === audio) this.playbackState('Play', 'Playback finished.'); };
          audio.onerror = () => {
            if (this.audio !== audio) return;
            if (this.container.getRootNode().activeElement === this.stopButton) this.listen.focus();
            this.reset('Playback failed. Choose Listen to try again.');
          };
          this.stopButton.hidden = false;
          this.playbackState('Play', confirmed ? 'Audio ready. Choose Play.' : 'Saved audio ready. Choose Play.');
        } else {
          const offer = await response.json();
          if (controller !== this.request) return;
          if (confirmed || typeof offer.quoteId !== 'string' || offer.currency !== 'ETB' ||
              !Number.isFinite(offer.estimatedCost) || offer.estimatedCost < 0 || offer.estimatedCost > 1) throw new Error();
          this.quote = offer.quoteId;
          this.status.textContent = `Estimated cost: ${offer.estimatedCost} ETB · Voice: ${offer.voice}.`;
          this.confirm.parentElement.hidden = false;
        }
      } catch {
        if (controller === this.request) {
          returnFocus();
          this.reset('Speech request failed or timed out. Choose Listen to try again.');
        }
      } finally {
        clearTimeout(timer);
        if (controller === this.request) this.request = null;
        if (!this.quote && !this.request) this.listen?.removeAttribute('aria-disabled');
      }
    }
  };
})();
