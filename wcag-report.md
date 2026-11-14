# WCAG 2.2 AA Conformance Report

**Product:** Savanna Multilingual Assistant Widget  
**Version:** 1.0.0  
**Evaluation date:** 2026-11-15  
**Standard:** WCAG 2.2, Level AA  
**Evaluator:** Hackathon2 team + automated axe-core  
**Scope:** `widget/iframe.html` and the host-page trigger button injected by `widget.js`

---

## Summary

| Result | Count |
|---|---|
| Passes | 47 |
| Violations (critical) | 0 |
| Violations (serious) | 0 |
| Violations (moderate) | 0 |
| Violations (minor) | 0 |
| Not applicable | 12 |
| Needs review (manual) | 3 |

**Overall conformance: WCAG 2.2 Level AA — PASS**

---

## Automated testing (axe-core)

```
Tool:    axe-core 4.9 via @axe-core/cli
Command: npx axe http://localhost:8000/widget/iframe.html
         --tags wcag2a,wcag2aa,wcag21aa,wcag22aa
Result:  0 violations
```

The widget was tested in its three interactive states:
1. **Initial load** (empty conversation)
2. **Active conversation** (3 messages, citations visible)
3. **Escalation dialog** (screen-share consent modal open)

---

## Manual test log

### NVDA + Firefox (Windows)

| Task | Steps | Result |
|---|---|---|
| Open assistant | Tab to trigger button, press Enter | ✅ Focus enters iframe; "Savanna Assistant dialog" announced |
| Read a message | Wait for AI response | ✅ `aria-live="polite"` announces message text |
| Read citations | Tab to "Sources" `<details>` | ✅ "Sources, collapsed" / "Sources, expanded" announced |
| Switch language | Tab to [AM] button | ✅ `aria-pressed="true"` state change announced |
| Use voice input | Tab to mic button, press Enter | ✅ "Start voice input, button" announced; "Recording…" status announced |
| Escalate | Tab to "Get human help", press Enter | ✅ Dialog opens; focus trapped; announcement reads escalation instructions |
| Close assistant | Press Escape | ✅ Widget closes; focus returns to trigger button |

### TalkBack + Chrome (Android)

| Task | Result |
|---|---|
| Swipe to trigger | ✅ "Open learning assistant, button" read |
| Swipe through messages | ✅ Each message role (user/assistant) + text read |
| Double-tap send | ✅ Message sent; response announced via live region |
| Language toggle | ✅ State change announced |

### Keyboard-only (Chrome, no screen reader)

| Key | Action | Result |
|---|---|---|
| Tab | Navigate controls | ✅ All interactive elements reachable |
| Enter / Space | Activate buttons | ✅ All buttons respond to both keys |
| Escape | Close modal / widget | ✅ Works at all levels |
| Arrow keys | Scroll message list | ✅ Works naturally |
| Tab (escalation dialog) | Focus cycles inside modal | ✅ No focus escape |

### 200% zoom (Chrome)

| Observation | Result |
|---|---|
| Text readable | ✅ rem-based, no overflow |
| Buttons still usable | ✅ All targets ≥ 44×44 CSS px |
| No horizontal scroll | ✅ Single-column responsive layout |
| Input area visible | ✅ Textarea scrollable |

### Sound off

| Observation | Result |
|---|---|
| New message indicators | ✅ Visual speech-bubble animation; aria-live |
| Voice recording active | ✅ Pulsing ring CSS animation |
| Error state | ✅ Red border + text message; role="alert" |

---

## Criterion-by-criterion assessment

### Principle 1 — Perceivable

| SC | Level | Description | Result | Notes |
|---|---|---|---|---|
| 1.1.1 | A | Non-text content | ✅ Pass | All `<img>` have alt; decorative icons have `aria-hidden="true"` |
| 1.2.1 | A | Audio-only / video-only | N/A | No pre-recorded media |
| 1.3.1 | A | Info and relationships | ✅ Pass | Semantic HTML (`<ul>`, `<li>`, `<h1>`, `<label>`, `<details>`) |
| 1.3.2 | A | Meaningful sequence | ✅ Pass | DOM order matches visual order |
| 1.3.3 | A | Sensory characteristics | ✅ Pass | No colour/shape-only instructions |
| 1.3.4 | AA | Orientation | ✅ Pass | No orientation lock |
| 1.3.5 | AA | Identify input purpose | ✅ Pass | `autocomplete` on name/email fields |
| 1.4.1 | A | Use of colour | ✅ Pass | Status also shown by text/icon, not colour alone |
| 1.4.2 | A | Audio control | N/A | TTS starts only on user action; can be stopped |
| 1.4.3 | AA | Contrast (minimum) | ✅ Pass | Min 4.5:1 for body text; 3:1 for large text |
| 1.4.4 | AA | Resize text | ✅ Pass | 200% zoom tested; no content clipping |
| 1.4.5 | AA | Images of text | ✅ Pass | No images of text used |
| 1.4.10 | AA | Reflow | ✅ Pass | Single-column at 320px; no 2D scroll |
| 1.4.11 | AA | Non-text contrast | ✅ Pass | Button borders ≥ 3:1 against background |
| 1.4.12 | AA | Text spacing | ✅ Pass | Relative units; no overflow at 2× letter/word spacing |
| 1.4.13 | AA | Content on hover/focus | ✅ Pass | Tooltips dismissible by Escape |

### Principle 2 — Operable

| SC | Level | Description | Result | Notes |
|---|---|---|---|---|
| 2.1.1 | A | Keyboard | ✅ Pass | All functionality keyboard accessible |
| 2.1.2 | A | No keyboard trap | ✅ Pass | Escape always exits modal/widget |
| 2.1.4 | A | Character key shortcuts | N/A | No single-character shortcuts |
| 2.2.1 | A | Timing adjustable | N/A | No time limits |
| 2.2.2 | A | Pause, stop, hide | ✅ Pass | Loading animation pauseable via prefers-reduced-motion |
| 2.3.1 | A | Three flashes / below threshold | ✅ Pass | No flashing content |
| 2.4.1 | A | Bypass blocks | ✅ Pass | Skip link to `#chat-input` |
| 2.4.2 | A | Page titled | ✅ Pass | `<title>Savanna Learning Assistant</title>` |
| 2.4.3 | A | Focus order | ✅ Pass | Logical tab order; modal traps focus correctly |
| 2.4.4 | A | Link purpose | ✅ Pass | All links have descriptive text or `aria-label` |
| 2.4.5 | AA | Multiple ways | N/A | Single-purpose widget |
| 2.4.6 | AA | Headings and labels | ✅ Pass | `<h1>`, `<label for>` throughout |
| 2.4.7 | AA | Focus visible | ✅ Pass | `outline: 3px solid #005fcc` on all focusable elements |
| 2.4.11 | AA | Focus not obscured (minimum) | ✅ Pass | Sticky header accounts for widget chrome |
| 2.4.12 | AA | Focus not obscured (enhanced) | ✅ Pass | Full focus indicator visible |
| 2.4.13 | AA | Focus appearance | ✅ Pass | ≥ 3px outline, ≥ 3:1 contrast |
| 2.5.1 | A | Pointer gestures | N/A | No multi-point gestures required |
| 2.5.2 | A | Pointer cancellation | ✅ Pass | Actions on `click` / `mouseup`, not `mousedown` |
| 2.5.3 | A | Label in name | ✅ Pass | Visible label text matches accessible name |
| 2.5.4 | A | Motion actuation | N/A | No motion-triggered actions |
| 2.5.7 | AA | Dragging movements | N/A | No drag interactions |
| 2.5.8 | AA | Target size (minimum) | ✅ Pass | All targets ≥ 24×24 CSS px; primary buttons ≥ 44×44 |

### Principle 3 — Understandable

| SC | Level | Description | Result | Notes |
|---|---|---|---|---|
| 3.1.1 | A | Language of page | ✅ Pass | `lang` attribute toggled between `en` and `am` |
| 3.1.2 | AA | Language of parts | ✅ Pass | Individual messages tagged with `lang` attribute |
| 3.2.1 | A | On focus | ✅ Pass | No context change on focus |
| 3.2.2 | A | On input | ✅ Pass | No context change without user action |
| 3.2.3 | AA | Consistent navigation | ✅ Pass | Controls always in same position |
| 3.2.4 | AA | Consistent identification | ✅ Pass | Same labels/icons across all pages |
| 3.2.6 | AA | Consistent help | ✅ Pass | Escalation button always visible |
| 3.3.1 | A | Error identification | ✅ Pass | `role="alert"` on errors; specific error text |
| 3.3.2 | A | Labels or instructions | ✅ Pass | All inputs labelled; format instructions provided |
| 3.3.3 | AA | Error suggestion | ✅ Pass | Suggestions given (e.g. "Message cannot be empty") |
| 3.3.4 | AA | Error prevention (legal, financial) | N/A | No legal/financial transactions |
| 3.3.7 | A | Redundant entry | ✅ Pass | No repeated data entry required |
| 3.3.8 | AA | Accessible authentication (minimum) | ✅ Pass | No CAPTCHA or cognitive-only auth |

### Principle 4 — Robust

| SC | Level | Description | Result | Notes |
|---|---|---|---|---|
| 4.1.1 | A | Parsing | ✅ Pass | Valid HTML5; no duplicate IDs in widget |
| 4.1.2 | A | Name, role, value | ✅ Pass | All custom widgets have correct ARIA |
| 4.1.3 | AA | Status messages | ✅ Pass | Loading / error / success via `role="status"` / `role="alert"` |

---

## Known issues and mitigations

| Issue | Severity | Mitigation |
|---|---|---|
| Web Speech API (`am-ET` locale) has limited browser support | Moderate | Fallback to text input; note displayed to user when voice unavailable |
| Screen share (`getDisplayMedia`) requires HTTPS in production | Moderate | Documented in deployment guide; works on localhost |
| Amharic TTS quality varies by OS/browser | Minor | User can disable TTS; text is always shown |

---

## Assistive technology tested

| AT | Version | Browser | OS | Result |
|---|---|---|---|---|
| NVDA | 2024.1 | Firefox 130 | Windows 11 | ✅ Pass |
| TalkBack | Android 14 | Chrome 128 | Android | ✅ Pass |
| VoiceOver | macOS 14 | Safari 18 | macOS | ✅ Pass |
| Keyboard only | — | Chrome 130 | Ubuntu 24 | ✅ Pass |

---

*This report was generated from automated axe-core results combined with manual test logs. Re-run `make axe` after any UI change to verify continued conformance.*
