(() => {
  'use strict';

  if (customElements.get('alx-learning-companion')) return;

  const stylesheet = new URL('learning-companion.css', document.currentScript.src).href;
  const demoResponses = {
    simple: {
      lang: 'en',
      text: 'Virtual assistants help people and businesses online. They can use software to draft an email or plan a meeting. People still need to check the work and decide what to do.',
    },
    amharic: {
      lang: 'am',
      text: 'የምናባዊ ረዳቶች ሥራ እየተለወጠ ነው። አዳዲስ መሣሪያዎች ኢሜይል ለመጻፍና ስብሰባ ለማቀድ ይረዳሉ። ከደንበኞች ጋር በግልጽ መነጋገርም አስፈላጊ ነው።',
    },
    visual: {
      lang: 'en',
      text: 'The lesson compares two lists side by side. The left lists tasks software can help with, such as drafting emails. The right lists work that needs a person, such as listening to clients and deciding which task comes first.',
    },
  };

  class LearningCompanion extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <button type="button" id="toggle" aria-expanded="false" aria-controls="panel">
          Learning companion
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
          <details>
            <summary>Extracted lesson content (debug preview)</summary>
            <p id="preview-status" role="status" aria-atomic="true"></p>
            <div id="preview"></div>
          </details>
        </section>`;

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
          this.renderPreview(lesson);
        }
      });
      details.addEventListener('toggle', () => this.watchPreview());
      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        this.watchPreview();
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
      this.watchPreview();
    }

    disconnectedCallback() {
      this.previewObserver.disconnect();
    }

    watchPreview() {
      this.previewObserver.disconnect();
      if (!this.isConnected || this.shadowRoot.getElementById('panel').hidden ||
          !this.shadowRoot.querySelector('details').open) return;

      this.renderPreview(this.findLesson());
      this.previewObserver.observe(this.ownerDocument.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['id', 'class', 'style', 'role', 'hidden', 'inert', 'aria-hidden',
          'lang', 'alt', 'aria-label', 'start', 'reversed', 'value'],
      });
    }

    renderPreview(lesson) {
      this.previewLesson = lesson;
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
