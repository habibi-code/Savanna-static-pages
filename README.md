# Savanna static pages

Three Savanna learner pages, frozen from the **local dev app** into plain HTML + CSS so they can be
opened offline and used as a reference for front-end and accessibility work.

Open `index.html` (or any file in `pages/`) directly with `file://` — double-clicking works, no
server needed.

## What is here

| Page | Learner / course | What it shows |
|------|------------------|----------------|
| `pages/homepage-v1-paced.html` | Björn Sibanda — **WR 100: Fundamentals of Effective Communication**, cohort F26-SEM-16W (31 Aug – 20 Dec 2026), week 10 of 15 | Courses dropdown (3 courses), week strip with **every week preloaded**, "continue where you left off", immediate deliverables, period progress, overall score (59.56%, "slightly behind"), upcoming events |
| `pages/homepage-v1-self-paced.html` | Amara Nwosu — **VA-1: VA Foundations & Professional Identity** | Course-progression gauge (16% against the 70% graduation threshold), 1 of 3 modules complete, **working module switcher**, **preloaded programme modal**, pacing boost (11 days left), upcoming events |
| `pages/concept-with-navigation.html` | Amara Nwosu — concept *"The Future of the VA Industry"* | Curriculum navigation panel (read / current / unread states) beside a full authored concept: callouts, numbered card grid, two-column comparison, icon lists, "Mark as complete". The "Need a Fast Track?" block and the Padlet reflection block are removed on request. |


## Layout

```
savanna_static_pages/
├── index.html                 landing page linking the three captures
├── pages/*.html               the frozen pages (relative links into ../assets)
├── assets/
   ├── css/                   the application's own stylesheets, unminified — application_alx.css 
   │                          (sprockets, themed), app.css (esbuild), Google Fonts, Typekit —
   │                          plus static-page.css, the only one written for these pages
   ├── fonts/                 76 font files, all referenced by the stylesheets above
   ├── img/                   51 images: logos, icons, concept artwork, substituted embeds
   └── js/                    popper.js + bootstrap.bundle.js (the exact files the live app
                              serves through sprockets) + static-page.js
```

Everything is shared: the three pages point at the same `assets/` tree, nothing is duplicated and
nothing is minified or gzipped. Captures are additive, so each run ends by dropping assets no
published page references any more — otherwise the Rive stills from retired week panels would
pile up run after run.

## What still works

These are live in the frozen pages, driven by `assets/js/static-page.js` against content that was
pre-rendered during the capture and parked in `<template>` elements (so nothing is duplicated in
the accessibility tree and no id appears twice):

| Control | Page | Behaviour |
|---|---|---|
| **Hamburger** | all | Collapses the sidebar to its 70px icon rail and back, remembered in `localStorage` under `sidebar-collapsed`. It moves the same three things the app does: `body.sidebar-collapsed`, `expanded` on `#sidebar`, and the labels (React wrote `display` inline on each, so `assets/css/static-page.css` overrides them from the body class). |
| **Week strip** | paced homepage | Every week of the course was rendered server-side at capture time; clicking one swaps the panel below it and moves the `active` state. The chevrons and the scroll-into-view of the selected week are reimplemented from the component's own sidecar JS. |
| **Score details modal** | paced homepage | Server-rendered per week, so it opens on its own — including the one that arrives with a week you switch to. |
| **My activities** | self-paced homepage | Each module's activity list was rendered at capture time; clicking a module swaps the panel beside it, as `HomepageSelfPacedActivities.tsx` does. |
| **Programme modal** | self-paced homepage | "Program details" normally fetches `/dashboards/program_structure.json` on first open — the capture opens it once so the fetched tree is baked in. Its course and module accordions expand and collapse: React renders only the body of an *open* section, so the capture opens each one to materialise its content, pairs every toggle with the element it controls (`data-static-collapse-toggle` / `data-static-collapse-body`) and closes again the ones the app had closed. |
| **Courses dropdown** | all | Server-rendered markup, so Bootstrap's dropdown opens it with no help: three courses across a programme group and "Other courses". |
| **Curriculum bar** | all | The bar fixed under the header pads the content by its own height and slides away on scroll down, as `CurrentCurriculumScrollBehavior.tsx` does. |
| Dropdowns, modals, accordions, collapse, tooltips | all | Bootstrap's own bundle. |

Everything else is inert.

## Accessible Learning Companion

Open `pages/concept-with-navigation.html` directly in a browser. The **Learning companion**
button follows the lesson title, “The Future of the VA Industry”. Each format displays a short,
handwritten example labeled **Demo content**. The Amharic sample carries the `am` language tag.

To embed the companion, copy `assets/learning-companion/`, load `lesson-content.js` followed
by `learning-companion.js` as classic scripts, and place `<alx-learning-companion></alx-learning-companion>`
at the desired location. The widget loads its neighboring stylesheet into its shadow root.
Only **Extracted lesson content (debug preview)** reads the current lesson. All three format
choices use the fixed samples in `demoResponses`.

### Lesson extraction

`SavannaLessonContent.extractLesson(lessonElement)` returns a title string and a detached
`DocumentFragment` in reading order. By default it looks for `#curriculum_navigation_content`,
reads its first visible `h1`, and walks the outermost `.formatted-content` or `.savanna-styles`
wrappers. This keeps headings, loose introductory prose, callouts, paragraphs, lists and captions.
Link text stays readable. Image labels come from `aria-label` or `alt`. Missing alt text gets
a marker, while an explicit empty alt identifies a decorative image.

Navigation, buttons, forms, progress indicators, footers, hidden subtrees and the companion
are excluded. The preview reads authored DOM text. Embedded media, text drawn inside images,
and descriptions supplied only through external ARIA references are outside its scope.

While the panel and preview are open, a mutation observer refreshes the preview when the
lesson changes, including when its content container is replaced. The mount must persist or
be included in the replacement page. Opening the preview again reads the latest content.

### Offline fixture

Open `tests/lesson-content.html` directly. Open **Learning companion**, expand **Extracted
lesson content (debug preview)**, and use **Active test lesson** to switch examples. The meeting
brief should show a numbered list and a banner description. The schedule should show a bulleted
list and one missing-alt marker. Check that switching back restores only the first lesson,
and that **No lesson loaded** clears the preview. Test navigation, controls, and footer text
should never appear in the preview.

### Keyboard and screen reader checks

1. Open the lesson and Tab to **Learning companion**. Look for the focus outline. With NVDA
   and Firefox or Chrome, use the buttons list or navigate from the lesson heading. Listen for
   the button name and its collapsed state.
2. Press Enter or Space. The button should report expanded and keep focus. Tab into
   **Choose a lesson format**. On first use, press Space to select **Simplified English**.
3. Use the arrow keys to select **Amharic** and **Visual content descriptions**. Listen for
   the radio label, checked state, and a polite announcement of **Demo content** and the new
   sample. Focus should stay on the chosen option. Amharic pronunciation depends on the
   reader's language-switching setting and installed voices.
4. Tab to **Extracted lesson content (debug preview)** and press Enter or Space. Focus should
   stay on the disclosure. Use the reader's browsing commands to read the title, headings,
   lists and image labels. In the fixture, switch lessons with the preview open and listen for
   a short status update. Focus should stay on the lesson picker.
5. Tab past the preview or Shift+Tab back to the selected option. Press Escape inside the widget.
   Focus should return to the collapsed button. The choices and response should disappear
   from both the tab order and the screen reader's reading order.
6. Reopen the panel and close it using the same button. Check the lesson's sidebar, course
   dropdown, and curriculum accordion. Open the landing page and both homepages to confirm
   that the companion appears only on the lesson.


