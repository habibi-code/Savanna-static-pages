(() => {
  'use strict';

  if (customElements.get('alx-learning-companion')) return;

  const stylesheet = new URL('learning-companion.css', document.currentScript.src).href;
  const headings = { simplify: 'Simple explanation', translate: 'Amharic translation',
    describe: 'Visual descriptions',
    tutor: 'Ask Tutor' };

  function renderExplanation(output, text, parentLevel = 3) {
    let list;
    for (const raw of text.split(/\r?\n/u)) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      const item = /^([-*]|\d+[.)])\s+(.+)/u.exec(line);
      if (item) {
        const tag = /^\d/u.test(item[1]) ? 'ol' : 'ul';
        if (list?.localName !== tag) {
          list = document.createElement(tag);
          if (tag === 'ol') list.start = parseInt(item[1], 10);
          output.append(list);
        }
        const li = document.createElement('li');
        li.textContent = item[2];
        list.append(li);
      } else {
        list = null;
        const heading = /^(#{1,6})\s+(.+)/u.exec(line);
        const block = document.createElement(heading ? 'h' + Math.min(6, parentLevel + heading[1].length) : 'p');
        block.textContent = heading ? heading[2] : line;
        output.append(block);
      }
    }
  }

  function lessonText(extracted) {
    if (!extracted) return '';
    // Serialize only the extractor's detached fragment. Preserve inline words and block breaks.
    const walker = document.createTreeWalker(extracted.content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.data = walker.currentNode.data.replace(/\s+/gu, ' ');
    for (const block of extracted.content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,br,div,figure,figcaption,blockquote')) {
      block.before('\n');
      block.after('\n');
    }
    const body = extracted.content.textContent.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
    return body ? [extracted.title, body].filter(Boolean).join('\n\n') : '';
  }

  const FIDEL_BASE = {
    0x1200: 'h', 0x1208: 'l', 0x1210: 'h', 0x1218: 'm', 0x1220: 's', 0x1228: 'r',
    0x1230: 's', 0x1238: 'sh', 0x1240: 'q', 0x1248: 'qw', 0x1260: 'b', 0x1268: 'v',
    0x1270: 't', 0x1278: 'ch', 0x1280: 'h', 0x1288: 'hw', 0x1290: 'n', 0x1298: 'ny',
    0x12A0: '', 0x12A8: 'k', 0x12B0: 'kw', 0x12B8: 'h', 0x12C0: 'hw', 0x12C8: 'w',
    0x12D0: '', 0x12D8: 'z', 0x12E0: 'zh', 0x12E8: 'y', 0x12F0: 'd', 0x12F8: 'd',
    0x1300: 'j', 0x1308: 'g', 0x1310: 'gw', 0x1318: 'gn', 0x1320: 't', 0x1328: 'ch',
    0x1330: 'p', 0x1338: 'ts', 0x1340: 'ts', 0x1348: 'f', 0x1350: 'p'
  };
  const FIDEL_VOWELS = ['e', 'u', 'i', 'a', 'e', 'i', 'o'];

  function transliterateAmharicToPhonetic(str) {
    if (!str) return '';
    let out = '';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1200 && cp <= 0x135A) {
        const row = cp & ~7;
        const col = cp & 7;
        const c = FIDEL_BASE[row];
        if (c !== undefined && col < 7) {
          if (!c) {
            out += col === 0 ? 'a' : FIDEL_VOWELS[col];
          } else {
            out += c + (col === 5 ? (out.endsWith(' ') || out === '' ? 'i' : '') : FIDEL_VOWELS[col]);
          }
          continue;
        }
      }
      if (ch === '፡' || ch === '፦' || ch === '፤' || ch === '፣') { out += ' '; continue; }
      if (ch === '።') { out += '. '; continue; }
      if (cp >= 0x1369 && cp <= 0x1371) { out += String(cp - 0x1368) + ' '; continue; }
      out += ch;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  class LearningCompanion extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <button type="button" id="toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="panel">
          <span class="mark" aria-hidden="true"></span> Inklu <span class="launcher-label">Companion</span>
        </button>
        <dialog id="panel" aria-labelledby="brand" aria-describedby="lesson-title">
          <header>
            <div class="brand-row">
              <div class="brand"><span class="mark" aria-hidden="true"></span><h2 id="brand">Inklu</h2></div>
              <button type="button" id="close" aria-label="Close Inklu" autofocus><span aria-hidden="true">×</span></button>
            </div>
            <p class="tagline">Learning without barriers</p>
            <div class="lesson"><span class="eyebrow">Current lesson</span><p id="lesson-title"></p></div>
          </header>
          <div class="workspace">
            <p class="intro">Choose how you’d like to explore this lesson.</p>
            <div class="actions" role="group" aria-label="Lesson actions">
              <button type="button" data-action="simplify" aria-controls="reading">Explain Simply</button>
              <button type="button" data-action="translate" aria-controls="reading">Translate</button>
              <button type="button" data-action="describe" aria-controls="reading">Describe Visuals</button>
              <button type="button" data-action="tutor" aria-controls="reading">Ask Tutor</button>
            </div>
            <section id="reading" aria-labelledby="reading-title" hidden>
              <h3 id="reading-title">Lesson support</h3>
              <p id="reading-note" hidden></p>
              <div id="explanation" role="document" aria-labelledby="reading-title" tabindex="0" lang="en" hidden></div>
              <ol id="translation" aria-label="Translated passages" hidden></ol>
              <button type="button" id="describe-images" aria-controls="visuals" hidden>Describe images</button>
              <div id="visuals" role="document" aria-labelledby="reading-title" tabindex="0" lang="en" hidden></div>
              <div id="tutor-interface" hidden>
                <div class="tutor-toolbar">
                  <div class="tutor-speech-controls">
                    <button type="button" id="tutor-tts-toggle" class="tutor-tool-btn" aria-pressed="true" aria-label="Toggle voice responses" title="Read AI replies aloud">
                      <span aria-hidden="true" class="tutor-tool-icon">🔊</span> <span id="tutor-tts-label">Voice: On</span>
                    </button>
                    <div class="tutor-lang-wrap">
                      <label for="tutor-stt-lang" class="sr-only">Dictation Language</label>
                      <select id="tutor-stt-lang" aria-label="Dictation Language" title="Select Dictation Language">
                        <option value="en-US">EN (English)</option>
                        <option value="am-ET">AM (አማርኛ)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div id="tutor-messages" role="log" aria-live="polite" aria-label="Tutor conversation" dir="auto">
                  <div class="tutor-welcome" dir="auto">
                    <p>Ask any question about this lesson or career opportunities, and your AI tutor will explain it!</p>
                  </div>
                </div>
                <div id="tutor-loading" class="tutor-loading" role="status" aria-live="polite" hidden>
                  <span class="tutor-spinner" aria-hidden="true"></span>
                  <span class="tutor-loading-text">Tutor is thinking…</span>
                </div>
                <form id="tutor-form" aria-label="Ask a question">
                  <div class="tutor-input-row">
                    <input type="text" id="tutor-input" placeholder="Ask a question about this lesson or jobs…" aria-label="Question for tutor" autocomplete="off" dir="auto" />
                    <button type="button" id="tutor-mic" aria-label="Dictate question" title="Voice input (Speech to Text)" aria-pressed="false">
                      <span class="mic-icon" aria-hidden="true">🎤</span>
                    </button>
                    <button type="submit" id="tutor-submit">Ask</button>
                  </div>
                </form>
              </div>
            </section>
            <p class="sr-only" id="translation-status" role="status" aria-atomic="true"></p>
            <details hidden>
              <summary>Extracted lesson content (debug preview)</summary>
              <p id="preview-status" role="status" aria-atomic="true"></p>
              <div id="preview"></div>
            </details>
          </div>
          <span id="tab-end" tabindex="0" class="sr-only"></span>
        </dialog>`;

      if (window.InkluAmharicAudio) this.speech = new window.InkluAmharicAudio(root.getElementById('translation'),
        () => this.apiUrl('speech/listen'));
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      root.prepend(link);

      const toggle = root.getElementById('toggle');
      const panel = root.getElementById('panel');
      const details = root.querySelector('details');
      details.hidden = new URLSearchParams(location.search).get('inkluDebug') !== '1';
      this.requests = new Map();
      this.outcomes = new Map();
      this.ttsEnabled = true;
      this.tutorAudio = null;
      this.recognitionActive = false;
      this.recognition = null;
      root.getElementById('tutor-mic')?.addEventListener('click', () => this.toggleSpeechRecognition());
      root.getElementById('tutor-tts-toggle')?.addEventListener('click', () => this.toggleTTS());
      root.getElementById('describe-images').addEventListener('click', () => this.describeImages());
      root.getElementById('tutor-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = root.getElementById('tutor-input');
        const query = input.value.trim();
        if (!query) return;
        this.submitTutorQuestion(query);
      });
      for (const button of root.querySelectorAll('.actions button')) {
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => this.choose(button.dataset.action));
      }
      this.previewObserver = new MutationObserver((records) => {
        const lesson = this.findLesson();
        if (lesson !== this.previewLesson || records.some(({ target }) =>
          lesson && (lesson.contains(target) || target.contains(lesson)))) {
          this.refreshLesson(lesson);
        }
      });
      details.addEventListener('toggle', () => this.watchLesson());
      toggle.addEventListener('click', () => {
        panel.showModal();
        toggle.setAttribute('aria-expanded', 'true');
        this.watchLesson();
      });
      root.getElementById('close').addEventListener('click', () => panel.close());
      panel.addEventListener('close', () => {
        if (panel.open) return;
        this.stopTutorAudio();
        if (this.recognitionActive) {
          this.recognition?.stop();
          this.recognitionActive = false;
        }
        if (this.requests.has('describe')) {
          this.requests.get('describe').abort();
          this.requests.delete('describe');
          if (this.active === 'describe') {
            root.getElementById('reading').removeAttribute('aria-busy');
            this.notify('Select Describe images to continue.');
          }
        }
        this.speech?.deactivate();
        toggle.setAttribute('aria-expanded', 'false');
        this.watchLesson();
        if (this.isConnected) toggle.focus({ preventScroll: true });
      });
      // Keep Close first and this boundary last. The browser determines every
      // stop between them, including links, form fields and nested components.
      const close = root.getElementById('close');
      const end = root.getElementById('tab-end');
      let wrappingBack = false;
      end.addEventListener('focus', () => {
        if (!wrappingBack) close.focus();
      });
      close.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !event.shiftKey || event.defaultPrevented) return;
        wrappingBack = true;
        end.focus({ preventScroll: true });
        wrappingBack = false;
        // Let the native Shift+Tab move from the boundary to the last control.
      });
    }

    findLesson() {
      return window.InkluLessonContent?.findLesson(this, this.hostConfig);
    }

    apiUrl(route) {
      const base = new URL(this.getAttribute('api-base') ?? '/api/', location.href);
      const localHttp = base.protocol === 'http:' && (base.origin === location.origin ||
        ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
      if (!['http:', 'https:'].includes(location.protocol) || (base.protocol !== 'https:' && !localHttp) ||
          base.username || base.password || base.search || base.hash) throw new Error('Invalid API base');
      base.pathname = base.pathname.replace(/\/?$/, '/') + route;
      return base.href;
    }

    connectedCallback() {
      this.hostConfig = window.InkluLessonContent?.hostFor(this);
      this.watchLesson();
    }

    disconnectedCallback() {
      this.previewObserver.disconnect();
      this.clearReading();
    }

    watchLesson() {
      this.previewObserver.disconnect();
      if (!this.isConnected || !this.shadowRoot.getElementById('panel').open) return;

      this.refreshLesson(this.findLesson());
      this.previewObserver.observe(this.ownerDocument.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
    }

    refreshLesson(lesson) {
      const extracted = window.InkluLessonContent?.extractLesson(lesson, this.hostConfig);
      this.shadowRoot.getElementById('lesson-title').textContent = extracted?.title || 'Lesson unavailable';
      if (this.shadowRoot.querySelector('details').open) this.renderPreview(lesson);
      const source = lessonText(extracted);
      const images = extracted?.visuals ?? [];
      if (this.source !== undefined && (lesson !== this.previewLesson || source !== this.source ||
          JSON.stringify(images) !== JSON.stringify(this.images))) {
        this.clearReading('The lesson changed. Choose an action for the new lesson.');
      }
      this.source = source;
      this.images = images;
      this.previewLesson = lesson;
    }

    clearReading(message = '') {
      for (const request of this.requests.values()) request.abort();
      this.requests.clear();
      this.outcomes.clear();
      const root = this.shadowRoot;
      if (root.getElementById('reading').contains(root.activeElement)) {
        root.querySelector('.actions [aria-pressed="true"]')?.focus();
      }
      this.active = null;
      this.source = undefined;
      this.speech?.setTranslation('');
      for (const button of root.querySelectorAll('.actions button')) button.setAttribute('aria-pressed', 'false');
      this.stopTutorAudio();
      if (this.recognitionActive) {
        this.recognition?.stop();
        this.recognitionActive = false;
        const micBtn = root.getElementById('tutor-mic');
        micBtn?.setAttribute('aria-pressed', 'false');
        micBtn?.classList.remove('listening');
      }
      for (const id of ['translation', 'explanation', 'visuals']) root.getElementById(id).replaceChildren();
      const tutorMessages = root.getElementById('tutor-messages');
      if (tutorMessages) {
        tutorMessages.replaceChildren();
        const welcome = document.createElement('div');
        welcome.className = 'tutor-welcome';
        welcome.setAttribute('dir', 'auto');
        const p = document.createElement('p');
        p.textContent = 'Ask any question about this lesson or career opportunities, and your AI tutor will explain it!';
        welcome.append(p);
        tutorMessages.append(welcome);
      }
      const tutorLoading = root.getElementById('tutor-loading');
      if (tutorLoading) tutorLoading.hidden = true;
      const tutorInput = root.getElementById('tutor-input');
      if (tutorInput) { tutorInput.value = ''; tutorInput.disabled = false; }
      const tutorSubmit = root.getElementById('tutor-submit');
      if (tutorSubmit) tutorSubmit.disabled = false;
      const tutorInterface = root.getElementById('tutor-interface');
      if (tutorInterface) tutorInterface.hidden = true;
      root.getElementById('describe-images').textContent = 'Describe images';
      root.getElementById('reading').hidden = true;
      root.getElementById('reading').removeAttribute('aria-busy');
      this.notify(message);
    }

    notify(message, visible = true) {
      const root = this.shadowRoot;
      if (visible) {
        const note = root.getElementById('reading-note');
        note.textContent = message;
        note.hidden = !message;
      }
      const status = root.getElementById('translation-status');
      const announcement = root.getElementById('panel').open ? message : '';
      if (status.textContent !== announcement) status.textContent = announcement;
    }

    choose(action) {
      const root = this.shadowRoot;
      const reading = root.getElementById('reading');
      const passages = root.getElementById('translation');
      const note = root.getElementById('reading-note');
      if (this.active !== action) this.speech?.deactivate();
      this.active = action;
      for (const button of root.querySelectorAll('.actions button')) {
        button.setAttribute('aria-pressed', String(button.dataset.action === action));
      }
      reading.hidden = false;
      root.getElementById('reading-title').textContent = headings[action];
      passages.hidden = action !== 'translate';
      root.getElementById('explanation').hidden = action !== 'simplify' || !this.outcomes.has('simplify');
      const visuals = root.getElementById('visuals');
      visuals.hidden = action !== 'describe' || !visuals.childElementCount;
      root.getElementById('describe-images').hidden = action !== 'describe' || !this.images.some(image => image.asset);
      const tutorInterface = root.getElementById('tutor-interface');
      if (tutorInterface) tutorInterface.hidden = action !== 'tutor';
      note.hidden = true;
      reading.removeAttribute('aria-busy');
      if (action === 'tutor') {
        root.getElementById('tutor-input')?.focus();
        return;
      }
      if (action === 'describe') {
        if (this.requests.has(action)) {
          reading.setAttribute('aria-busy', 'true');
          this.notify('Describing lesson images…');
        } else if (this.outcomes.has(action)) this.notify('', false);
        else if (!this.images.length) this.notify('This lesson has no images to describe.');
        else if (!this.images.some(image => image.asset)) this.notify('This lesson has no supported local images.');
        else this.notify('Generate AI descriptions for the images in this lesson.');
        return;
      }
      if (this.requests.has(action)) {
        reading.setAttribute('aria-busy', 'true');
        this.notify(this.loadingMessage(action));
        return;
      }
      if (this.outcomes.has(action)) {
        this.notify(action === 'simplify' ? '' : this.outcomes.get(action), false);
        return;
      }
      this.requestText(action);
    }

    async describeImages() {
      if (this.requests.has('describe')) return;
      const root = this.shadowRoot;
      const visuals = root.getElementById('visuals');
      if (this.outcomes.has('describe')) {
        visuals.focus();
        return;
      }
      const reading = root.getElementById('reading');
      const controller = new AbortController();
      this.requests.set('describe', controller);
      reading.setAttribute('aria-busy', 'true');
      this.notify('Describing lesson images…');
      try {
        // Resume at the first unfinished image after a learner-initiated retry.
        for (let i = visuals.childElementCount; i < this.images.length; i++) {
          const { asset, context } = this.images[i];
          let description = 'This image is unavailable for description.';
          if (asset) {
            const response = await fetch(this.apiUrl('describe'), { method: 'POST', redirect: 'error',
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset, context }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]) });
            if (!response.ok) throw new Error();
            description = (await response.json()).description;
            if (typeof description !== 'string' || !description.trim()) throw new Error();
          }
          if (controller.signal.aborted) return;
          const section = document.createElement('section');
          const heading = document.createElement('h4');
          heading.textContent = 'Image ' + (i + 1);
          section.append(heading);
          renderExplanation(section, description, 4);
          visuals.append(section);
          visuals.hidden = this.active !== 'describe';
        }
        this.outcomes.set('describe', 'Image descriptions ready.');
        root.getElementById('describe-images').textContent = 'Read descriptions';
        this.notify('Image descriptions ready.', this.active === 'describe');
      } catch {
        if (!controller.signal.aborted) this.notify('Could not describe the image. Select Describe images to try again.', this.active === 'describe');
      } finally {
        if (this.requests.get('describe') === controller) {
          this.requests.delete('describe');
          if (this.active === 'describe') reading.removeAttribute('aria-busy');
        }
      }
    }

    loadingMessage(action) {
      return action === 'translate' ? 'Translating the lesson into Amharic…' : 'Preparing a simple explanation…';
    }

    async requestText(action) {
      const root = this.shadowRoot;
      const translating = action === 'translate';
      const subject = translating ? 'Translation' : 'Explanation';
      if (!this.source) {
        this.notify(translating ? 'No lesson text is available to translate.' : 'No lesson text is available to explain.');
        return;
      }
      if (!['http:', 'https:'].includes(location.protocol)) {
        this.notify('Open this lesson over HTTP or HTTPS to use this action.');
        return;
      }
      const controller = new AbortController();
      this.requests.set(action, controller);
      const reading = root.getElementById('reading');
      reading.setAttribute('aria-busy', 'true');
      this.notify(this.loadingMessage(action));
      const timer = setTimeout(() => controller.abort(), 90000);
      let message;
      try {
        const response = await fetch(this.apiUrl(action), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.source }), signal: controller.signal, redirect: 'error',
        });
        if (!response.ok) {
          const messages = {
            413: 'This lesson is too long for one request.',
            429: 'Too many requests. Wait a minute and try again.',
            503: subject + ' is unavailable. Try again later.',
            504: subject + ' timed out. You can try again.',
          };
          message = messages[response.status] || subject + ' failed. You can try again.';
          return;
        }
        const result = await response.json();
        if (this.requests.get(action) !== controller) return;
        const text = translating ? result.translation : result.explanation;
        if (typeof text !== 'string' || !text.trim()) throw new Error();
        if (translating) {
          if (this.speech) this.speech.setTranslation(text);
          else {
            for (const paragraph of text.split(/\n+/u)) {
              const item = document.createElement('li');
              item.lang = 'am';
              item.textContent = paragraph;
              root.getElementById('translation').append(item);
            }
          }
        } else {
          const explanation = root.getElementById('explanation');
          renderExplanation(explanation, text);
          explanation.hidden = this.active !== action;
        }
        message = translating ? 'Amharic translation ready.' : 'Simple explanation ready.';
        this.outcomes.set(action, message);
      } catch {
        message = controller.signal.aborted ? subject + ' timed out. You can try again.' :
          subject + ' failed. You can try again.';
      } finally {
        clearTimeout(timer);
        if (this.requests.get(action) === controller) {
          this.requests.delete(action);
          if (this.active === action) reading.removeAttribute('aria-busy');
          const readingThis = this.active === action;
          if (readingThis && this.outcomes.has(action)) root.getElementById('reading-note').hidden = true;
          this.notify(message, readingThis && !this.outcomes.has(action));
        }
      }
    }

    async submitTutorQuestion(query) {
      if (!query || typeof query !== 'string') return;
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;
      if (this.requests.has('tutor')) return;

      const root = this.shadowRoot;
      const messages = root.getElementById('tutor-messages');
      const input = root.getElementById('tutor-input');
      const submitBtn = root.getElementById('tutor-submit');
      const loading = root.getElementById('tutor-loading');
      const reading = root.getElementById('reading');
      const langSelect = root.getElementById('tutor-stt-lang');
      const lang = (langSelect?.value === 'am-ET' || /[\u1200-\u137F]/u.test(trimmedQuery)) ? 'am' : 'en';

      messages.querySelector('.tutor-welcome')?.remove();

      const userMsg = document.createElement('div');
      userMsg.className = 'tutor-message user-message';
      userMsg.setAttribute('dir', 'auto');
      const userSender = document.createElement('span');
      userSender.className = 'tutor-sender';
      userSender.textContent = 'You';
      const userText = document.createElement('p');
      userText.textContent = trimmedQuery;
      userMsg.append(userSender, userText);
      messages.append(userMsg);

      input.value = '';
      input.disabled = true;
      submitBtn.disabled = true;
      loading.hidden = false;
      reading.setAttribute('aria-busy', 'true');
      this.notify('Tutor is thinking…', false);
      messages.scrollTop = messages.scrollHeight;

      const controller = new AbortController();
      this.requests.set('tutor', controller);
      const timer = setTimeout(() => controller.abort(), 90000);
      let message;

      try {
        const response = await fetch(this.apiUrl('ai-tutor'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery, lang }),
          signal: controller.signal,
          redirect: 'error',
        });

        if (!response.ok) {
          throw new Error('Tutor unavailable');
        }

        const result = await response.json();
        if (this.requests.get('tutor') !== controller) return;

        const aiMsg = document.createElement('div');
        aiMsg.className = 'tutor-message ai-message';
        aiMsg.setAttribute('dir', 'auto');
        const aiSender = document.createElement('span');
        aiSender.className = 'tutor-sender';
        aiSender.textContent = 'AI Tutor';

        const audioSrc = result.audio_url || result.audio;
        const isCloudAudio = Boolean(result.is_cloud_audio);
        const speakBtn = document.createElement('button');
        speakBtn.type = 'button';
        speakBtn.className = 'tutor-speak-btn';
        speakBtn.setAttribute('aria-label', 'Read response aloud');
        speakBtn.setAttribute('title', 'Read aloud');
        speakBtn.innerHTML = '<span aria-hidden="true">🔊</span>';
        speakBtn.addEventListener('click', () => {
          this.playTutorAudio(audioSrc, result.answer || '', true, isCloudAudio);
        });
        aiSender.append(speakBtn);

        aiMsg.append(aiSender);

        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'tutor-body';
        renderExplanation(bodyContainer, result.answer || '');
        aiMsg.append(bodyContainer);

        if (result.citation || result.source_url) {
          const meta = document.createElement('div');
          meta.className = 'tutor-meta';
          if (result.citation) {
            const cit = document.createElement('span');
            cit.className = 'tutor-citation';
            cit.textContent = result.citation;
            meta.append(cit);
          }
          if (result.source_url) {
            const src = document.createElement('a');
            src.className = 'tutor-source';
            src.href = result.source_url;
            src.target = '_blank';
            src.rel = 'noopener';
            src.textContent = 'Source link';
            meta.append(src);
          }
          aiMsg.append(meta);
        }

        messages.append(aiMsg);
        message = 'Tutor answer ready.';
        this.outcomes.set('tutor', message);

        // Play audio automatically if voice is enabled
        this.playTutorAudio(audioSrc, result.answer || '', false, isCloudAudio);
      } catch {
        if (this.requests.get('tutor') !== controller) return;
        const errMsg = document.createElement('div');
        errMsg.className = 'tutor-message ai-message tutor-error';
        errMsg.setAttribute('dir', 'auto');
        const errSender = document.createElement('span');
        errSender.className = 'tutor-sender';
        errSender.textContent = 'AI Tutor';
        const errText = document.createElement('p');
        errText.textContent = controller.signal.aborted
          ? 'Tutor request timed out. Please try again.'
          : 'Tutor is unavailable. Please try again later.';
        errMsg.append(errSender, errText);
        messages.append(errMsg);
        message = 'Tutor request failed.';
      } finally {
        clearTimeout(timer);
        if (this.requests.get('tutor') === controller) {
          this.requests.delete('tutor');
          if (this.active === 'tutor') {
            reading.removeAttribute('aria-busy');
            loading.hidden = true;
            input.disabled = false;
            submitBtn.disabled = false;
            input.focus();
            messages.scrollTop = messages.scrollHeight;
          }
          this.notify(message, false);
        }
      }
    }

    stopTutorAudio() {
      if (this.tutorAudio) {
        this.tutorAudio.pause();
        this.tutorAudio.removeAttribute('src');
        this.tutorAudio.load();
        this.tutorAudio = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    playTutorAudio(audioSource, text = '', force = false, isCloudAudio = false) {
      if (!this.ttsEnabled && !force) return;
      this.stopTutorAudio();

      // Only attempt HTML5 Audio playback if real cloud audio was returned (mp3 or isCloudAudio true)
      const hasRealCloudAudio = Boolean(
        isCloudAudio ||
        (typeof audioSource === 'string' && (
          audioSource.startsWith('data:audio/mpeg') ||
          (audioSource.startsWith('http') && !audioSource.includes('/api/ai-tutor/audio/') && !audioSource.endsWith('.wav'))
        ))
      );

      if (hasRealCloudAudio && audioSource && typeof audioSource === 'string') {
        try {
          const audio = new Audio(audioSource);
          this.tutorAudio = audio;
          const playPromise = audio.play();
          if (playPromise) {
            playPromise.catch(err => {
              console.warn('HTML5 Audio playback failed, using SpeechSynthesis fallback:', err);
              if (text) this.speakWithSynthesis(text);
            });
          }
          return;
        } catch (err) {
          console.warn('Audio element error:', err);
        }
      }

      // In local/offline mode or if cloud audio is not available, synthesize speech
      if (text) {
        this.speakWithSynthesis(text);
      }
    }

    speakWithSynthesis(text) {
      if (!window.speechSynthesis) return;

      const cleanText = text
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/💡/g, '')
        .replace(/^[-*•]\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanText) return;

      window.speechSynthesis.cancel();
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance();
      const isAmharic = /[\u1200-\u137F]/u.test(cleanText);
      const voices = window.speechSynthesis.getVoices() || [];

      if (isAmharic) {
        const amharicVoice = voices.find(v =>
          (v.lang && (v.lang.startsWith('am') || v.lang.includes('ET'))) ||
          (v.name && /amharic|ameha|ashenafi|mekdes/i.test(v.name))
        );

        if (amharicVoice) {
          utterance.voice = amharicVoice;
          utterance.lang = 'am-ET';
          utterance.text = cleanText;
        } else {
          // If browser/OS lacks an Amharic voice, passing Ge'ez to English TTS produces silence.
          // Transliterate to phonetic Latin and use standard voice so Amharic speech is audibly spoken.
          utterance.lang = 'en-US';
          const englishVoice = voices.find(v =>
            (v.lang && (v.lang === 'en-US' || v.lang.startsWith('en'))) &&
            (v.name && /natural|google|jenny|guy|aria/i.test(v.name))
          ) || voices.find(v => v.lang && v.lang.startsWith('en'));
          if (englishVoice) utterance.voice = englishVoice;
          utterance.text = transliterateAmharicToPhonetic(cleanText);
        }
      } else {
        utterance.lang = 'en-US';
        const englishVoice = voices.find(v =>
          (v.lang && (v.lang === 'en-US' || v.lang.startsWith('en'))) &&
          (v.name && /natural|google|jenny|guy|aria/i.test(v.name))
        ) || voices.find(v => v.lang && v.lang.startsWith('en'));
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
        utterance.text = cleanText;
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }

    toggleTTS() {
      this.ttsEnabled = !this.ttsEnabled;
      const root = this.shadowRoot;
      const toggleBtn = root.getElementById('tutor-tts-toggle');
      const label = root.getElementById('tutor-tts-label');
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-pressed', String(this.ttsEnabled));
        if (label) label.textContent = this.ttsEnabled ? 'Voice: On' : 'Voice: Muted';
        const icon = toggleBtn.querySelector('.tutor-tool-icon');
        if (icon) icon.textContent = this.ttsEnabled ? '🔊' : '🔇';
      }
      if (!this.ttsEnabled) {
        this.stopTutorAudio();
      }
    }

    toggleSpeechRecognition() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        this.notify('Speech recognition is not supported in this browser.');
        return;
      }

      const root = this.shadowRoot;
      const micBtn = root.getElementById('tutor-mic');
      const input = root.getElementById('tutor-input');
      const langSelect = root.getElementById('tutor-stt-lang');
      const selectedLang = langSelect?.value || 'en-US';

      if (this.recognitionActive) {
        this.recognition?.stop();
        this.recognitionActive = false;
        micBtn?.setAttribute('aria-pressed', 'false');
        micBtn?.classList.remove('listening');
        return;
      }

      try {
        const recognition = new SpeechRec();
        this.recognition = recognition;
        recognition.lang = selectedLang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          this.recognitionActive = true;
          micBtn?.setAttribute('aria-pressed', 'true');
          micBtn?.classList.add('listening');
          input.placeholder = selectedLang === 'am-ET' ? 'እያዳመጥኩ ነው... (Listening in Amharic...)' : 'Listening… speak your question';
          this.notify(selectedLang === 'am-ET' ? 'በአማርኛ ይናገሩ (Listening in Amharic…)' : 'Listening… speak your question.', false);
        };

        recognition.onresult = event => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            input.value = transcript;
            input.focus();
          }
        };

        recognition.onerror = event => {
          console.warn('Speech recognition error:', event.error);
          this.recognitionActive = false;
          micBtn?.setAttribute('aria-pressed', 'false');
          micBtn?.classList.remove('listening');
          input.placeholder = 'Ask a question about this lesson or jobs…';
          if (event.error !== 'no-speech') {
            this.notify('Voice input error. You can type your question.');
          }
        };

        recognition.onend = () => {
          this.recognitionActive = false;
          micBtn?.setAttribute('aria-pressed', 'false');
          micBtn?.classList.remove('listening');
          input.placeholder = 'Ask a question about this lesson or jobs…';
        };

        recognition.start();
      } catch (err) {
        console.warn('Could not start speech recognition:', err);
        this.recognitionActive = false;
        micBtn?.setAttribute('aria-pressed', 'false');
        micBtn?.classList.remove('listening');
      }
    }

    requestTutor(query) {
      this.choose('tutor');
      if (typeof query === 'string' && query.trim()) {
        this.submitTutorQuestion(query.trim());
      }
    }

    renderPreview(lesson) {
      const extracted = window.InkluLessonContent?.extractLesson(lesson, this.hostConfig);
      const preview = this.shadowRoot.getElementById('preview');
      const next = preview.cloneNode(false);
      const title = document.createElement('h2');
      title.textContent = extracted?.title || 'Lesson title unavailable';
      next.append(title);
      const hasContent = Boolean(extracted?.content.textContent.trim());
      if (hasContent) next.append(extracted.content);
      const status = this.shadowRoot.getElementById('preview-status');
      const message = hasContent ? 'Preview updated for ' + (extracted.title || 'the untitled lesson') + '.' :
        'No lesson body is available to preview.';
      if (preview.isEqualNode(next) && status.textContent) return;
      preview.replaceChildren(...Array.from(next.childNodes));
      // Keep the long reading surface outside the live region.
      status.textContent = message;
    }
  }

  customElements.define('alx-learning-companion', LearningCompanion);
})();
