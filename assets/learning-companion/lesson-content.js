(() => {
  'use strict';

  const excluded = [
    'nav', 'footer', 'button', 'form', 'input', 'select', 'textarea', 'progress', 'meter',
    '[role="navigation"]', '[role="menu"]', '[role="menubar"]', '[role="button"]',
    '[role="progressbar"]', '[role="contentinfo"]',
    'alx-learning-companion', '[hidden]', '[inert]', '[aria-hidden="true"]',
    'script', 'style', 'template', 'noscript', 'iframe', 'svg',
  ].join(',');
  const retained = new Set('h1 h2 h3 h4 h5 h6 p ul ol li br div blockquote figure figcaption strong em'.split(' '));
  const savanna = {
    lesson: '#curriculum_navigation_content', title: 'h1', body: '.formatted-content, .savanna-styles',
    imageBase: '/assets/img/', exclude: '.btn, .progress, .dropdown-menu',
  };

  function hostFor(element) {
    const customLesson = element.getAttribute('lesson-selector');
    return {
      lesson: customLesson ?? savanna.lesson,
      title: element.getAttribute('title-selector') ?? savanna.title,
      body: element.getAttribute('content-selector') ?? (customLesson ? null : savanna.body),
      imageBase: element.getAttribute('image-base') ?? savanna.imageBase,
      exclude: element.getAttribute('exclude-selector') ?? (customLesson ? '' : savanna.exclude),
    };
  }

  function findLesson(element, host) {
    try { return element.closest(host.lesson) || element.ownerDocument.querySelector(host.lesson); }
    catch { return null; } // Invalid selectors must never fall back to the whole page.
  }

  function isExcluded(element, extra) {
    if (element.matches(excluded) || (extra && element.matches(extra))) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }

  function isAvailable(element, extra) {
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (isExcluded(ancestor, extra)) return false;
    }
    return true;
  }

  // Copy reading content into detached, inert markup. Authored links contribute their text.
  function copyContent(node, output, skip, images, extra) {
    if (node.nodeType === Node.TEXT_NODE) {
      output.append(node.data);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node === skip || isExcluded(node, extra)) return;

    const tag = node.localName;
    if (tag === 'img') {
      const label = node.getAttribute('aria-label')?.trim() || node.getAttribute('alt')?.trim();
      if ((label || !node.hasAttribute('alt')) && !node.matches('[role="presentation"], [role="none"]')) images.push(node);
      if (label) output.append(' Image description: ' + label + ' ');
      else if (!node.hasAttribute('alt')) output.append(' [Image without alt text] ');
      return;
    }

    let copy = document.createDocumentFragment();
    if (retained.has(tag)) copy = document.createElement(tag);
    else if (node.lang) copy = document.createElement('span');
    if (node.lang) copy.lang = node.lang;
    if (tag === 'ol') {
      if (node.hasAttribute('start')) copy.start = node.start;
      copy.reversed = node.reversed;
    }
    if (tag === 'li' && node.hasAttribute('value')) copy.value = node.value;
    for (const child of node.childNodes) copyContent(child, copy, skip, images, extra);
    output.append(copy);
  }

  function extractLesson(lesson = document.querySelector(savanna.lesson), host = savanna) {
    const content = document.createDocumentFragment();
    const images = [];
    let heading, bodies;
    const available = el => isAvailable(el, host.exclude);
    try {
      if (!lesson || !available(lesson)) return { title: '', content, images, visuals: [] };
      heading = Array.from(lesson.querySelectorAll(host.title)).find(available);
      bodies = host.body ? lesson.querySelectorAll(host.body) : [lesson];
    } catch { return { title: '', content, images, visuals: [] }; }
    const titleCopy = document.createDocumentFragment();
    if (heading) copyContent(heading, titleCopy, null, images, host.exclude);

    // Some captures have the styling wrapper alone; others nest it inside formatted-content.
    for (const body of bodies) {
      const outerBody = host.body && body.parentElement?.closest(host.body);
      if ((outerBody && lesson.contains(outerBody)) || !available(body)) continue;
      copyContent(body, content, heading, images, host.exclude);
    }
    const title = titleCopy.textContent.replace(/\s+/g, ' ').trim();
    const visuals = [];
    const seen = new Set();
    const blocksByBody = new Map();
    for (const image of images) {
      const responsive = image.hasAttribute('srcset') || image.closest('picture');
      const src = (responsive && image.currentSrc) || image.src;
      if (seen.has(src)) continue;
      seen.add(src);
      const url = URL.canParse(src) ? new URL(src) : null;
      const local = url && ['https:', 'http:'].includes(url.protocol) && url.origin === location.origin &&
        !url.search && !url.hash && !url.username && !url.password;
      const imageDir = host.imageBase.replace(/\/?$/, '/');
      const filename = local && url.pathname.startsWith(imageDir) && url.pathname.slice(imageDir.length);
      const asset = filename && /^[a-z\d][a-z\d_-]{0,119}\.png$/i.test(filename) && filename;
      const caption = image.closest('figure')?.querySelector('figcaption');
      const body = host.body ? image.closest(host.body) : lesson;
      if (!blocksByBody.has(body)) {
        blocksByBody.set(body, [...(body?.querySelectorAll('h2,h3,h4,h5,h6,p,mark') ?? [])]
          .filter(el => available(el) && el.innerText.trim()));
      }
      const blocks = blocksByBody.get(body);
      const preceding = blocks.filter(el => el.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING);
      const following = blocks.find(el => el.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_PRECEDING);
      const nearby = preceding.at(-1) ?? following;
      const section = preceding.findLast(el => /^H[2-6]$/.test(el.tagName));
      const context = [...new Set([title, section?.innerText, caption && available(caption) && caption.innerText, nearby?.innerText]
        .filter(Boolean).map(text => text.replace(/\s+/gu, ' ').trim().slice(0, 380)))].join('\n').slice(0, 1200);
      visuals.push({ asset: asset || null, context: context || 'Lesson image' });
    }
    return { title, content, visuals, images: images.map(node =>
      node.getAttribute('aria-label')?.trim() || node.getAttribute('alt')?.trim() || 'Image without a description.') };
  }

  window.InkluLessonContent = { extractLesson, hostFor, findLesson };
  window.SavannaLessonContent = window.InkluLessonContent;
})();
