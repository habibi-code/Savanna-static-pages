(() => {
  'use strict';

  // Keep the same passage boundaries used to prepare cached clips.
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

  async function audioForPassage(text, signal) {
    const response = await fetch('/api/speech/listen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
      body: JSON.stringify({ text }),
    });
    if (response.status === 429) return { message: 'Too many audio requests. Try again in one minute.' };
    if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/mpeg')) throw new Error();
    return { clip: await response.blob() };
  }

  window.InkluAmharicAudio = class {
    constructor(container) {
      this.tools = document.createElement('div');
      this.tools.className = 'audio-tools';
      this.tools.innerHTML = `
          <button type="button" data-action="pause" hidden>Pause</button>
          <button type="button" data-action="stop" aria-label="Stop Amharic audio" hidden>Stop</button>
          <span class="playing" hidden>Playing</span>
          <p role="status" id="speech-status" aria-atomic="true"></p>`;
      this.container = container;
      this.pauseButton = this.tools.querySelector('[data-action="pause"]');
      this.playing = this.tools.querySelector('.playing');
      this.stopButton = this.tools.querySelector('[data-action="stop"]');
      this.status = this.tools.querySelector('[role="status"]');
      container.addEventListener('click', event => {
        const button = event.target.closest('button[data-passage]');
        if (!button || event.detail > 1) return;
        if (button !== this.listen) {
          this.deactivate();
          this.listen = button;
          this.pauseButton.setAttribute('aria-label', 'Pause passage ' + button.dataset.passage);
          const card = button.closest('li');
          card.classList.add('active');
          card.append(this.tools);
          this.text = card.querySelector('[lang="am"]').textContent;
        }
        if (this.request) return;
        if (this.audio) this.play();
        else this.fetchAudio();
      });
      container.addEventListener('keydown', event => {
        if (event.repeat && event.key === 'Enter' && event.target.closest('button[data-passage]')) event.preventDefault();
      });
      this.pauseButton.addEventListener('click', () => this.audio?.pause());
      this.stopButton.addEventListener('click', () => {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        this.setPassageAction('Play or resume');
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
        button.textContent = 'Generate Audio';
        button.dataset.passage = String(index + 1);
        button.setAttribute('aria-label', 'Generate Audio for passage ' + (index + 1));
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
      if (this.audio) {
        const audio = this.audio;
        this.audio = null;
        audio.pause();
        const url = audio.src;
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
      }
      this.pauseButton.hidden = true;
      this.stopButton.hidden = true;
      this.listen.removeAttribute('aria-busy');
      this.setPassageAction('Generate Audio');
      this.setStatus(message);
    }

    setPassageAction(action) {
      this.listen.textContent = action;
      this.listen.setAttribute('aria-label', (action === 'Generate Audio' ? 'Generate Audio for' : action) + ' passage ' + this.listen.dataset.passage);
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
        if (audio !== this.audio || error.name === 'AbortError') return;
        this.setPassageAction('Play or resume');
        this.setStatus(error.name === 'NotAllowedError' ? 'Audio ready. Choose Play or resume.' : 'Playback could not start. Try Play again.');
      }
    }

    async fetchAudio() {
      const controller = new AbortController();
      this.request = controller;
      const timer = setTimeout(() => controller.abort(), 140000);
      this.listen.setAttribute('aria-busy', 'true');
      this.setStatus('Generating audio…');
      try {
        const { clip, message } = await audioForPassage(this.text, controller.signal);
        if (controller !== this.request) return;
        if (!clip) {
          this.setStatus(message);
          return;
        }
        const audio = new Audio(URL.createObjectURL(clip));
        this.audio = audio;
        audio.onplaying = () => {
          if (this.audio !== audio || audio.paused) return;
          // Keep playback state readable without speaking over the beginning of the clip.
          this.status.textContent = '';
          this.playing.hidden = false;
        };
        audio.onpause = () => {
          if (this.audio === audio && audio.paused && !audio.ended && !this.playing.hidden) {
            this.setPassageAction('Play or resume');
            this.setStatus('Playback paused.');
          }
        };
        audio.onended = () => {
          if (this.audio !== audio) return;
          this.setPassageAction('Play or resume');
          this.setStatus('Playback finished.');
        };
        audio.onerror = () => {
          if (this.audio !== audio) return;
          const focused = this.container.getRootNode().activeElement;
          if (focused === this.pauseButton || focused === this.stopButton) this.listen.focus();
          this.reset('Playback failed. Choose Generate Audio to try again.');
        };
        this.pauseButton.hidden = false;
        this.stopButton.hidden = false;
        // Keep focus and its name stable when sound starts.
        void this.play();
      } catch {
        if (controller === this.request) this.setStatus('Audio could not be loaded. Choose Generate Audio to try again.');
      } finally {
        clearTimeout(timer);
        if (controller === this.request) {
          this.request = null;
          this.listen.removeAttribute('aria-busy');
        }
      }
    }
  };
})();
