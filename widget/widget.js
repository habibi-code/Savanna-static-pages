/**
 * Savanna Multilingual Assistant — Level 1 drop-in widget
 * Usage: <script src="/widget/widget.js" data-api-url="http://localhost:8000"></script>
 *
 * WCAG 2.2 AA compliant. No external dependencies.
 */
(function () {
  'use strict';

  /* ── 1. Resolve API base URL ─────────────────────────────────────────── */
  const scriptEl = document.currentScript ||
    Array.from(document.querySelectorAll('script[src*="widget.js"]')).pop();
  const apiUrl = (scriptEl && scriptEl.dataset.apiUrl)
    ? scriptEl.dataset.apiUrl.replace(/\/$/, '')
    : (window.location.origin + '/api');

  /* ── 2. Inject persistent CSS ─────────────────────────────────────────── */
  const CSS = `
    :root {
      --savanna-primary: #005fcc;
      --savanna-bg: #ffffff;
      --savanna-shadow: 0 4px 24px rgba(0,0,0,.18);
    }
    #savanna-trigger {
      all: unset;
      position: fixed;
      inset-block-end: 1.5rem;
      inset-inline-end: 1.5rem;
      z-index: 2147483646;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: var(--savanna-primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--savanna-shadow);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      #savanna-trigger { transition: none; }
    }
    #savanna-trigger:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,.24); }
    #savanna-trigger:focus-visible {
      outline: 3px solid #005fcc;
      outline-offset: 3px;
      box-shadow: 0 0 0 5px rgba(0,95,204,.35);
    }
    #savanna-trigger[aria-expanded="true"] { background: #003d85; }
    #savanna-iframe-container {
      position: fixed;
      inset-block-end: 6rem;
      inset-inline-end: 1.5rem;
      z-index: 2147483645;
      width: min(400px, calc(100vw - 2rem));
      height: min(600px, calc(100vh - 8rem));
      border-radius: 1rem;
      box-shadow: var(--savanna-shadow);
      overflow: hidden;
      display: none;
      background: var(--savanna-bg);
    }
    #savanna-iframe-container.savanna-open { display: block; }
    #savanna-iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 1rem;
    }
    @media (forced-colors: active) {
      #savanna-trigger { background: ButtonText; color: ButtonFace; }
      #savanna-iframe-container { border: 2px solid ButtonText; }
    }
    @media (max-width: 480px) {
      #savanna-iframe-container {
        inset-inline-end: 0;
        inset-block-end: 5rem;
        width: 100vw;
        height: calc(100vh - 5.5rem);
        border-radius: 1rem 1rem 0 0;
      }
    }
  `;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ── 3. Build trigger button ──────────────────────────────────────────── */
  const trigger = document.createElement('button');
  trigger.id = 'savanna-trigger';
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-label', 'Open learning assistant');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'savanna-iframe-container');
  trigger.setAttribute('tabindex', '0');
  trigger.type = 'button';

  /* Chat bubble SVG — inline, no external deps */
  trigger.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;

  /* ── 4. Build iframe container ─────────────────────────────────────────── */
  const container = document.createElement('div');
  container.id = 'savanna-iframe-container';
  container.setAttribute('aria-label', 'Savanna Learning Assistant panel');

  const iframe = document.createElement('iframe');
  iframe.id = 'savanna-iframe';
  let iframeSrc = apiUrl + '/widget/iframe.html?api=' + encodeURIComponent(apiUrl);
  if (window.location.protocol === 'file:' && scriptEl && scriptEl.src) {
    iframeSrc = scriptEl.src.replace(/widget\.js(\?.*)?$/, 'iframe.html') + '?api=' + encodeURIComponent(apiUrl);
  }
  iframe.src = iframeSrc;
  iframe.title = 'Savanna Learning Assistant';
  iframe.setAttribute('allow', 'microphone; display-capture');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
  container.appendChild(iframe);

  document.body.appendChild(trigger);
  document.body.appendChild(container);

  /* ── 5. Open / close logic ─────────────────────────────────────────────── */
  let isOpen = false;

  function openWidget() {
    isOpen = true;
    container.classList.add('savanna-open');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', 'Close learning assistant');
    /* Focus into iframe via postMessage */
    iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'focus' }, '*');
  }

  function closeWidget() {
    isOpen = false;
    container.classList.remove('savanna-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open learning assistant');
    trigger.focus();
  }

  function toggleWidget() {
    isOpen ? closeWidget() : openWidget();
  }

  trigger.addEventListener('click', toggleWidget);
  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleWidget();
    }
  });

  /* ── 6. postMessage listener (from iframe) ─────────────────────────────── */
  window.addEventListener('message', function (event) {
    /* Accept messages from same origin or the configured API origin */
    const allowedOrigin = new URL(apiUrl).origin;
    if (event.origin !== window.location.origin && event.origin !== allowedOrigin) return;
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'close') {
      closeWidget();
    } else if (event.data.type === 'resize' && typeof event.data.height === 'number') {
      const maxH = window.innerHeight - 128;
      const clampedH = Math.min(Math.max(event.data.height, 200), maxH);
      container.style.height = clampedH + 'px';
    }
  });

  /* ── 7. Escape key closes widget ──────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeWidget();
  });

  /* ── 8. Built-in Focus Reader / Self-Voicing on Host Page ─────────────── */
  const VOICE_GUIDE_KEY = 'savanna_voice_guide';

  function isVoiceGuideEnabled() {
    return localStorage.getItem(VOICE_GUIDE_KEY) !== 'false';
  }

  function speakHost(text) {
    if (!isVoiceGuideEnabled() || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US';
      utt.rate = 1.05;
      window.speechSynthesis.speak(utt);
    } catch (_) {}
  }

  function getHostElementDescription(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    let label = el.getAttribute('aria-label') || '';
    if (!label && el.placeholder) label = el.placeholder;
    if (!label && el.innerText && el.innerText.trim().length > 0 && el.innerText.trim().length < 80) {
      label = el.innerText.trim();
    }
    let role = el.getAttribute('role');
    if (!role) {
      if (el.tagName === 'BUTTON') role = 'button';
      else if (el.tagName === 'A') role = 'link';
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') role = 'edit text';
    }
    const states = [];
    if (el.hasAttribute('aria-expanded')) {
      states.push(el.getAttribute('aria-expanded') === 'true' ? 'expanded' : 'collapsed');
    }
    if (el.hasAttribute('aria-pressed')) {
      states.push(el.getAttribute('aria-pressed') === 'true' ? 'pressed' : 'not pressed');
    }
    if (!label && !role) return null;
    return [label, role, states.join(', ')].filter(Boolean).join(', ');
  }

  // Speak trigger button specifically when focused
  trigger.addEventListener('focus', function () {
    const desc = isOpen ? 'Close learning assistant, button, expanded' : 'Open learning assistant, button, collapsed';
    speakHost(desc);
  });

  // Catch host page focus on interactive elements during Tab navigation
  let isKeyboardNav = false;
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') isKeyboardNav = true;
  });
  window.addEventListener('mousedown', function () {
    isKeyboardNav = false;
  });

  document.addEventListener('focusin', function (e) {
    if (e.target === trigger) return;
    if (isKeyboardNav) {
      const desc = getHostElementDescription(e.target);
      if (desc) speakHost(desc);
    }
  });

  /* ── 9. Double-Space Shortcut for Live Help Desk ───────────────────────── */
  let lastSpaceTime = 0;
  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.code === 'Space') {
      const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA';
      // If typing inside an input with text, allow normal typing
      if (isInput && e.target.value && e.target.value.trim().length > 0) {
        return;
      }
      const now = Date.now();
      if (now - lastSpaceTime < 450) {
        e.preventDefault();
        lastSpaceTime = 0;
        openWidgetWithEscalation();
      } else {
        lastSpaceTime = now;
      }
    }
  });

  function openWidgetWithEscalation() {
    if (!isOpen) {
      openWidget();
    }
    speakHost('Opening Live Help Desk');
    setTimeout(function () {
      iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'open_escalate' }, '*');
    }, 150);
  }
})();
