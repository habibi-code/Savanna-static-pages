(() => {
  'use strict';

  const excluded = [
    'nav', 'footer', 'button', 'form', 'input', 'select', 'textarea', 'progress', 'meter',
    '[role="navigation"]', '[role="menu"]', '[role="menubar"]', '[role="button"]',
    '[role="progressbar"]', '[role="contentinfo"]', '.btn', '.progress', '.dropdown-menu',
    'alx-learning-companion', '[hidden]', '[inert]', '[aria-hidden="true"]',
    'script', 'style', 'template', 'noscript', 'iframe', 'svg',
  ].join(',');
  const retained = new Set('h1 h2 h3 h4 h5 h6 p ul ol li br div blockquote figure figcaption strong em'.split(' '));

  function isExcluded(element) {
    if (element.matches(excluded)) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }

  function isAvailable(element) {
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (isExcluded(ancestor)) return false;
    }
    return true;
  }

  // Copy reading content into detached, inert markup. Authored links contribute their text.
  function copyContent(node, output, skip, images) {
    if (node.nodeType === Node.TEXT_NODE) {
      output.append(node.data);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node === skip || isExcluded(node)) return;

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
    for (const child of node.childNodes) copyContent(child, copy, skip, images);
    output.append(copy);
  }

  function extractLesson(lesson = document.getElementById('curriculum_navigation_content')) {
    const content = document.createDocumentFragment();
    const images = [];
    if (!lesson || !isAvailable(lesson)) return { title: '', content, images, visuals: [] };

    const heading = Array.from(lesson.querySelectorAll('h1')).find(isAvailable);
    const titleCopy = document.createDocumentFragment();
    if (heading) copyContent(heading, titleCopy, null, images);

    // Some captures have the styling wrapper alone; others nest it inside formatted-content.
    const bodies = lesson.querySelectorAll('.formatted-content, .savanna-styles');
    for (const body of bodies) {
      const outerBody = body.parentElement.closest('.formatted-content, .savanna-styles');
      if ((outerBody && lesson.contains(outerBody)) || !isAvailable(body)) continue;
      copyContent(body, content, heading, images);
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
      const asset = local && /^\/assets\/img\/([a-z\d][a-z\d_-]{0,119}\.png)$/i.exec(url.pathname)?.[1];
      const caption = image.closest('figure')?.querySelector('figcaption');
      const body = image.closest('.savanna-styles, .formatted-content');
      if (!blocksByBody.has(body)) {
        blocksByBody.set(body, [...(body?.querySelectorAll('h2,h3,h4,h5,h6,p,mark') ?? [])]
          .filter(el => isAvailable(el) && el.innerText.trim()));
      }
      const blocks = blocksByBody.get(body);
      const preceding = blocks.filter(el => el.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING);
      const following = blocks.find(el => el.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_PRECEDING);
      const nearby = preceding.at(-1) ?? following;
      const section = preceding.findLast(el => /^H[2-6]$/.test(el.tagName));
      const context = [...new Set([title, section?.innerText, caption && isAvailable(caption) && caption.innerText, nearby?.innerText]
        .filter(Boolean).map(text => text.replace(/\s+/gu, ' ').trim().slice(0, 380)))].join('\n').slice(0, 1200);
      visuals.push({ asset: asset || null, context: context || 'Lesson image' });
    }
    return { title, content, visuals, images: images.map(node =>
      node.getAttribute('aria-label')?.trim() || node.getAttribute('alt')?.trim() || 'Image without a description.') };
  }

  window.SavannaLessonContent = { extractLesson };
})();
