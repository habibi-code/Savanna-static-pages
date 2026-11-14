/**
 * Savanna Pluggable Adaptive Accessibility Engine
 * Level 1 Plug-in | Zero Host Code Modification Required
 * WCAG 2.2 AA Compliant
 */
(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__SAVANNA_A11Y_ENGINE__) return;
  window.__SAVANNA_A11Y_ENGINE__ = true;

  const STORAGE_KEY = 'savanna_a11y_profile';
  const LANG_KEY = 'savanna_lang';

  /* ── 1. Resolve Script & CSS paths ───────────────────────────────────── */
  const currentScript = document.currentScript ||
    Array.from(document.querySelectorAll('script[src*="a11y-engine.js"], script[src*="widget.js"]')).pop();
  
  let cssBase = '/widget/a11y-engine.css';
  if (currentScript && currentScript.src) {
    try {
      const url = new URL(currentScript.src);
      cssBase = url.origin + '/widget/a11y-engine.css';
    } catch (_) {}
  }

  function injectStylesheet() {
    if (document.querySelector('link[href*="a11y-engine.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssBase;
    document.head.appendChild(link);
  }
  injectStylesheet();

  /* ── 2. Bilingual Copy (EN & AM) ─────────────────────────────────────── */
  let currentLang = (localStorage.getItem(LANG_KEY) === 'am') ? 'am' : 'en';

  const i18n = {
    en: {
      triggerLabel: 'Accessibility preferences and accommodation settings',
      modalTitle: 'How would you like to experience your learning?',
      modalSubtitle: 'Customize your learning interface. Select all that help you learn best.',
      noticeText: 'We do not ask for medical history or proof. You can change these anytime or skip.',
      optScreenReaderTitle: 'Screen Reader & Audio-Guided Learning',
      optScreenReaderDesc: 'Optimized for blind learners: spoken landmarks, rich image descriptions, and audio navigation.',
      optCaptionsTitle: 'Captions, Transcripts & Visual Alerts',
      optCaptionsDesc: 'Optimized for Deaf and hard-of-hearing learners: subtitles, transcripts for audio, and visual flash alerts.',
      optContrastTitle: 'Large Text & High Visual Contrast',
      optContrastDesc: 'Optimized for low-vision learners: enhanced contrast ratios, scalable typography, and bold focus indicators.',
      optMotorTitle: 'Keyboard, Switch Device & Motor Assistance',
      optMotorDesc: 'Optimized for mobility limitations: giant action buttons, sticky controls, single-key shortcuts, and switch scanning.',
      optCognitiveTitle: 'Plain Language & Low Distraction',
      optCognitiveDesc: 'Optimized for neurodivergent learners, ADHD, and dyslexia: simplified text, reading guide ruler, and reduced animations.',
      btnSave: 'Save & Apply Preferences',
      btnSkip: 'Skip for now (I will configure later)',
      langToggle: 'አማርኛ (AM)',
      closeLabel: 'Close accessibility dialog',
      savedAnnouncement: 'Accessibility preferences updated and applied.',
      skippedAnnouncement: 'Accessibility setup skipped. You can open it anytime using the accessibility button.',
    },
    am: {
      triggerLabel: 'የተደራሽነት ምርጫዎች እና የማስተካከያ ቅንብሮች',
      modalTitle: 'ትምህርትዎን በምን ዓይነት መልኩ መከታተል ይፈልጋሉ?',
      modalSubtitle: 'የትምህርት በይነገጽዎን ያብጁ። ለእርስዎ የሚስማሙትን ሁሉ ይምረጡ።',
      noticeText: 'ምንም ዓይነት የህክምና ማረጋገጫ አንጠይቅም። በማንኛውም ጊዜ መቀየር ወይም ማለፍ ይችላሉ።',
      optScreenReaderTitle: 'የስክሪን አንባቢ እና የድምፅ መመሪያ',
      optScreenReaderDesc: 'ለዓይነ-ስውራን የተመቻቸ፡ ዝርዝር የምስል ገለፃዎች፣ የስክሪን አንባቢ ድጋፍ እና የድምፅ አሰሳ።',
      optCaptionsTitle: 'የፅሑፍ መግለጫዎች እና የእይታ ማንቂያዎች',
      optCaptionsDesc: 'የመስማት ችግር ላለባቸው ተማሪዎች፡ ንዑስ ርዕሶች፣ የድምፅ ፅሑፎች እና የእይታ ብልጭታ ማንቂያዎች።',
      optContrastTitle: 'ትልቅ ፅሑፍ እና ከፍተኛ የቀለም ንፅፅር',
      optContrastDesc: 'ዝቅተኛ እይታ ላላቸው ተማሪዎች፡ ከፍተኛ ንፅፅር፣ ትላልቅ ፊደላት እና ደማቅ የአሰሳ ጠቋሚዎች።',
      optMotorTitle: 'የቁልፍ ሰሌዳ፣ ስዊች እና የአካል ድጋፍ',
      optMotorDesc: 'የእንቅስቃሴ ውስንነት ላለባቸው፡ ትላልቅ አዝራሮች፣ ቀላል አቋራጭ ቁልፎች እና አውቶማቲክ ስካነር።',
      optCognitiveTitle: 'ቀላል ቋንቋ እና ትኩረት ሰብሳቢ እይታ',
      optCognitiveDesc: 'ለቀላል ንባብ እና ትኩረት፡ አጫጭር ዓረፍተ ነገሮች፣ የንባብ መስመር እና የማይንቀሳቀስ እይታ።',
      btnSave: 'አስቀምጥና ተግብር',
      btnSkip: 'ለጊዜው እለፈው (በኋላ አስተካክላለሁ)',
      langToggle: 'English (EN)',
      closeLabel: 'የተደራሽነት መስኮትን ዝጋ',
      savedAnnouncement: 'የተደራሽነት ምርጫዎች ተቀምጠው ተተግብረዋል።',
      skippedAnnouncement: 'የተደራሽነት ቅንብር አልፏል። በማንኛውም ጊዜ በተደራሽነት አዝራሩ መክፈት ይችላሉ።',
    }
  };

  /* ── 3. Browser & OS Preference Auto-Detection ───────────────────────── */
  function detectOSPreferences() {
    const isReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isHighContrast = window.matchMedia && (
      window.matchMedia('(prefers-contrast: more)').matches ||
      window.matchMedia('(forced-colors: active)').matches
    );

    return {
      screenReader: false,
      captionsTranscripts: false,
      highContrast: Boolean(isHighContrast),
      motorAssistance: false,
      cognitiveSupport: Boolean(isReducedMotion),
      configured: false,
      skipped: false
    };
  }

  function getStoredProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (_) {}
    // Broadcast event for platform adaptations
    window.dispatchEvent(new CustomEvent('savanna:a11y-profile-changed', { detail: profile }));
  }

  let activeProfile = getStoredProfile() || detectOSPreferences();

  /* ── 4. Screen Reader Polite Live Region Announcer ────────────────────── */
  let liveRegion = document.getElementById('savanna-a11y-announcer');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'savanna-a11y-announcer';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.cssText = 'position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); border: 0;';
    document.body ? document.body.appendChild(liveRegion) : document.addEventListener('DOMContentLoaded', () => document.body.appendChild(liveRegion));
  }

  function announce(msg) {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = msg; }, 50);
  }

  /* ── 5. Build Floating Accessibility Trigger Button ──────────────────── */
  let triggerBtn = null;

  function createTriggerButton() {
    if (document.getElementById('savanna-a11y-trigger')) return;
    triggerBtn = document.createElement('button');
    triggerBtn.id = 'savanna-a11y-trigger';
    triggerBtn.type = 'button';
    triggerBtn.setAttribute('aria-label', i18n[currentLang].triggerLabel);
    triggerBtn.setAttribute('title', i18n[currentLang].triggerLabel);
    triggerBtn.setAttribute('aria-haspopup', 'dialog');
    triggerBtn.setAttribute('aria-expanded', 'false');

    // Universal Accessibility Wheelchair SVG
    triggerBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true" focusable="false">
        <circle cx="12" cy="4.5" r="2.5"/>
        <path d="m10 19 3-7 4 2v5"/>
        <path d="M7 11.5a4.5 4.5 0 1 0 5 4.5"/>
        <path d="M8 8h5l2 4"/>
      </svg>
    `;

    triggerBtn.addEventListener('click', () => openOnboardingModal(true));
    document.body.appendChild(triggerBtn);
  }

  /* ── 6. Build Dynamic Onboarding Dialog Modal ─────────────────────────── */
  let modalBackdrop = null;
  let previouslyFocusedElement = null;

  function buildOnboardingModal() {
    if (document.getElementById('savanna-a11y-modal-backdrop')) {
      return document.getElementById('savanna-a11y-modal-backdrop');
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'savanna-a11y-modal-backdrop';
    backdrop.className = 'sa11y-backdrop';
    backdrop.setAttribute('hidden', '');

    const t = i18n[currentLang];

    backdrop.innerHTML = `
      <div class="sa11y-modal" role="dialog" aria-modal="true" aria-labelledby="sa11y-modal-title" aria-describedby="sa11y-modal-desc">
        <div class="sa11y-modal-header">
          <div class="sa11y-title-group">
            <h2 id="sa11y-modal-title">
              <span aria-hidden="true">♿</span>
              <span>${t.modalTitle}</span>
            </h2>
            <p id="sa11y-modal-desc">${t.modalSubtitle}</p>
          </div>
          <button type="button" id="sa11y-lang-btn" class="sa11y-lang-switch" aria-label="Toggle language">
            ${t.langToggle}
          </button>
        </div>

        <div class="sa11y-modal-body">
          <div class="sa11y-notice">
            ${t.noticeText}
          </div>

          <div class="sa11y-options-grid" role="group" aria-label="Accessibility options">
            <!-- 1. Screen Reader / Blind -->
            <label class="sa11y-card" id="card-sr">
              <input type="checkbox" id="chk-sr" name="screenReader">
              <div class="sa11y-card-content">
                <div class="sa11y-card-title">
                  <span aria-hidden="true">👁️</span>
                  <span class="txt-title">${t.optScreenReaderTitle}</span>
                </div>
                <div class="sa11y-card-desc txt-desc">${t.optScreenReaderDesc}</div>
              </div>
            </label>

            <!-- 2. Deaf / Hard of Hearing -->
            <label class="sa11y-card" id="card-captions">
              <input type="checkbox" id="chk-captions" name="captionsTranscripts">
              <div class="sa11y-card-content">
                <div class="sa11y-card-title">
                  <span aria-hidden="true">🦻</span>
                  <span class="txt-title">${t.optCaptionsTitle}</span>
                </div>
                <div class="sa11y-card-desc txt-desc">${t.optCaptionsDesc}</div>
              </div>
            </label>

            <!-- 3. Low Vision / Contrast -->
            <label class="sa11y-card" id="card-contrast">
              <input type="checkbox" id="chk-contrast" name="highContrast">
              <div class="sa11y-card-content">
                <div class="sa11y-card-title">
                  <span aria-hidden="true">🔍</span>
                  <span class="txt-title">${t.optContrastTitle}</span>
                </div>
                <div class="sa11y-card-desc txt-desc">${t.optContrastDesc}</div>
              </div>
            </label>

            <!-- 4. Motor / Keyboard / Switch -->
            <label class="sa11y-card" id="card-motor">
              <input type="checkbox" id="chk-motor" name="motorAssistance">
              <div class="sa11y-card-content">
                <div class="sa11y-card-title">
                  <span aria-hidden="true">⌨️</span>
                  <span class="txt-title">${t.optMotorTitle}</span>
                </div>
                <div class="sa11y-card-desc txt-desc">${t.optMotorDesc}</div>
              </div>
            </label>

            <!-- 5. Cognitive / ADHD / Dyslexia -->
            <label class="sa11y-card" id="card-cognitive">
              <input type="checkbox" id="chk-cognitive" name="cognitiveSupport">
              <div class="sa11y-card-content">
                <div class="sa11y-card-title">
                  <span aria-hidden="true">🧠</span>
                  <span class="txt-title">${t.optCognitiveTitle}</span>
                </div>
                <div class="sa11y-card-desc txt-desc">${t.optCognitiveDesc}</div>
              </div>
            </label>
          </div>
        </div>

        <div class="sa11y-modal-footer">
          <button type="button" id="sa11y-skip-btn" class="sa11y-btn sa11y-btn-ghost">
            ${t.btnSkip}
          </button>
          <button type="button" id="sa11y-save-btn" class="sa11y-btn sa11y-btn-primary">
            ${t.btnSave}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    bindModalEvents(backdrop);
    return backdrop;
  }

  function updateModalLanguage(backdrop) {
    const t = i18n[currentLang];
    backdrop.querySelector('#sa11y-modal-title span:last-child').textContent = t.modalTitle;
    backdrop.querySelector('#sa11y-modal-desc').textContent = t.modalSubtitle;
    backdrop.querySelector('#sa11y-lang-btn').textContent = t.langToggle;
    backdrop.querySelector('.sa11y-notice').textContent = t.noticeText;
    backdrop.querySelector('#sa11y-skip-btn').textContent = t.btnSkip;
    backdrop.querySelector('#sa11y-save-btn').textContent = t.btnSave;

    // Card texts
    const cards = [
      { id: '#card-sr', title: t.optScreenReaderTitle, desc: t.optScreenReaderDesc },
      { id: '#card-captions', title: t.optCaptionsTitle, desc: t.optCaptionsDesc },
      { id: '#card-contrast', title: t.optContrastTitle, desc: t.optContrastDesc },
      { id: '#card-motor', title: t.optMotorTitle, desc: t.optMotorDesc },
      { id: '#card-cognitive', title: t.optCognitiveTitle, desc: t.optCognitiveDesc },
    ];
    cards.forEach(c => {
      const el = backdrop.querySelector(c.id);
      if (el) {
        el.querySelector('.txt-title').textContent = c.title;
        el.querySelector('.txt-desc').textContent = c.desc;
      }
    });

    if (triggerBtn) {
      triggerBtn.setAttribute('aria-label', t.triggerLabel);
      triggerBtn.setAttribute('title', t.triggerLabel);
    }
  }

  function syncCheckboxStates(backdrop) {
    const inputs = backdrop.querySelectorAll('.sa11y-options-grid input[type="checkbox"]');
    inputs.forEach(input => {
      const key = input.name;
      input.checked = Boolean(activeProfile[key]);
      const card = input.closest('.sa11y-card');
      if (card) card.classList.toggle('sa11y-selected', input.checked);
    });
  }

  function bindModalEvents(backdrop) {
    // Checkbox toggle highlighting
    backdrop.querySelectorAll('.sa11y-options-grid input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => {
        const card = input.closest('.sa11y-card');
        if (card) card.classList.toggle('sa11y-selected', input.checked);
      });
    });

    // Language Toggle
    const langBtn = backdrop.querySelector('#sa11y-lang-btn');
    langBtn.addEventListener('click', () => {
      currentLang = (currentLang === 'en') ? 'am' : 'en';
      localStorage.setItem(LANG_KEY, currentLang);
      updateModalLanguage(backdrop);
      announce(currentLang === 'am' ? 'ቋንቋ ወደ አማርኛ ተቀይሯል' : 'Language set to English');
    });

    // Save Button
    const saveBtn = backdrop.querySelector('#sa11y-save-btn');
    saveBtn.addEventListener('click', () => {
      const inputs = backdrop.querySelectorAll('.sa11y-options-grid input[type="checkbox"]');
      inputs.forEach(input => {
        activeProfile[input.name] = input.checked;
      });
      activeProfile.configured = true;
      activeProfile.skipped = false;
      saveProfile(activeProfile);
      closeOnboardingModal();
      announce(i18n[currentLang].savedAnnouncement);
    });

    // Skip Button
    const skipBtn = backdrop.querySelector('#sa11y-skip-btn');
    skipBtn.addEventListener('click', () => {
      activeProfile.configured = true;
      activeProfile.skipped = true;
      saveProfile(activeProfile);
      closeOnboardingModal();
      announce(i18n[currentLang].skippedAnnouncement);
    });

    // Backdrop click to dismiss
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeOnboardingModal();
    });

    // Keyboard Focus Trap & Escape key
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeOnboardingModal();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = backdrop.querySelectorAll(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });
  }

  function openOnboardingModal(isManualOpen = false) {
    if (!modalBackdrop) modalBackdrop = buildOnboardingModal();
    previouslyFocusedElement = document.activeElement;
    syncCheckboxStates(modalBackdrop);
    modalBackdrop.removeAttribute('hidden');
    if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');

    // Focus the first checkbox or title
    const firstCheckbox = modalBackdrop.querySelector('input[type="checkbox"]');
    if (firstCheckbox) firstCheckbox.focus();
  }

  function closeOnboardingModal() {
    if (!modalBackdrop) return;
    modalBackdrop.setAttribute('hidden', '');
    if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      previouslyFocusedElement.focus();
    } else if (triggerBtn) {
      triggerBtn.focus();
    }
  }

  /* ── 7. Initial Mount & Check ────────────────────────────────────────── */
  function initEngine() {
    createTriggerButton();

    // Check if user has already configured or skipped
    const stored = getStoredProfile();
    if (!stored || (!stored.configured && !stored.skipped)) {
      // First visit: automatically open the accessible identification modal
      setTimeout(() => {
        openOnboardingModal(false);
      }, 400);
    } else {
      // Broadcast existing stored profile for live platform adaptations
      window.dispatchEvent(new CustomEvent('savanna:a11y-profile-changed', { detail: stored }));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }

  // Expose API for host scripts or other modules
  window.SavannaA11y = {
    openSettings: () => openOnboardingModal(true),
    getProfile: () => ({ ...activeProfile }),
    setProfile: (p) => {
      activeProfile = { ...activeProfile, ...p, configured: true };
      saveProfile(activeProfile);
    }
  };
})();
