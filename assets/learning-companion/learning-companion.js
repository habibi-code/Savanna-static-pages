(() => {
  'use strict';

  if (customElements.get('alx-learning-companion')) return;

  const stylesheet = new URL('learning-companion.css', document.currentScript.src).href;
  const headings = { simplify: 'Simple explanation', translate: 'Amharic translation',
    describe: 'Visual descriptions' };

  function renderExplanation(output, text) {
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
        const block = document.createElement(heading ? 'h' + Math.min(6, 3 + heading[1].length) : 'p');
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
            </div>
            <section id="reading" aria-labelledby="reading-title" hidden>
              <h3 id="reading-title">Lesson support</h3>
              <p id="reading-note" hidden></p>
              <div id="explanation" role="document" aria-labelledby="reading-title" tabindex="0" lang="en" hidden></div>
              <ol id="translation" aria-label="Translated passages" hidden></ol>
              <ul id="visuals" hidden></ul>
            </section>
            <p class="sr-only" id="translation-status" role="status" aria-atomic="true"></p>
            <details hidden>
              <summary>Extracted lesson content (debug preview)</summary>
              <p id="preview-status" role="status" aria-atomic="true"></p>
              <div id="preview"></div>
            </details>
          </div>
        </dialog>`;

      if (window.InkluAmharicAudio) this.speech = new window.InkluAmharicAudio(root.getElementById('translation'));
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
        this.speech?.deactivate();
        toggle.setAttribute('aria-expanded', 'false');
        this.watchLesson();
        if (this.isConnected) toggle.focus({ preventScroll: true });
      });
      panel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const stops = [...panel.querySelectorAll('button, summary, [tabindex="0"]')]
          .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length);
        const edge = event.shiftKey ? stops[0] : stops.at(-1);
        if (root.activeElement === edge) {
          event.preventDefault();
          (event.shiftKey ? stops.at(-1) : stops[0]).focus();
        }
      });
    }

    findLesson() {
      return this.closest('#curriculum_navigation_content') ||
        this.ownerDocument.getElementById('curriculum_navigation_content');
    }

    connectedCallback() {
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
        attributeFilter: ['id', 'class', 'style', 'role', 'hidden', 'inert', 'aria-hidden',
          'lang', 'alt', 'aria-label', 'start', 'reversed', 'value'],
      });
    }

    refreshLesson(lesson) {
      const extracted = window.SavannaLessonContent?.extractLesson(lesson);
      this.shadowRoot.getElementById('lesson-title').textContent = extracted?.title || 'Lesson unavailable';
      if (this.shadowRoot.querySelector('details').open) this.renderPreview(lesson);
      const source = lessonText(extracted);
      if (this.source !== undefined && (lesson !== this.previewLesson || source !== this.source)) {
        this.clearReading('The lesson changed. Choose an action for the new lesson.');
      }
      this.source = source;
      this.images = extracted?.images ?? [];
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
      for (const id of ['translation', 'explanation', 'visuals']) root.getElementById(id).replaceChildren();
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
      visuals.hidden = action !== 'describe';
      note.hidden = true;
      reading.removeAttribute('aria-busy');
      if (action === 'describe') {
        visuals.replaceChildren(...this.images.map(label => {
          const item = document.createElement('li');
          item.textContent = label;
          return item;
        }));
        this.notify(this.images.length ? 'Image descriptions ready.' : 'This lesson has no images to describe.', !this.images.length);
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
        this.notify('Open this lesson through the local Savanna server to use this action.');
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
        const response = await fetch('/api/' + action, {
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

    renderPreview(lesson) {
      const extracted = window.SavannaLessonContent?.extractLesson(lesson);
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
