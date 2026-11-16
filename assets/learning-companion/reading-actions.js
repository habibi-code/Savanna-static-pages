(() => {
  'use strict';

  function renderExplanation(output, text, parentLevel = 3) {
    let list = null;
    for (const raw of text.split(/\r?\n/u)) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      const item = /^([-*]|\d+[.)])\s+(.+)/u.exec(line);
      if (item) {
        const tag = /^\d/u.test(item[1]) ? 'ol' : 'ul';
        if (list?.localName !== tag) {
          list = document.createElement(tag);
          list.className = 'passage-list';
          if (tag === 'ol') list.start = parseInt(item[1], 10);
          output.append(list);
        }
        const li = document.createElement('li');
        li.textContent = item[2].trim();
        list.append(li);
      } else {
        list = null;
        const heading = /^(#{1,6})\s*(.+?)(?:\s*#+)?$/u.exec(line);
        if (heading) {
          const level = Math.min(6, parentLevel + heading[1].length);
          const block = document.createElement('h' + level);
          block.className = level <= 4 ? 'passage-heading' : 'passage-subheading';
          block.textContent = heading[2].trim();
          output.append(block);
        } else {
          const block = document.createElement('p');
          block.className = 'passage-paragraph';
          block.textContent = line.replace(/^#{1,6}\s*/u, '').trim();
          output.append(block);
        }
      }
    }
  }

  async function describeImages(companion) {
    if (companion.requests.has('describe')) return;
    const root = companion.shadowRoot;
    const visuals = root.getElementById('visuals');
    if (companion.outcomes.has('describe')) {
      visuals.focus();
      return;
    }
    const reading = root.getElementById('reading');
    const controller = new AbortController();
    companion.requests.set('describe', controller);
    reading.setAttribute('aria-busy', 'true');
    companion.notify('Describing lesson images…');
    try {
      // Resume at the first unfinished image after a learner-initiated retry.
      for (let i = visuals.childElementCount; i < companion.images.length; i++) {
        const { asset, context } = companion.images[i];
        let description = 'This image is unavailable for description.';
        if (asset) {
          const response = await fetch(companion.apiUrl('describe'), { method: 'POST', redirect: 'error',
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
        visuals.hidden = companion.active !== 'describe';
      }
      companion.outcomes.set('describe', 'Image descriptions ready.');
      root.getElementById('describe-images').textContent = 'Read descriptions';
      companion.notify('Image descriptions ready.', companion.active === 'describe');
    } catch {
      if (!controller.signal.aborted) companion.notify('Could not describe the image. Select Describe images to try again.', companion.active === 'describe');
    } finally {
      if (companion.requests.get('describe') === controller) {
        companion.requests.delete('describe');
        if (companion.active === 'describe') reading.removeAttribute('aria-busy');
      }
    }
  }

  const LANGUAGE_NAMES = {
    am: 'Amharic',
    om: 'Afaan Oromo',
    ti: 'Tigrinya',
    en: 'English (Original lesson)',
  };

  const NATIVE_NAMES = LANGUAGE_NAMES;

  function loadingMessage(action, targetLanguage = 'am') {
    if (action !== 'translate') return 'Preparing a simple explanation…';
    const name = LANGUAGE_NAMES[targetLanguage] || 'selected language';
    return 'Translating the lesson into ' + name + '… Long lessons may take a few minutes.';
  }

  function renderSemanticSections(container, text, companion, targetLanguage = 'am', isEnglish = false) {
    container.setAttribute('lang', targetLanguage);
    container.setAttribute('dir', isEnglish ? 'ltr' : 'auto');

    const sections = companion?.sections || [];

    // Case 1: English (original lesson) with structured sections available
    if (isEnglish && sections.length > 0) {
      container.replaceChildren(...sections.map((section, sIndex) => {
        const card = document.createElement('li');
        card.className = 'passage passage-text-only passage-original';
        card.lang = 'en';
        card.dir = 'ltr';

        const headerRow = document.createElement('div');
        headerRow.className = 'passage-header-row';
        const label = document.createElement('span');
        label.className = 'passage-label';
        label.textContent = 'Section ' + String(sIndex + 1).padStart(2, '0');
        headerRow.append(label);
        card.append(headerRow);

        const body = document.createElement('div');
        body.className = 'passage-body';

        for (const block of section.blocks) {
          if (block.type === 'heading') {
            const h = document.createElement('h4');
            h.className = 'passage-heading';
            h.textContent = block.text;
            body.append(h);
          } else if (block.type === 'subheading') {
            const h = document.createElement('h5');
            h.className = 'passage-subheading';
            h.textContent = block.text;
            body.append(h);
          } else if (block.type === 'list') {
            const tag = block.listType === 'ol' ? 'ol' : 'ul';
            const list = document.createElement(tag);
            list.className = 'passage-list';
            if (tag === 'ol' && block.start) list.start = block.start;
            for (const item of block.items) {
              const li = document.createElement('li');
              li.textContent = item;
              list.append(li);
            }
            body.append(list);
          } else if (block.type === 'blockquote') {
            const bq = document.createElement('blockquote');
            bq.className = 'passage-quote';
            bq.textContent = block.text;
            body.append(bq);
          } else {
            const p = document.createElement('p');
            p.className = 'passage-paragraph';
            p.textContent = block.text;
            body.append(p);
          }
        }
        card.append(body);
        return card;
      }));
      return;
    }

    // Case 2: Translated or unsectioned text
    let rawPassages = text.split(/\n\n+/u).map(p => p.trim()).filter(Boolean);

    container.replaceChildren(...rawPassages.map((passage, index) => {
      const card = document.createElement('li');
      card.className = isEnglish ? 'passage passage-text-only passage-original' : 'passage passage-text-only';
      card.lang = targetLanguage;
      card.dir = isEnglish ? 'ltr' : 'auto';

      const headerRow = document.createElement('div');
      headerRow.className = 'passage-header-row';
      const label = document.createElement('span');
      label.className = 'passage-label';
      label.textContent = (isEnglish ? 'Section ' : 'Passage ') + String(index + 1).padStart(2, '0');
      headerRow.append(label);
      card.append(headerRow);

      const body = document.createElement('div');
      body.className = 'passage-body';

      renderExplanation(body, passage, 3);

      card.append(body);
      return card;
    }));
  }

  function renderTranslation(companion, targetLanguage = 'am') {
    const isEnglish = targetLanguage === 'en';
    const text = companion.translations?.get(targetLanguage) || (isEnglish ? companion.source : null);
    if (!text) return false;
    const root = companion.shadowRoot;
    const container = root.getElementById('translation');
    if (targetLanguage === 'am' && companion.speech) {
      container.setAttribute('lang', 'am');
      container.setAttribute('dir', 'auto');
      companion.speech.setTranslation(text);
    } else {
      companion.speech?.deactivate();
      renderSemanticSections(container, text, companion, targetLanguage, isEnglish);
    }
    const name = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const message = isEnglish ? 'Viewing original English lesson.' : (name + ' translation ready.');
    companion.outcomes.set('translate', message);
    companion.notify(message, companion.active === 'translate');
    const cur = root.getElementById('current-language');
    if (cur) cur.textContent = isEnglish ? 'Viewing original English lesson' : 'Translation ready: ' + name;
    const skipBtn = root.getElementById('skip-to-content');
    if (skipBtn) skipBtn.hidden = false;
    const reading = root.getElementById('reading');
    reading?.scrollTo?.({ top: 0, behavior: 'instant' });
    const workspace = root.querySelector('.workspace');
    workspace?.scrollTo?.({ top: 0, behavior: 'instant' });
    return true;
  }

  async function requestText(companion, action, targetLanguage, sourceLanguage) {
    const root = companion.shadowRoot;
    const translating = action === 'translate';
    const target = translating ? (targetLanguage || companion.targetLanguage || 'am') : undefined;
    const source = translating ? (sourceLanguage || companion.sourceLanguage || 'en') : undefined;
    const subject = translating ? 'Translation' : 'Explanation';
    if (!companion.source) {
      companion.notify(translating ? 'No lesson text is available to translate.' : 'No lesson text is available to explain.');
      return;
    }
    if (translating && target === 'en') {
      companion.translations?.set('en', companion.source);
      renderTranslation(companion, 'en');
      return;
    }
    if (!['http:', 'https:'].includes(location.protocol)) {
      companion.notify('Open this lesson over HTTP or HTTPS to use this action.');
      return;
    }
    const controller = new AbortController();
    companion.requests.set(action, controller);
    const reading = root.getElementById('reading');
    reading.setAttribute('aria-busy', 'true');
    const btn = root.getElementById('translate-button');
    const targetName = LANGUAGE_NAMES[target] || target;
    if (translating && btn) {
      btn.setAttribute('aria-busy', 'true');
      const btnLabel = btn.querySelector('.btn-label') || btn;
      btnLabel.textContent = 'Translating into ' + targetName + '…';
    }
    const cur = root.getElementById('current-language');
    if (translating && cur) {
      cur.textContent = 'Translating into ' + targetName + '… Long lessons may take a few minutes.';
    }
    const skipBtn = root.getElementById('skip-to-content');
    if (skipBtn) skipBtn.hidden = true;
    if (translating) {
      const container = root.getElementById('translation');
      if (container) {
        container.replaceChildren();
        const loadingCard = document.createElement('li');
        loadingCard.className = 'passage passage-loading';
        loadingCard.setAttribute('role', 'status');
        loadingCard.innerHTML = `
          <div class="loading-spinner" aria-hidden="true">
            <svg class="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
          </div>
          <h4 class="loading-title">Translating lesson into ${targetName}</h4>
          <p class="loading-desc">Translating with Addis AI. Long lessons may take a few minutes. Please wait…</p>`;
        container.append(loadingCard);
      }
    }
    companion.notify(loadingMessage(action, target));
    const timer = setTimeout(() => controller.abort(), 180000);
    let message;
    try {
      const requestBody = translating
        ? { text: companion.source, sourceLanguage: source, targetLanguage: target }
        : { text: companion.source };
      const response = await fetch(companion.apiUrl(action), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody), signal: controller.signal, redirect: 'error',
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
      if (companion.requests.get(action) !== controller) return;
      if (translating && companion.targetLanguage !== target) return;
      const text = translating ? result.translation : result.explanation;
      if (typeof text !== 'string' || !text.trim()) throw new Error();
      if (translating) {
        companion.translations?.set(target, text);
        renderTranslation(companion, target);
      } else {
        const explanation = root.getElementById('explanation');
        renderExplanation(explanation, text);
        explanation.hidden = companion.active !== action;
      }
      const name = LANGUAGE_NAMES[target] || target;
      message = translating ? (target === 'am' ? 'Amharic translation ready.' : name + ' translation ready.') : 'Simple explanation ready.';
      companion.outcomes.set(action, message);
    } catch {
      message = controller.signal.aborted ? subject + ' timed out. You can try again.' :
        subject + ' failed. You can try again.';
    } finally {
      clearTimeout(timer);
      if (translating && btn) {
        btn.removeAttribute('aria-busy');
        const currentTarget = companion.targetLanguage;
        const currentName = LANGUAGE_NAMES[currentTarget] || currentTarget;
        const btnLabel = btn.querySelector('.btn-label') || btn;
        btnLabel.textContent = currentTarget === 'en' ? 'View original lesson' : 'Translate into ' + currentName;
      }
      if (companion.requests.get(action) === controller) {
        companion.requests.delete(action);
        if (companion.active === action) reading.removeAttribute('aria-busy');
        const readingThis = companion.active === action;
        if (readingThis && companion.outcomes.has(action)) root.getElementById('reading-note').hidden = true;
        companion.notify(message, readingThis && !companion.outcomes.has(action));
        if (translating && !companion.outcomes.has(action)) {
          if (cur && message) cur.textContent = message;
          const container = root.getElementById('translation');
          if (container && container.querySelector('.passage-loading')) {
            container.replaceChildren();
            const retryCard = document.createElement('li');
            retryCard.className = 'passage passage-error';
            const title = document.createElement('h4');
            title.className = 'error-title';
            title.textContent = 'Translation incomplete';
            const desc = document.createElement('p');
            desc.className = 'error-desc';
            desc.textContent = message || 'Translation failed. You can try again.';
            retryCard.append(title, desc);
            container.append(retryCard);
          }
        }
      }
    }
  }

  window.InkluReadingActions = { describeImages, loadingMessage, requestText, renderTranslation, renderSemanticSections, LANGUAGE_NAMES, NATIVE_NAMES };
})();
