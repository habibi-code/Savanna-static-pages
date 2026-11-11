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
        </section>`;

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      root.prepend(link);

      const toggle = root.getElementById('toggle');
      const panel = root.getElementById('panel');
      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
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
        label.textContent = 'Demo content';
        const sample = document.createElement('p');
        sample.lang = response.lang;
        sample.textContent = response.text;
        result.replaceChildren(label, sample);
      });
    }
  }

  customElements.define('alx-learning-companion', LearningCompanion);
})();
