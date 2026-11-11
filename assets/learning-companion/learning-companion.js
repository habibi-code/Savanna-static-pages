(() => {
  'use strict';

  if (customElements.get('alx-learning-companion')) return;

  const stylesheet = new URL('learning-companion.css', document.currentScript.src).href;
  const demoResponses = {
    simple: {
      lang: 'en',
      text: 'Virtual assistants help people and businesses online. They can use software to draft an email or plan a meeting. People still need to check the work and decide what to do.',
    },
    visual: {
      lang: 'en',
      text: 'The lesson compares two lists side by side. The left lists tasks software can help with, such as drafting emails. The right lists work that needs a person, such as listening to clients and deciding which task comes first.',
    },
  };

  function lessonText(lesson) {
    const extracted = window.SavannaLessonContent?.extractLesson(lesson);
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
        <button type="button" id="toggle" aria-expanded="false" aria-controls="panel">
          Inklu — Learning without barriers
        </button>
        <section id="panel" aria-labelledby="toggle" hidden>
          <fieldset>
            <legend>Choose a lesson format</legend>
            <div class="choices">
              <label><input type="radio" name="format" value="simple"> Simplified English</label>
              <label><input type="radio" name="format" value="amharic"> <span>Amharic (<span lang="am">አማርኛ</span>)</span></label>
              <label><input type="radio" name="format" value="visual"> Visual content descriptions</label>
            </div>
          </fieldset>
          <div class="result" role="status" aria-atomic="true"></div>
          <div id="amharic" hidden>
            <p id="translation-help">Send the current lesson text to Addis AI for translation.</p>
            <button type="button" id="translate" aria-describedby="translation-help">Translate lesson</button>
            <p id="translation-status" role="status" aria-atomic="true"></p>
            <div id="translation" lang="am" dir="auto"></div>
            <div id="speech"></div>
          </div>
          <details>
            <summary>Extracted lesson content (debug preview)</summary>
            <p id="preview-status" role="status" aria-atomic="true"></p>
            <div id="preview"></div>
          </details>
        </section>`;

      if (window.InkluAmharicAudio) this.speech = new window.InkluAmharicAudio(root.getElementById('speech'));
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      root.prepend(link);

      const toggle = root.getElementById('toggle');
      const panel = root.getElementById('panel');
      const details = root.querySelector('details');
      this.previewObserver = new MutationObserver((records) => {
        const lesson = this.findLesson();
        if (lesson !== this.previewLesson || records.some(({ target }) =>
          lesson && (lesson.contains(target) || target.contains(lesson)))) {
          this.refreshLesson(lesson);
        }
      });
      details.addEventListener('toggle', () => this.watchLesson());
      root.getElementById('translate').addEventListener('click', () => this.translateLesson());
      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (!open) this.clearTranslation();
        this.watchLesson();
      };
      toggle.addEventListener('click', () => setOpen(panel.hidden));
      root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || panel.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        toggle.focus();
      });

      const result = root.querySelector('.result');
      panel.addEventListener('change', (event) => {
        if (!event.target.matches('input[name="format"]')) return;
        const amharic = event.target.value === 'amharic';
        this.clearTranslation();
        root.getElementById('amharic').hidden = !amharic;
        this.watchLesson();
        if (amharic) {
          result.replaceChildren();
          return;
        }
        const response = demoResponses[event.target.value];
        const label = document.createElement('strong');
        label.textContent = 'Demo content (fixed example)';
        const sample = document.createElement('p');
        sample.lang = response.lang;
        sample.textContent = response.text;
        result.replaceChildren(label, sample);
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
      this.clearTranslation();
    }

    watchLesson() {
      this.previewObserver.disconnect();
      if (!this.isConnected || this.shadowRoot.getElementById('panel').hidden ||
          !(this.shadowRoot.querySelector('details').open || this.translationSource)) return;

      this.refreshLesson(this.findLesson());
      this.previewObserver.observe(this.ownerDocument.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['id', 'class', 'style', 'role', 'hidden', 'inert', 'aria-hidden',
          'lang', 'alt', 'aria-label', 'start', 'reversed', 'value'],
      });
    }

    refreshLesson(lesson) {
      if (this.translationSource && (this.previewLesson !== lesson || this.translationSource !== lessonText(lesson))) {
        this.clearTranslation('The lesson changed. Choose Translate lesson to translate the current text.');
      }
      this.previewLesson = lesson;
      if (this.shadowRoot.querySelector('details').open) this.renderPreview(lesson);
    }

    clearTranslation(message = '') {
      this.request?.abort();
      this.request = null;
      this.translationSource = '';
      const root = this.shadowRoot;
      if (message && root.getElementById('speech').contains(root.activeElement)) root.getElementById('translate').focus();
      this.speech?.setTranslation('');
      root.getElementById('translate').removeAttribute('aria-disabled');
      root.getElementById('translation').removeAttribute('aria-busy');
      root.getElementById('translation').textContent = '';
      root.getElementById('translation-status').textContent = message;
    }

    async translateLesson() {
      if (this.request) return;
      const root = this.shadowRoot;
      const status = root.getElementById('translation-status');
      this.clearTranslation();
      const text = lessonText(this.findLesson());
      if (!text) { status.textContent = 'No lesson text is available to translate.'; return; }
      if (!['http:', 'https:'].includes(location.protocol)) {
        status.textContent = 'Open this lesson through the local Savanna server to use translation.';
        return;
      }
      const controller = new AbortController();
      this.request = controller;
      this.translationSource = text;
      this.previewLesson = this.findLesson();
      this.watchLesson();
      const output = root.getElementById('translation');
      const button = root.getElementById('translate');
      button.setAttribute('aria-disabled', 'true');
      output.setAttribute('aria-busy', 'true');
      status.textContent = 'Translating the lesson into Amharic…';
      // Leave focus on the action, including during a request or after an error.
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const response = await fetch('/api/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }), signal: controller.signal, redirect: 'error',
        });
        if (this.request !== controller) return;
        if (!response.ok) {
          const messages = {
            413: 'This lesson is too long for one translation request.',
            429: 'Too many translation requests. Wait a minute and try again.',
            503: 'Translation is unavailable. Check the server configuration and credit, then try again.',
            504: 'Translation timed out. You can try again.',
          };
          status.textContent = messages[response.status] || 'Translation failed. You can try again.';
          return;
        }
        const { translation } = await response.json();
        if (this.request !== controller) return;
        if (typeof translation !== 'string' || !translation.trim()) throw new Error();
        output.textContent = translation;
        this.speech?.setTranslation(translation);
        status.textContent = 'Amharic translation ready. Read it below.';
      } catch {
        if (this.request === controller) status.textContent = controller.signal.aborted
          ? 'Translation timed out. You can try again.' : 'Could not reach the translation service. You can try again.';
      } finally {
        clearTimeout(timer);
        if (this.request === controller) {
          this.request = null;
          button.removeAttribute('aria-disabled');
          output.removeAttribute('aria-busy');
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
