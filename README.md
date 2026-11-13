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

## Inklu — Learning without barriers

Open the floating **Inklu Companion** button on the lesson page. Its desktop drawer
becomes a full-screen reader on small screens. Choose **Explain Simply** for a
beginner-friendly English explanation, **Translate** for Amharic, or **Describe Visuals**
then **Describe images** for AI descriptions of the lesson artwork. Inklu sends each
distinct local PNG and a short excerpt of nearby lesson text to Addis AI. After translating, choose **Generate Audio**
on the passage you want to hear. [Backend setup and testing instructions](backend/README.md#live-lesson-translation)

To embed the companion, copy `assets/learning-companion/`, load `lesson-content.js`,
`amharic-audio.js`, and `learning-companion.js` in order as classic scripts, and place `<alx-learning-companion></alx-learning-companion>`
at the desired location. The widget loads its neighboring stylesheet into its shadow root.
The debug preview and Amharic translation both read the current lesson through the extractor.
The translation action sends its title and body to the same-origin `POST /api/translate` endpoint.
After translation, choose **Generate Audio** on a passage. Inklu plays a saved clip or
generates one within the allowance configured on the server. See the
[speech controls and testing guide](backend/README.md#amharic-audio).

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

### Developer preview

Append `?inkluDebug=1` to a lesson or fixture URL to enable the **Extracted lesson
content** disclosure inside the drawer. Close the drawer to change lessons in
`tests/lesson-content.html`, then reopen it to inspect the new content. The
production UI hides this disclosure by default.

### Keyboard and screen reader checks

1. Tab to **Inklu Companion** and press Enter or Space. The modal
   announces its name and current lesson. Initial focus is on **Close Inklu**.
2. Tab through the three actions and use Enter or Space to choose one. Results
   appear below the actions. While Explain Simply is loading, choose Describe Visuals.
   Check that completion is announced once and focus stays on Describe Visuals.
   Return to Explain Simply and Tab past the actions to the explanation. In NVDA
   Browse Mode, use H to move between headings, Down Arrow to read line by line,
   and Say All to read continuously through the paragraphs and lists.
3. After approving live spending, activate **Translate**. Tab to **Generate Audio for passage 1** and press Space.
   The clip plays when ready. Tab to **Pause**, then Shift+Tab to **Play or resume**.
   **Stop** returns to the beginning. An audio error is announced without moving focus.
4. Escape or **Close Inklu** restores focus to the launcher. Reopening the same
   lesson retains the translation. Choosing another action or closing the drawer cancels
   pending playback and stops playback.

### Offline browser tests

Install backend dependencies once, then run the separate UI test package from the
repository root. The tests use an installed Chrome browser. To use another Chromium
binary, set `INKLU_CHROMIUM` to its full path. The browser tests use a keyless server
and mocked API responses.

```powershell
npm.cmd ci --prefix backend
npm.cmd test --prefix backend
npm.cmd ci --prefix tests/browser
npm.cmd test --prefix tests/browser
```

The desktop and mobile captures in `docs/screenshots/inklu/` use sample Amharic text
and a mock audio clip. To regenerate them, set `INKLU_SCREENSHOTS` to the absolute
output directory before running the browser tests.
