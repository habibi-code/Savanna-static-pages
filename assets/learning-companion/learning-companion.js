(() => {
  'use strict';

  if (customElements.get('alx-learning-companion')) return;

  const stylesheet = new URL('learning-companion.css', document.currentScript.src).href;
  const headings = { simplify: 'Simple explanation', translate: 'Translation',
    describe: 'Visual descriptions', help: 'Human Help' };

  function lessonText(extracted) {
    if (!extracted) return '';
    if (extracted.sections?.length) {
      const parts = extracted.sections.map(section => {
        const lines = [];
        for (const block of section.blocks) {
          if (block.type === 'heading') {
            lines.push('# ' + block.text);
          } else if (block.type === 'subheading') {
            lines.push('## ' + block.text);
          } else if (block.type === 'list') {
            const prefix = block.listType === 'ol' ? (i => `${(block.start || 1) + i}. `) : (() => '- ');
            for (let i = 0; i < block.items.length; i++) {
              lines.push(prefix(i) + block.items[i]);
            }
          } else if (block.type === 'paragraph' || block.type === 'blockquote' || block.type === 'caption') {
            lines.push(block.text);
          }
        }
        return lines.join('\n');
      });
      const body = parts.filter(Boolean).join('\n\n');
      if (extracted.title && !body.startsWith('# ' + extracted.title) && !body.startsWith('## ' + extracted.title)) {
        return [extracted.title, body].filter(Boolean).join('\n\n');
      }
      return body;
    }
    // Serialize only the extractor's detached fragment. Preserve inline words and block breaks.
    const walker = document.createTreeWalker(extracted.content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.data = walker.currentNode.data.replace(/\s+/gu, ' ');
    for (const block of extracted.content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,br,div,figure,figcaption,blockquote')) {
      block.before('\n');
      block.after('\n');
    }
    const body = extracted.content.textContent.split('\n').map(line => line.trim()).filter(Boolean).join('\n\n');
    return body ? [extracted.title, body].filter(Boolean).join('\n\n') : '';
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
              <button type="button" data-action="help" aria-controls="reading">Human Help</button>
              <button type="button" data-action="describe" aria-controls="reading">Describe Visuals</button>
            </div>
            <section id="reading" aria-labelledby="reading-title" hidden>
              <h3 id="reading-title">Lesson support</h3>
              <p id="reading-note" hidden></p>
              <button type="button" id="request-help" hidden>Request human help</button>
              <div id="explanation" role="document" aria-labelledby="reading-title" tabindex="0" lang="en" hidden></div>
              <div id="translation-controls" class="translation-controls" hidden>
                <div class="translation-picker-card">
                  <div class="picker-header">
                    <label for="target-language" class="picker-label">Translate lesson to</label>
                    <span id="current-language-badge" class="current-lang-pill" aria-hidden="true">Amharic</span>
                  </div>
                  <div class="select-container">
                    <select id="target-language" class="language-dropdown" aria-label="Target language">
                      <option value="am" selected>Amharic</option>
                      <option value="om">Afaan Oromo</option>
                      <option value="ti">Tigrinya</option>
                      <option value="en">English (Original lesson)</option>
                    </select>
                    <span class="dropdown-chevron" aria-hidden="true">
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1.5 1.75L6 6.25L10.5 1.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                  </div>
                  <button type="button" id="translate-button" class="primary-translate-btn" aria-label="Translate lesson">
                    <span class="btn-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
                    </span>
                    <span class="btn-label">Translate into Amharic</span>
                  </button>
                  <button type="button" id="skip-to-content" class="skip-content-btn" hidden>
                    Skip to translated content
                  </button>
                  <p id="current-language" class="status-message" aria-live="polite">Selected language: Amharic</p>
                </div>
              </div>
              <ol id="translation" aria-label="Translated passages" hidden></ol>
              <button type="button" id="describe-images" aria-controls="visuals" hidden>Describe images</button>
              <div id="visuals" role="document" aria-labelledby="reading-title" tabindex="0" lang="en" hidden></div>
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
      this._targetLanguage = 'am';
      this.sourceLanguage = 'en';
      this.translations = new Map();
      this.requests = new Map();
      this.outcomes = new Map();
      const languageSelect = root.getElementById('target-language');
      languageSelect.addEventListener('change', () => {
        this.setTargetLanguage(languageSelect.value, true);
      });
      root.getElementById('translate-button').addEventListener('click', () => {
        if (this.targetLanguage === 'en') {
          this.translations.set('en', this.source);
          window.InkluReadingActions.renderTranslation(this, 'en');
        } else {
          window.InkluReadingActions.requestText(this, 'translate', this.targetLanguage, this.sourceLanguage);
        }
      });
      root.getElementById('skip-to-content')?.addEventListener('click', () => {
        const container = root.getElementById('translation');
        const target = container.querySelector('.passage-heading, .passage-subheading, p[lang], .passage');
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: false });
        }
      });
      root.getElementById('request-help').addEventListener('click', () => window.InkluHumanHelp.requestHumanHelp(this));
      root.getElementById('describe-images').addEventListener('click', () => window.InkluReadingActions.describeImages(this));
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

    setTargetLanguage(lang, userInitiated = true) {
      if (!['en', 'am', 'om', 'ti'].includes(lang)) return;
      this._targetLanguage = lang;
      const root = this.shadowRoot;
      if (root) {
        const select = root.getElementById('target-language');
        if (select && select.value !== lang) select.value = lang;
        const displayName = window.InkluReadingActions?.LANGUAGE_NAMES[lang] || lang;
        const badge = root.getElementById('current-language-badge');
        if (badge) badge.textContent = displayName;
        const btn = root.getElementById('translate-button');
        const btnLabel = btn?.querySelector('.btn-label') || btn;
        if (btnLabel) {
          if (lang === 'en') {
            btnLabel.textContent = 'View original lesson';
            btn?.setAttribute('aria-label', 'View original lesson');
          } else {
            btnLabel.textContent = 'Translate into ' + displayName;
            btn?.setAttribute('aria-label', 'Translate lesson');
          }
        }
        const skipBtn = root.getElementById('skip-to-content');
        const currentDisplay = root.getElementById('current-language');
        if (lang === 'en') {
          if (currentDisplay) currentDisplay.textContent = 'Viewing original English lesson';
          if (userInitiated) {
            this.translations.set('en', this.source);
            window.InkluReadingActions?.renderTranslation(this, 'en');
          }
        } else {
          if (this.translations.has(lang)) {
            if (currentDisplay) currentDisplay.textContent = 'Translation ready: ' + displayName;
            if (userInitiated) window.InkluReadingActions?.renderTranslation(this, lang);
          } else {
            if (skipBtn) skipBtn.hidden = true;
            if (currentDisplay) currentDisplay.textContent = 'Selected language: ' + displayName;
            if (userInitiated) {
              this.speech?.deactivate();
              const container = root.getElementById('translation');
              container.replaceChildren();
              if (this.requests.has('translate')) {
                const loadingCard = document.createElement('li');
                loadingCard.className = 'passage passage-loading';
                loadingCard.setAttribute('role', 'status');
                loadingCard.innerHTML = `
                  <div class="loading-spinner" aria-hidden="true">
                    <svg class="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  </div>
                  <h4 class="loading-title">Translating lesson into ${displayName}</h4>
                  <p class="loading-desc">Translating with Addis AI. Long lessons may take a few minutes. Please wait…</p>`;
                container.append(loadingCard);
              } else {
                const readyCard = document.createElement('div');
                readyCard.className = 'translation-ready-card';
                readyCard.innerHTML = `
                  <div class="ready-icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
                  </div>
                  <h4 class="ready-title">Ready to translate</h4>
                  <p class="ready-desc">Click "Translate into ${displayName}" above to translate the lesson using Addis AI.</p>`;
                container.append(readyCard);
              }
              this.notify('Selected ' + displayName + '. Choose Translate to translate the lesson.');
            }
          }
        }
      }
    }

    get targetLanguage() {
      return this._targetLanguage || 'am';
    }

    set targetLanguage(lang) {
      this.setTargetLanguage(lang, false);
    }

    static get observedAttributes() {
      return ['target-language', 'source-language'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (name === 'target-language' && newValue) {
        this.setTargetLanguage(newValue, false);
      }
      if (name === 'source-language' && newValue) {
        this.sourceLanguage = newValue;
      }
    }

    connectedCallback() {
      this.sourceLanguage = this.getAttribute('source-language') || 'en';
      const target = this.getAttribute('target-language') || 'am';
      this.setTargetLanguage(target, false);
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
      this.extracted = extracted;
      this.sections = extracted?.sections ?? [];
      this.source = source;
      this.images = images;
      this.previewLesson = lesson;
    }

    clearReading(message = '') {
      for (const request of this.requests.values()) request.abort();
      this.requests.clear();
      this.outcomes.clear();
      this.translations?.clear();
      this.setTargetLanguage(this.getAttribute('target-language') || 'am', false);
      const root = this.shadowRoot;
      if (root) {
        const controls = root.getElementById('translation-controls');
        if (controls) controls.hidden = true;
        const skipBtn = root.getElementById('skip-to-content');
        if (skipBtn) skipBtn.hidden = true;
      }
      if (root.getElementById('reading').contains(root.activeElement)) {
        root.querySelector('.actions [aria-pressed="true"]')?.focus();
      }
      this.active = null;
      this.source = undefined;
      this.speech?.setTranslation('');
      for (const button of root.querySelectorAll('.actions button')) button.setAttribute('aria-pressed', 'false');
      for (const id of ['translation', 'explanation', 'visuals']) root.getElementById(id).replaceChildren();
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
      const translationControls = root.getElementById('translation-controls');
      if (translationControls) translationControls.hidden = action !== 'translate';
      passages.hidden = action !== 'translate';
      root.getElementById('explanation').hidden = action !== 'simplify' || !this.outcomes.has('simplify');
      const visuals = root.getElementById('visuals');
      visuals.hidden = action !== 'describe' || !visuals.childElementCount;
      root.getElementById('describe-images').hidden = action !== 'describe' || !this.images.some(image => image.asset);
      root.getElementById('request-help').hidden = action !== 'help' || this.hasAttribute('help-unavailable');
      note.hidden = true;
      reading.removeAttribute('aria-busy');
      if (action === 'help') {
        if (this.hasAttribute('help-unavailable')) {
          this.notify('Human Help is unavailable in this public demo.');
          return;
        }
        this.notify(this.outcomes.get(action) ?? (this.requests.has(action) ? 'Sending your help request…' :
          'Ask your LMS support team to follow up. Your screen stays private.'));
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
      if (action === 'translate') {
        if (this.targetLanguage === 'en') {
          this.translations.set('en', this.source);
          window.InkluReadingActions.renderTranslation(this, 'en');
          return;
        }
        if (this.requests.has('translate')) {
          reading.setAttribute('aria-busy', 'true');
          this.notify(window.InkluReadingActions.loadingMessage('translate', this.targetLanguage));
          return;
        }
        if (this.translations?.has(this.targetLanguage)) {
          window.InkluReadingActions.renderTranslation(this, this.targetLanguage);
          this.notify('', false);
          return;
        }
        // Never start translation automatically when opening Translate mode.
        // Show the ready state and wait for the learner to activate the Translate button.
        this.speech?.deactivate();
        const container = root.getElementById('translation');
        container.replaceChildren();
        const skipBtn = root.getElementById('skip-to-content');
        if (skipBtn) skipBtn.hidden = true;
        const displayName = window.InkluReadingActions?.LANGUAGE_NAMES[this.targetLanguage] || this.targetLanguage;
        const readyCard = document.createElement('div');
        readyCard.className = 'translation-ready-card';
        readyCard.innerHTML = `
          <div class="ready-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
          </div>
          <h4 class="ready-title">Ready to translate</h4>
          <p class="ready-desc">Select your language and choose "Translate into ${displayName}" above to begin.</p>`;
        container.append(readyCard);
        this.notify('Selected ' + displayName + '. Choose Translate to translate the lesson.');
        return;
      }
      if (this.requests.has(action)) {
        reading.setAttribute('aria-busy', 'true');
        this.notify(window.InkluReadingActions.loadingMessage(action));
        return;
      }
      if (this.outcomes.has(action)) {
        this.notify(action === 'simplify' ? '' : this.outcomes.get(action), false);
        return;
      }
      window.InkluReadingActions.requestText(this, action);
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

  function register() {
    if (!customElements.get('alx-learning-companion')) customElements.define('alx-learning-companion', LearningCompanion);
  }

  // Older three-script embeds can load the new siblings without editing host HTML.
  const missing = [];
  if (!window.InkluReadingActions) missing.push('reading-actions.js');
  if (!window.InkluHumanHelp) missing.push('human-help.js');
  if (!missing.length) register();
  else {
    for (const name of missing) {
      const script = document.createElement('script');
      script.src = new URL(name, stylesheet).href;
      script.nonce = document.currentScript.nonce;
      script.onload = () => { if (window.InkluReadingActions && window.InkluHumanHelp) register(); };
      document.head.append(script);
    }
  }
})();
