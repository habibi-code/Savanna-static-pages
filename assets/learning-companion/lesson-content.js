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
  function copyContent(node, output, skip) {
    if (node.nodeType === Node.TEXT_NODE) {
      output.append(node.data);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node === skip || isExcluded(node)) return;

    const tag = node.localName;
    if (tag === 'img') {
      const label = node.getAttribute('aria-label')?.trim() || node.getAttribute('alt')?.trim();
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
    for (const child of node.childNodes) copyContent(child, copy, skip);
    output.append(copy);
  }

  function extractLesson(lesson = document.getElementById('curriculum_navigation_content')) {
    const content = document.createDocumentFragment();
    if (!lesson || !isAvailable(lesson)) return { title: '', content };

    const heading = Array.from(lesson.querySelectorAll('h1')).find(isAvailable);
    const titleCopy = document.createDocumentFragment();
    if (heading) copyContent(heading, titleCopy);

    // Some captures have the styling wrapper alone; others nest it inside formatted-content.
    const bodies = lesson.querySelectorAll('.formatted-content, .savanna-styles');
    for (const body of bodies) {
      const outerBody = body.parentElement.closest('.formatted-content, .savanna-styles');
      if ((outerBody && lesson.contains(outerBody)) || !isAvailable(body)) continue;
      copyContent(body, content, heading);
    }
    return { title: titleCopy.textContent.replace(/\s+/g, ' ').trim(), content };
  }

  window.SavannaLessonContent = { extractLesson };
})();
