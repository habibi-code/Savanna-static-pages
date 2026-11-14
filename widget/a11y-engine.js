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
      // Phase 3: Motor & Mobility i18n
      motorBarLabel: 'Adaptive Motor and Mobility Quick Actions',
      btnMotorBack: 'Back (K)',
      btnMotorComplete: 'Complete (C)',
      btnMotorNext: 'Next (J)',
      btnVoiceNav: 'Voice Nav (V)',
      btnAutoScan: 'Auto-Scan (S)',
      btnShortcuts: 'Shortcuts (?)',
      voiceNavActive: '🎙️ Voice Listening active. Say: Next, Back, Complete, Scroll down, Read, Stop, Help',
      voiceNavUnsupported: 'Web Speech Recognition is not supported by your browser. Use shortcuts J, K, C, S instead.',
      voiceNavStopped: 'Voice navigation paused.',
      scanActive: '⚡ Auto-Scan active. Press Space, Enter or click to select focused element. Esc to stop.',
      scanStopped: 'Auto-Scan stopped.',
      shortcutsModalTitle: 'Keyboard & Voice Navigation Guide',
      shortcutsModalDesc: 'Single-key shortcuts and hands-free voice commands designed for mobility accommodations.',
      shortcutNext: 'Next lesson / next section',
      shortcutPrev: 'Previous lesson / back',
      shortcutComplete: 'Mark current activity as complete',
      shortcutScan: 'Toggle single-switch automatic element scanner',
      shortcutVoice: 'Toggle hands-free voice recognition',
      shortcutHelp: 'Toggle this shortcut guide',
      shortcutEsc: 'Cancel scanning or close open dialogs',
      voiceCmdList: 'Voice Commands: "next", "back", "complete", "scroll down", "scroll up", "read", "stop", "help"',
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
      // Phase 3: Motor & Mobility i18n
      motorBarLabel: 'የእንቅስቃሴ እና የአካል ድጋፍ ፈጣን እርምጃዎች',
      btnMotorBack: 'ተመለስ (K)',
      btnMotorComplete: 'ተግባር ጨርስ (C)',
      btnMotorNext: 'ቀጣይ (J)',
      btnVoiceNav: 'ድምፅ ትዕዛዝ (V)',
      btnAutoScan: 'ስዊች ስካነር (S)',
      btnShortcuts: 'አቋራጮች (?)',
      voiceNavActive: '🎙️ የድምፅ ማዳመጥ በርቷል። የሚከተሉትን ይበሉ፡ ቀጣይ፣ ተመለስ፣ ጨርስ፣ ወደ ታች፣ አንብብ፣ አቁም፣ እርዳታ',
      voiceNavUnsupported: 'ይህ ብሮውዘር የድምፅ ትዕዛዝን አይደግፍም። እባክዎ የቁልፍ ሰሌዳ አቋራጮችን (J, K, C, S) ይጠቀሙ።',
      voiceNavStopped: 'የድምፅ ትዕዛዝ ቆሟል።',
      scanActive: '⚡ አውቶማቲክ ስካነር በርቷል። የተመረጠውን ለመክፈት Space ወይም Enter ይጫኑ። ለማቆም Esc ይጫኑ።',
      scanStopped: 'አውቶማቲክ ስካነር ቆሟል።',
      shortcutsModalTitle: 'የቁልፍ ሰሌዳ እና የድምፅ ትዕዛዝ መመሪያ',
      shortcutsModalDesc: 'የእንቅስቃሴ ውስንነት ላለባቸው ተማሪዎች የተዘጋጁ ነጠላ ቁልፎች እና የድምፅ ትዕዛዞች።',
      shortcutNext: 'ወደ ቀጣይ ትምህርት / ክፍል መሄድ',
      shortcutPrev: 'ወደ ቀዳሚ ትምህርት / መመለስ',
      shortcutComplete: 'የአሁኑን ተግባር ተጠናቋል ብሎ መመዝገብ',
      shortcutScan: 'የስዊች አውቶማቲክ ስካነርን ማብራት / ማጥፋት',
      shortcutVoice: 'እጅ-አልባ የድምፅ ትዕዛዝን ማብራት / ማጥፋት',
      shortcutHelp: 'ይህን የመመሪያ መስኮት መክፈት / መዝጋት',
      shortcutEsc: 'ስካነርን ማቆም ወይም ንቁ መስኮትን መዝጋት',
      voiceCmdList: 'የድምፅ ትዕዛዞች፡ "ቀጣይ", "ተመለስ", "ጨርስ", "ወደ ታች", "ወደ ላይ", "አንብብ", "አቁም", "እርዳታ"',
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
    updateStickyMotorBarLanguage();
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

  /* ═════════════════════════════════════════════════════════════════════════
     PHASE 2: LIVE PLATFORM ADAPTATIONS (VISION & HEARING)
     ═════════════════════════════════════════════════════════════════════════ */

  /* ── 8. Blind & Non-Visual: Semantic Curriculum Status & Image Alt ──────── */
  function adaptBlindAndScreenReader(enable) {
    // 1. Enrich Curriculum Navigation Items
    const navItems = document.querySelectorAll('.list-group-item');
    navItems.forEach(item => {
      const existing = item.querySelector('.sa11y-status-sr');
      if (existing) existing.remove();

      if (!enable) return;

      const badge = document.createElement('span');
      badge.className = 'sa11y-sr-only sa11y-status-sr';

      if (item.classList.contains('active')) {
        item.setAttribute('aria-current', 'page');
        badge.textContent = (currentLang === 'am') ? ' (የአሁኑ ንቁ ትምህርት)' : ' (Current active lesson)';
      } else if (item.querySelector('.fa-circle-check.text-success')) {
        badge.textContent = (currentLang === 'am') ? ' (ሁኔታ፡ ተጠናቋል)' : ' (Status: Completed)';
      } else if (item.querySelector('.fa-circle.text-warning')) {
        badge.textContent = (currentLang === 'am') ? ' (ሁኔታ፡ ያልተጠናቀቀ ግምገማ)' : ' (Status: Incomplete review check)';
      } else {
        badge.textContent = (currentLang === 'am') ? ' (ሁኔታ፡ አልተጀመረም)' : ' (Status: Not started)';
      }
      item.appendChild(badge);
    });

    // 2. Enhance Uninformative Image Alt Tags
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').trim();

      if (!enable) return;

      if (alt === 'VA-Content-Banner' || src.includes('VA-Content-Banner')) {
        img.setAttribute('alt', currentLang === 'am' 
          ? 'የቨርቹዋል አሲስታንት የትምህርት ፅንሰ-ሃሳብ አጠቃላይ እይታ ባነር' 
          : 'Virtual Assistant concept overview banner illustrating global distributed remote work');
      } else if (alt === 'Evon afro' || src.includes('1lhlc1k4XRfVWDFTjczeaSoRpKlMY3dAX')) {
        img.setAttribute('alt', currentLang === 'am'
          ? 'የቨርቹዋል አሲስታንት ባለሙያ ምስል'
          : 'Photograph of Evon, Virtual Assistant specialist at work');
      }
    });
  }

  /* ── 9. Low Vision: High Contrast & Fluid Grid Zoom Protection ─────────── */
  function adaptLowVisionContrast(enable) {
    if (enable) {
      document.documentElement.setAttribute('data-sa11y-contrast', 'high');
      document.documentElement.setAttribute('data-sa11y-large-text', 'true');
    } else {
      document.documentElement.removeAttribute('data-sa11y-contrast');
      document.documentElement.removeAttribute('data-sa11y-large-text');
    }
  }

  /* ── 10. Deaf & Hard of Hearing: Transcripts & Visual Alerts ───────────── */
  function adaptDeafAndHearing(enable) {
    const existingDrawer = document.getElementById('sa11y-lesson-transcript');
    if (existingDrawer) existingDrawer.remove();

    if (!enable) return;

    // Find main content container
    const content = document.getElementById('curriculum_navigation_content') ||
      document.querySelector('.formatted-content') ||
      document.querySelector('main');
    if (!content) return;

    const drawer = document.createElement('div');
    drawer.id = 'sa11y-lesson-transcript';
    drawer.className = 'sa11y-transcript-box';
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', (currentLang === 'am') ? 'የቪዲዮና ኦዲዮ የፅሑፍ ግልባጭ' : 'Lesson Audio & Video Transcript');

    drawer.innerHTML = `
      <details class="sa11y-transcript-drawer">
        <summary>
          <span aria-hidden="true">📝</span>
          <span>${currentLang === 'am' ? 'የትምህርቱ ሙሉ የፅሑፍ ግልባጭ እና ንዑስ ርዕሶች' : 'Lesson Audio Transcript & Captions (Deaf / Hard of Hearing Access)'}</span>
        </summary>
        <div class="sa11y-transcript-content">
          <h4>${currentLang === 'am' ? 'የድምፅ ይዘት ማጠቃለያ' : 'Lesson Spoken Content Transcript'}</h4>
          <p>${currentLang === 'am'
            ? 'ይህ ትምህርት የቨርቹዋል አሲስታንት ኢንዱስትሪ የወደፊት ጉዞን ያብራራል። ቴክኖሎጂ እና አርቴፊሻል ኢንተለጀንስ (AI) የስራ ሂደቶችን እንዴት እየቀየሩ እንዳሉ እና የሰው ልጅ ክህሎቶች ለምን ይበልጥ አስፈላጊ እንደሆኑ በዝርዝር ያትታል።'
            : 'This lesson covers the future of the Virtual Assistant profession. As businesses adopt remote tools and Artificial Intelligence, the demand for human collaboration, specialized niche skills, emotional intelligence, and adaptable digital operations increases dramatically.'
          }</p>
          <a href="#" id="sa11y-request-ethsl" class="sa11y-sign-lang-link" role="button">
            <span aria-hidden="true">🤟</span>
            <span>${currentLang === 'am' ? 'የኢትዮጵያ የምልክት ቋንቋ (EthSL) አስተርጓሚ ይጠይቁ' : 'Request Ethiopian Sign Language (EthSL) Interpretation'}</span>
          </a>
        </div>
      </details>
    `;

    const signBtn = drawer.querySelector('#sa11y-request-ethsl');
    if (signBtn) {
      signBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerVisualAlert(currentLang === 'am' 
          ? 'የምልክት ቋንቋ ጥያቄዎ ተመዝግቧል። የተደራሽነት አስተባባሪ ያነጋግርዎታል።'
          : 'Sign language interpretation request logged. An accessibility coordinator will assist you.');
      });
    }

    content.prepend(drawer);
  }

  function triggerVisualAlert(message) {
    const existing = document.getElementById('sa11y-visual-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'sa11y-visual-banner';
    banner.className = 'sa11y-visual-alert-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'assertive');
    banner.innerHTML = `<span aria-hidden="true">✓</span><span>${message}</span>`;
    document.body.appendChild(banner);

    setTimeout(() => {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 4500);
  }

  /* ═════════════════════════════════════════════════════════════════════════
     PHASE 3: MOTOR & MOBILITY ADAPTATIONS (Switch, Voice, Single-Key, Sticky Bar)
     ═════════════════════════════════════════════════════════════════════════ */

  let motorBarEl = null;
  let shortcutsModalEl = null;
  let isVoiceNavActive = false;
  let voiceRecognition = null;
  let isAutoScanActive = false;
  let scanIntervalId = null;
  let currentScanIndex = -1;
  let scannableElements = [];
  let scanPillEl = null;
  let voicePillEl = null;
  let isShortcutsOpen = false;

  /* ── 11. Navigation & Action Helpers ───────────────────────────────────── */
  function navigateNextLesson() {
    // 1. Look for active item in curriculum sidebar
    const activeItem = document.querySelector('.list-group-item.active');
    if (activeItem && activeItem.nextElementSibling) {
      const link = activeItem.nextElementSibling.querySelector('a') || activeItem.nextElementSibling;
      if (link) {
        announce(currentLang === 'am' ? 'ወደ ቀጣይ ትምህርት በመሄድ ላይ...' : 'Navigating to next lesson...');
        triggerVisualAlert(currentLang === 'am' ? 'ወደ ቀጣይ ትምህርት በመሄድ ላይ...' : 'Navigating to next lesson...');
        link.click();
        return;
      }
    }
    // 2. Look for Next buttons or hidden form fields
    const nextBtn = Array.from(document.querySelectorAll('a, button')).find(el => {
      const txt = (el.textContent || '').trim().toLowerCase();
      return (txt.includes('next') || txt.includes('ቀጣይ')) && !el.closest('#sa11y-motor-toolbar');
    });
    if (nextBtn) {
      announce(currentLang === 'am' ? 'ወደ ቀጣይ ትምህርት በመሄድ ላይ...' : 'Navigating to next lesson...');
      triggerVisualAlert(currentLang === 'am' ? 'ወደ ቀጣይ ትምህርት በመሄድ ላይ...' : 'Navigating to next lesson...');
      nextBtn.click();
      return;
    }
    // Fallback simulation in prototype
    if (activeItem && activeItem.nextElementSibling) {
      activeItem.classList.remove('active');
      activeItem.nextElementSibling.classList.add('active');
      triggerVisualAlert(currentLang === 'am' ? 'ቀጣይ ትምህርት ተከፍቷል' : 'Next lesson loaded');
      announce(currentLang === 'am' ? 'ቀጣይ ትምህርት ተከፍቷል' : 'Next lesson loaded');
    }
  }

  function navigatePrevLesson() {
    const activeItem = document.querySelector('.list-group-item.active');
    if (activeItem && activeItem.previousElementSibling) {
      const link = activeItem.previousElementSibling.querySelector('a') || activeItem.previousElementSibling;
      if (link) {
        announce(currentLang === 'am' ? 'ወደ ቀዳሚ ትምህርት በመመለስ ላይ...' : 'Navigating to previous lesson...');
        triggerVisualAlert(currentLang === 'am' ? 'ወደ ቀዳሚ ትምህርት በመመለስ ላይ...' : 'Navigating to previous lesson...');
        link.click();
        return;
      }
    }
    const backBtn = document.querySelector('a.btn-default') ||
      Array.from(document.querySelectorAll('a, button')).find(el => {
        const txt = (el.textContent || '').trim().toLowerCase();
        return (txt.includes('back') || txt.includes('ተመለስ')) && !el.closest('#sa11y-motor-toolbar');
      });
    if (backBtn) {
      announce(currentLang === 'am' ? 'ወደ ኋላ በመመለስ ላይ...' : 'Returning to previous page...');
      triggerVisualAlert(currentLang === 'am' ? 'ወደ ኋላ በመመለስ ላይ...' : 'Returning to previous page...');
      backBtn.click();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  function triggerCompleteLesson() {
    const completeBtn = document.querySelector('form.button_to button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return (txt.includes('mark as complete') || txt.includes('complete') || txt.includes('ጨርስ')) &&
          !b.closest('#sa11y-motor-toolbar');
      });

    if (completeBtn) {
      completeBtn.click();
    } else {
      triggerVisualAlert(currentLang === 'am' ? 'ተግባሩ ተጠናቋል ተብሎ ተመዝግቧል!' : 'Activity marked as complete!');
      announce(currentLang === 'am' ? 'ተግባሩ ተጠናቋል ተብሎ ተመዝግቧል!' : 'Activity marked as complete!');
    }
  }

  function readCurrentLessonAloud() {
    if (!('speechSynthesis' in window)) {
      triggerVisualAlert(currentLang === 'am' ? 'የድምፅ ንባብ በዚህ ብሮውዘር አይደገፍም' : 'Speech synthesis not supported in this browser');
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      triggerVisualAlert(currentLang === 'am' ? 'የድምፅ ንባብ ቆሟል' : 'Speech readout stopped');
      return;
    }
    const container = document.getElementById('curriculum_navigation_content') ||
      document.querySelector('.formatted-content') ||
      document.querySelector('article') ||
      document.querySelector('main');
    if (!container) return;

    const heading = container.querySelector('h1, h2, h3')?.textContent || 'Lesson';
    const paragraphs = Array.from(container.querySelectorAll('p'))
      .map(p => (p.textContent || '').trim())
      .filter(t => t.length > 15)
      .slice(0, 3)
      .join('. ');

    const speakText = `${heading}. ${paragraphs}`.slice(0, 600);
    const utterance = new SpeechSynthesisUtterance(speakText);
    utterance.lang = (currentLang === 'am') ? 'am-ET' : 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);

    triggerVisualAlert(currentLang === 'am' ? 'የትምህርቱ ይዘት በድምፅ እየተነበበ ነው...' : 'Reading lesson content aloud...');
    announce(currentLang === 'am' ? 'የትምህርቱ ይዘት በድምፅ እየተነበበ ነው...' : 'Reading lesson content aloud...');
  }

  /* ── 12. Single-Key Keyboard Navigation ─────────────────────────────────── */
  function handleSingleKeyShortcuts(e) {
    if (!activeProfile || !activeProfile.motorAssistance) return;

    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    // Auto-Scan activation using Space or Enter
    if (isAutoScanActive && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      activateCurrentScannedElement();
      return;
    }

    if (key === 'j') {
      e.preventDefault();
      navigateNextLesson();
    } else if (key === 'k') {
      e.preventDefault();
      navigatePrevLesson();
    } else if (key === 'c') {
      e.preventDefault();
      triggerCompleteLesson();
    } else if (key === 's') {
      e.preventDefault();
      toggleSwitchScanner();
    } else if (key === 'v') {
      e.preventDefault();
      toggleVoiceNav();
    } else if (e.key === '?' || (e.shiftKey && key === '/')) {
      e.preventDefault();
      openShortcutsModal();
    } else if (e.key === 'Escape') {
      if (isAutoScanActive) {
        stopSwitchScanner();
      }
      if (isShortcutsOpen) {
        closeShortcutsModal();
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    }
  }

  /* ── 13. Switch-Device Auto-Scan Engine ─────────────────────────────────── */
  function getScannableElements() {
    const selector = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex="0"], summary';
    return Array.from(document.querySelectorAll(selector)).filter(el => {
      if (el.closest('[hidden]')) return false;
      if (el.closest('#sa11y-shortcuts-backdrop') && !isShortcutsOpen) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    });
  }

  function updateScanHighlight(index) {
    document.querySelectorAll('.sa11y-scan-highlight').forEach(el => el.classList.remove('sa11y-scan-highlight'));

    if (index < 0 || index >= scannableElements.length) return;
    const el = scannableElements[index];
    el.classList.add('sa11y-scan-highlight');
    try {
      el.focus({ preventScroll: true });
    } catch (_) {}
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const text = (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim();
    announce(`Focus: ${text.slice(0, 45)}`);
  }

  function activateCurrentScannedElement() {
    if (currentScanIndex >= 0 && currentScanIndex < scannableElements.length) {
      const el = scannableElements[currentScanIndex];
      const text = (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim();
      triggerVisualAlert((currentLang === 'am' ? 'ተመርጧል፡ ' : 'Selected: ') + text.slice(0, 35));
      el.click();
    }
  }

  function renderScanPill(show) {
    if (scanPillEl) {
      scanPillEl.remove();
      scanPillEl = null;
    }
    if (!show) return;

    scanPillEl = document.createElement('div');
    scanPillEl.id = 'sa11y-scan-pill';
    scanPillEl.className = 'sa11y-status-pill sa11y-scan-active-pill';
    scanPillEl.setAttribute('role', 'status');
    scanPillEl.innerHTML = `
      <span aria-hidden="true" class="sa11y-pill-icon">⚡</span>
      <span class="sa11y-pill-text">${i18n[currentLang].scanActive}</span>
      <button type="button" class="sa11y-pill-stop-btn" aria-label="Stop scanner">✕</button>
    `;
    scanPillEl.querySelector('.sa11y-pill-stop-btn').addEventListener('click', stopSwitchScanner);
    document.body.appendChild(scanPillEl);
  }

  function startSwitchScanner() {
    isAutoScanActive = true;
    scannableElements = getScannableElements();
    currentScanIndex = 0;
    updateScanHighlight(currentScanIndex);
    renderScanPill(true);

    if (scanIntervalId) clearInterval(scanIntervalId);
    scanIntervalId = setInterval(() => {
      if (!isAutoScanActive) return;
      scannableElements = getScannableElements();
      if (scannableElements.length === 0) return;
      currentScanIndex = (currentScanIndex + 1) % scannableElements.length;
      updateScanHighlight(currentScanIndex);
    }, 2500);

    announce(i18n[currentLang].scanActive);
    triggerVisualAlert(i18n[currentLang].scanActive);
    updateMotorBarButtonsState();
  }

  function stopSwitchScanner() {
    isAutoScanActive = false;
    if (scanIntervalId) {
      clearInterval(scanIntervalId);
      scanIntervalId = null;
    }
    document.querySelectorAll('.sa11y-scan-highlight').forEach(el => el.classList.remove('sa11y-scan-highlight'));
    renderScanPill(false);
    announce(i18n[currentLang].scanStopped);
    updateMotorBarButtonsState();
  }

  function toggleSwitchScanner(force) {
    const nextState = (typeof force === 'boolean') ? force : !isAutoScanActive;
    if (nextState) {
      startSwitchScanner();
    } else {
      stopSwitchScanner();
    }
  }

  /* ── 14. Hands-Free Voice Navigation ────────────────────────────────────── */
  function renderVoicePill(show, commandText) {
    if (voicePillEl) {
      voicePillEl.remove();
      voicePillEl = null;
    }
    if (!show) return;

    voicePillEl = document.createElement('div');
    voicePillEl.id = 'sa11y-voice-pill';
    voicePillEl.className = 'sa11y-status-pill sa11y-voice-active-pill';
    voicePillEl.setAttribute('role', 'status');
    voicePillEl.innerHTML = `
      <span aria-hidden="true" class="sa11y-pill-mic-pulse">🎙️</span>
      <span class="sa11y-pill-text">${commandText || i18n[currentLang].voiceNavActive}</span>
      <button type="button" class="sa11y-pill-stop-btn" aria-label="Stop voice navigation">✕</button>
    `;
    voicePillEl.querySelector('.sa11y-pill-stop-btn').addEventListener('click', stopVoiceNav);
    document.body.appendChild(voicePillEl);
  }

  function startVoiceNav() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      announce(i18n[currentLang].voiceNavUnsupported);
      triggerVisualAlert(i18n[currentLang].voiceNavUnsupported);
      return;
    }

    try {
      voiceRecognition = new SpeechRecognition();
      voiceRecognition.continuous = true;
      voiceRecognition.interimResults = false;
      voiceRecognition.lang = (currentLang === 'am') ? 'am-ET' : 'en-US';

      voiceRecognition.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (!lastResult.isFinal) return;
        const transcript = (lastResult[0].transcript || '').trim().toLowerCase();
        processVoiceCommand(transcript);
      };

      voiceRecognition.onerror = (e) => {
        console.warn('SpeechRecognition notice:', e.error);
      };

      voiceRecognition.onend = () => {
        if (isVoiceNavActive) {
          try { voiceRecognition.start(); } catch (_) {}
        }
      };

      voiceRecognition.start();
      isVoiceNavActive = true;
      renderVoicePill(true);
      announce(i18n[currentLang].voiceNavActive);
      triggerVisualAlert(i18n[currentLang].voiceNavActive);
      updateMotorBarButtonsState();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      announce(i18n[currentLang].voiceNavUnsupported);
    }
  }

  function stopVoiceNav() {
    isVoiceNavActive = false;
    if (voiceRecognition) {
      try { voiceRecognition.stop(); } catch (_) {}
      voiceRecognition = null;
    }
    renderVoicePill(false);
    announce(i18n[currentLang].voiceNavStopped);
    updateMotorBarButtonsState();
  }

  function toggleVoiceNav(force) {
    const nextState = (typeof force === 'boolean') ? force : !isVoiceNavActive;
    if (nextState) {
      startVoiceNav();
    } else {
      stopVoiceNav();
    }
  }

  function processVoiceCommand(cmd) {
    renderVoicePill(true, (currentLang === 'am' ? 'የተሰማው ትዕዛዝ፡ ' : 'Voice Command: ') + `"${cmd}"`);

    if (cmd.includes('next') || cmd.includes('forward') || cmd.includes('ቀጣይ')) {
      navigateNextLesson();
    } else if (cmd.includes('back') || cmd.includes('previous') || cmd.includes('ተመለስ')) {
      navigatePrevLesson();
    } else if (cmd.includes('complete') || cmd.includes('finish') || cmd.includes('done') || cmd.includes('ጨርስ')) {
      triggerCompleteLesson();
    } else if (cmd.includes('down') || cmd.includes('ወደ ታች')) {
      window.scrollBy({ top: 450, behavior: 'smooth' });
    } else if (cmd.includes('up') || cmd.includes('ወደ ላይ')) {
      window.scrollBy({ top: -450, behavior: 'smooth' });
    } else if (cmd.includes('read') || cmd.includes('speak') || cmd.includes('listen') || cmd.includes('አንብብ')) {
      readCurrentLessonAloud();
    } else if (cmd.includes('stop') || cmd.includes('pause') || cmd.includes('አቁም')) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (isAutoScanActive) stopSwitchScanner();
    } else if (cmd.includes('help') || cmd.includes('shortcut') || cmd.includes('እርዳታ')) {
      openShortcutsModal();
    } else if (cmd.includes('scan') || cmd.includes('switch') || cmd.includes('ስካነር')) {
      toggleSwitchScanner();
    }
  }

  /* ── 15. Sticky Motor Action Bar UI ─────────────────────────────────────── */
  function injectStickyMotorBar() {
    if (document.getElementById('sa11y-motor-toolbar')) return;

    const t = i18n[currentLang];
    const bar = document.createElement('nav');
    bar.id = 'sa11y-motor-toolbar';
    bar.className = 'sa11y-motor-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t.motorBarLabel);

    bar.innerHTML = `
      <div class="sa11y-motor-buttons">
        <button type="button" id="sa11y-btn-back" class="sa11y-motor-btn" title="${t.btnMotorBack}" aria-label="${t.btnMotorBack}">
          <span aria-hidden="true" class="sa11y-btn-icon">⬅</span>
          <span class="sa11y-btn-text">${t.btnMotorBack}</span>
        </button>
        <button type="button" id="sa11y-btn-complete" class="sa11y-motor-btn sa11y-btn-accent" title="${t.btnMotorComplete}" aria-label="${t.btnMotorComplete}">
          <span aria-hidden="true" class="sa11y-btn-icon">✓</span>
          <span class="sa11y-btn-text">${t.btnMotorComplete}</span>
        </button>
        <button type="button" id="sa11y-btn-next" class="sa11y-motor-btn" title="${t.btnMotorNext}" aria-label="${t.btnMotorNext}">
          <span aria-hidden="true" class="sa11y-btn-icon">➡</span>
          <span class="sa11y-btn-text">${t.btnMotorNext}</span>
        </button>
        <button type="button" id="sa11y-btn-voice" class="sa11y-motor-btn ${isVoiceNavActive ? 'sa11y-active-mode' : ''}" title="${t.btnVoiceNav}" aria-label="${t.btnVoiceNav}" aria-pressed="${isVoiceNavActive}">
          <span aria-hidden="true" class="sa11y-btn-icon">🎙️</span>
          <span class="sa11y-btn-text">${t.btnVoiceNav}</span>
        </button>
        <button type="button" id="sa11y-btn-scan" class="sa11y-motor-btn ${isAutoScanActive ? 'sa11y-active-mode' : ''}" title="${t.btnAutoScan}" aria-label="${t.btnAutoScan}" aria-pressed="${isAutoScanActive}">
          <span aria-hidden="true" class="sa11y-btn-icon">⚡</span>
          <span class="sa11y-btn-text">${t.btnAutoScan}</span>
        </button>
        <button type="button" id="sa11y-btn-shortcuts" class="sa11y-motor-btn" title="${t.btnShortcuts}" aria-label="${t.btnShortcuts}">
          <span aria-hidden="true" class="sa11y-btn-icon">❓</span>
          <span class="sa11y-btn-text">${t.btnShortcuts}</span>
        </button>
      </div>
    `;

    document.body.appendChild(bar);
    motorBarEl = bar;

    bar.querySelector('#sa11y-btn-back').addEventListener('click', navigatePrevLesson);
    bar.querySelector('#sa11y-btn-complete').addEventListener('click', triggerCompleteLesson);
    bar.querySelector('#sa11y-btn-next').addEventListener('click', navigateNextLesson);
    bar.querySelector('#sa11y-btn-voice').addEventListener('click', () => toggleVoiceNav());
    bar.querySelector('#sa11y-btn-scan').addEventListener('click', () => toggleSwitchScanner());
    bar.querySelector('#sa11y-btn-shortcuts').addEventListener('click', openShortcutsModal);
  }

  function removeStickyMotorBar() {
    if (motorBarEl && motorBarEl.parentNode) {
      motorBarEl.parentNode.removeChild(motorBarEl);
    }
    motorBarEl = null;
  }

  function updateMotorBarButtonsState() {
    if (!motorBarEl) return;
    const voiceBtn = motorBarEl.querySelector('#sa11y-btn-voice');
    if (voiceBtn) {
      voiceBtn.classList.toggle('sa11y-active-mode', isVoiceNavActive);
      voiceBtn.setAttribute('aria-pressed', String(isVoiceNavActive));
    }
    const scanBtn = motorBarEl.querySelector('#sa11y-btn-scan');
    if (scanBtn) {
      scanBtn.classList.toggle('sa11y-active-mode', isAutoScanActive);
      scanBtn.setAttribute('aria-pressed', String(isAutoScanActive));
    }
  }

  function updateStickyMotorBarLanguage() {
    if (!motorBarEl) return;
    const t = i18n[currentLang];
    motorBarEl.setAttribute('aria-label', t.motorBarLabel);

    const map = [
      { id: '#sa11y-btn-back', text: t.btnMotorBack },
      { id: '#sa11y-btn-complete', text: t.btnMotorComplete },
      { id: '#sa11y-btn-next', text: t.btnMotorNext },
      { id: '#sa11y-btn-voice', text: t.btnVoiceNav },
      { id: '#sa11y-btn-scan', text: t.btnAutoScan },
      { id: '#sa11y-btn-shortcuts', text: t.btnShortcuts }
    ];

    map.forEach(item => {
      const btn = motorBarEl.querySelector(item.id);
      if (btn) {
        btn.setAttribute('title', item.text);
        btn.setAttribute('aria-label', item.text);
        const txtSpan = btn.querySelector('.sa11y-btn-text');
        if (txtSpan) txtSpan.textContent = item.text;
      }
    });

    if (shortcutsModalEl) {
      shortcutsModalEl.remove();
      shortcutsModalEl = null;
    }
  }

  /* ── 16. Shortcuts Guide Modal ─────────────────────────────────────────── */
  function buildShortcutsModal() {
    if (document.getElementById('sa11y-shortcuts-backdrop')) {
      return document.getElementById('sa11y-shortcuts-backdrop');
    }

    const t = i18n[currentLang];
    const backdrop = document.createElement('div');
    backdrop.id = 'sa11y-shortcuts-backdrop';
    backdrop.className = 'sa11y-backdrop';
    backdrop.setAttribute('hidden', '');

    backdrop.innerHTML = `
      <div class="sa11y-modal sa11y-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="sa11y-shortcuts-title" aria-describedby="sa11y-shortcuts-desc">
        <div class="sa11y-modal-header">
          <div class="sa11y-title-group">
            <h2 id="sa11y-shortcuts-title">
              <span aria-hidden="true">⌨️</span>
              <span>${t.shortcutsModalTitle}</span>
            </h2>
            <p id="sa11y-shortcuts-desc">${t.shortcutsModalDesc}</p>
          </div>
          <button type="button" id="sa11y-shortcuts-close" class="sa11y-close-btn" aria-label="${t.closeLabel}">✕</button>
        </div>
        <div class="sa11y-modal-body">
          <div class="sa11y-shortcuts-table-wrap">
            <table class="sa11y-shortcuts-table">
              <thead>
                <tr>
                  <th scope="col">${currentLang === 'am' ? 'ቁልፍ' : 'Shortcut'}</th>
                  <th scope="col">${currentLang === 'am' ? 'ተግባር' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><kbd>J</kbd></td><td>${t.shortcutNext}</td></tr>
                <tr><td><kbd>K</kbd></td><td>${t.shortcutPrev}</td></tr>
                <tr><td><kbd>C</kbd></td><td>${t.shortcutComplete}</td></tr>
                <tr><td><kbd>S</kbd></td><td>${t.shortcutScan}</td></tr>
                <tr><td><kbd>V</kbd></td><td>${t.shortcutVoice}</td></tr>
                <tr><td><kbd>?</kbd></td><td>${t.shortcutHelp}</td></tr>
                <tr><td><kbd>Space / Enter</kbd></td><td>${currentLang === 'am' ? 'በስካነር ውስጥ ንቁ የሆነውን መምረጥ' : 'Select active element during Auto-Scan'}</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>${t.shortcutEsc}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="sa11y-voice-commands-card">
            <h4><span aria-hidden="true">🎙️</span> ${currentLang === 'am' ? 'እጅ-አልባ የድምፅ ትዕዛዞች' : 'Hands-Free Voice Commands'}</h4>
            <p class="sa11y-code-pill">${t.voiceCmdList}</p>
          </div>
        </div>
        <div class="sa11y-modal-footer">
          <button type="button" id="sa11y-shortcuts-ok" class="sa11y-btn sa11y-btn-primary">
            ${currentLang === 'am' ? 'ተረዳሁ' : 'Got it'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    shortcutsModalEl = backdrop;

    const closeBtn = backdrop.querySelector('#sa11y-shortcuts-close');
    const okBtn = backdrop.querySelector('#sa11y-shortcuts-ok');
    closeBtn.addEventListener('click', closeShortcutsModal);
    okBtn.addEventListener('click', closeShortcutsModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeShortcutsModal();
    });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeShortcutsModal();
    });

    return backdrop;
  }

  function openShortcutsModal() {
    if (!shortcutsModalEl) shortcutsModalEl = buildShortcutsModal();
    isShortcutsOpen = true;
    shortcutsModalEl.removeAttribute('hidden');
    const okBtn = shortcutsModalEl.querySelector('#sa11y-shortcuts-ok');
    if (okBtn) okBtn.focus();
  }

  function closeShortcutsModal() {
    if (!shortcutsModalEl) return;
    isShortcutsOpen = false;
    shortcutsModalEl.setAttribute('hidden', '');
    if (motorBarEl) {
      const btn = motorBarEl.querySelector('#sa11y-btn-shortcuts');
      if (btn) btn.focus();
    }
  }

  /* ── 17. Motor Adaptation Controller ────────────────────────────────────── */
  function adaptMotorAndMobility(enable) {
    if (enable) {
      document.documentElement.setAttribute('data-sa11y-motor', 'true');
      injectStickyMotorBar();
      window.addEventListener('keydown', handleSingleKeyShortcuts);
    } else {
      document.documentElement.removeAttribute('data-sa11y-motor');
      removeStickyMotorBar();
      stopSwitchScanner();
      stopVoiceNav();
      window.removeEventListener('keydown', handleSingleKeyShortcuts);
      if (isShortcutsOpen) closeShortcutsModal();
    }
  }

  /* ── 18. Master Adaptation Controller ──────────────────────────────────── */
  function applyAdaptations(profile) {
    if (!profile) return;
    adaptBlindAndScreenReader(Boolean(profile.screenReader));
    adaptLowVisionContrast(Boolean(profile.highContrast));
    adaptDeafAndHearing(Boolean(profile.captionsTranscripts));
    adaptMotorAndMobility(Boolean(profile.motorAssistance));
  }

  // Hook form submissions (e.g. "Mark as complete") to flash visual alert
  document.addEventListener('submit', () => {
    if (activeProfile && activeProfile.captionsTranscripts) {
      triggerVisualAlert(currentLang === 'am' ? 'ተግባሩ ተጠናቋል!' : 'Activity marked as complete!');
    }
  });

  // Watch for dynamic DOM changes (module swaps, accordion changes)
  let mutationTimeout = null;
  const observer = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      if (activeProfile && activeProfile.screenReader) {
        adaptBlindAndScreenReader(true);
      }
    }, 100);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen to profile updates
  window.addEventListener('savanna:a11y-profile-changed', (e) => {
    activeProfile = e.detail;
    applyAdaptations(activeProfile);
  });

  /* ── 12. Initial Mount & Check ────────────────────────────────────────── */
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
      activeProfile = stored;
      applyAdaptations(activeProfile);
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
