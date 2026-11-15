(() => {
  'use strict';

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
    om: 'Afaan Oromoo',
    ti: 'Tigrinya',
    en: 'English',
  };

  const NATIVE_NAMES = {
    am: 'አማርኛ',
    om: 'Afaan Oromoo',
    ti: 'ትግርኛ',
    en: 'English',
  };

  function loadingMessage(action, targetLanguage = 'am') {
    if (action !== 'translate') return 'Preparing a simple explanation…';
    const name = LANGUAGE_NAMES[targetLanguage] || 'selected language';
    return 'Translating the lesson into ' + name + '…';
  }

  function renderTranslation(companion, targetLanguage = 'am') {
    const text = companion.translations?.get(targetLanguage);
    if (!text) return false;
    const root = companion.shadowRoot;
    if (targetLanguage === 'am' && companion.speech) {
      companion.speech.setTranslation(text);
    } else {
      companion.speech?.deactivate();
      const passages = text.split(/\n\n+/u).map(p => p.trim()).filter(Boolean);
      const container = root.getElementById('translation');
      container.replaceChildren(...passages.map((passage, index) => {
        const card = document.createElement('li');
        card.className = 'passage passage-text-only';
        card.lang = targetLanguage;
        card.dir = 'auto';
        const label = document.createElement('span');
        label.className = 'passage-label';
        label.textContent = 'Passage ' + String(index + 1).padStart(2, '0');
        card.append(label);
        const body = document.createElement('div');
        body.className = 'passage-body';
        renderExplanation(body, passage, 3);
        card.append(body);
        return card;
      }));
    }
    const name = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const message = targetLanguage === 'am' ? 'Amharic translation ready.' : name + ' translation ready.';
    companion.outcomes.set('translate', message);
    companion.notify(message, companion.active === 'translate');
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
    if (!['http:', 'https:'].includes(location.protocol)) {
      companion.notify('Open this lesson over HTTP or HTTPS to use this action.');
      return;
    }
    const controller = new AbortController();
    companion.requests.set(action, controller);
    const reading = root.getElementById('reading');
    reading.setAttribute('aria-busy', 'true');
    companion.notify(loadingMessage(action, target));
    const timer = setTimeout(() => controller.abort(), 90000);
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
      if (companion.requests.get(action) === controller) {
        companion.requests.delete(action);
        if (companion.active === action) reading.removeAttribute('aria-busy');
        const readingThis = companion.active === action;
        if (readingThis && companion.outcomes.has(action)) root.getElementById('reading-note').hidden = true;
        companion.notify(message, readingThis && !companion.outcomes.has(action));
      }
    }
  }

  window.InkluReadingActions = { describeImages, loadingMessage, requestText, renderTranslation, LANGUAGE_NAMES, NATIVE_NAMES };
})();
