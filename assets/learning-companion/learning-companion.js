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
            <div role="tablist" aria-label="Learning modes">
              <button type="button" role="tab" id="tab-simple" aria-selected="false" aria-controls="simple" tabindex="-1"><i class="mode-icon lines" aria-hidden="true"></i>Simplify</button>
              <button type="button" role="tab" id="tab-amharic" aria-selected="true" aria-controls="amharic"><i class="mode-icon languages" aria-hidden="true">A<span>አ</span></i>Translate</button>
              <button type="button" role="tab" id="tab-visual" aria-selected="false" aria-controls="visual" tabindex="-1"><i class="mode-icon picture" aria-hidden="true"></i>Describe</button>
            </div>
            <section role="tabpanel" id="simple" aria-labelledby="tab-simple" tabindex="0" hidden>
              <h3>Simplified English</h3><div class="demo"><span class="eyebrow">Demo content</span><p></p></div>
            </section>
            <section role="tabpanel" id="amharic" aria-labelledby="tab-amharic">
              <div class="language-pair"><span>English</span><i aria-hidden="true">→</i><span lang="am">አማርኛ</span></div>
              <h3 tabindex="-1">Amharic translation</h3>
              <div id="translate-action">
                <p id="translation-help">Read this lesson in Amharic and listen to it one passage at a time.</p>
                <button type="button" id="translate" class="primary" aria-describedby="translation-help">Translate with Addis AI <span aria-hidden="true">→</span></button>
              </div>
              <p id="translation-status" role="status" aria-atomic="true"></p>
              <ol id="translation" aria-label="Translated passages"></ol>
            </section>
            <section role="tabpanel" id="visual" aria-labelledby="tab-visual" tabindex="0" hidden>
              <h3>Visual descriptions</h3><div class="demo"><span class="eyebrow">Demo content</span><p></p></div>
            </section>
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
      for (const [mode, sample] of Object.entries(demoResponses)) root.querySelector('#' + mode + ' .demo p').textContent = sample.text;
      this.previewObserver = new MutationObserver((records) => {
        const lesson = this.findLesson();
        if (lesson !== this.previewLesson || records.some(({ target }) =>
          lesson && (lesson.contains(target) || target.contains(lesson)))) {
          this.refreshLesson(lesson);
        }
      });
      details.addEventListener('toggle', () => this.watchLesson());
      root.getElementById('translate').addEventListener('click', () => this.translateLesson());
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
      const tabs = [...root.querySelectorAll('[role="tab"]')];
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
      const select = tab => {
        if (tab.getAttribute('aria-selected') === 'true') return;
        this.speech?.deactivate();
        for (const item of tabs) {
          const active = item === tab;
          item.setAttribute('aria-selected', String(active));
          item.tabIndex = active ? 0 : -1;
          root.getElementById(item.getAttribute('aria-controls')).hidden = !active;
        }
      };
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', event => {
          const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          select(tabs[next]);
          tabs[next].focus();
        });
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
      if (this.translationSource && (this.previewLesson !== lesson || this.translationSource !== lessonText(extracted))) {
        this.clearTranslation('The lesson changed. You can translate the new lesson.');
      }
      this.previewLesson = lesson;
    }

    clearTranslation(message = '') {
      this.request?.abort();
      this.request = null;
      this.translationSource = '';
      const root = this.shadowRoot;
      const restore = message && root.getElementById('translation').contains(root.activeElement);
      root.getElementById('translate-action').hidden = false;
      if (restore) root.getElementById('translate').focus();
      this.speech?.setTranslation('');
      root.getElementById('translate').removeAttribute('aria-disabled');
      root.getElementById('translation').removeAttribute('aria-busy');
      root.getElementById('translation').textContent = '';
      root.getElementById('translation-status').textContent = message;
      root.getElementById('translation-status').classList.remove('sr-only');
    }

    async translateLesson() {
      if (this.request) return;
      const root = this.shadowRoot;
      const status = root.getElementById('translation-status');
      this.clearTranslation();
      const text = lessonText(window.SavannaLessonContent?.extractLesson(this.findLesson()));
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
        if (this.speech) this.speech.setTranslation(translation);
        else {
          for (const paragraph of translation.split(/\n+/)) {
            const item = document.createElement('li');
            item.lang = 'am';
            item.textContent = paragraph;
            output.append(item);
          }
        }
        if (root.activeElement === button) root.querySelector('#amharic h3').focus();
        root.getElementById('translate-action').hidden = true;
        status.classList.add('sr-only');
        status.textContent = 'Amharic translation ready.';
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
