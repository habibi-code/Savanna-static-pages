# Inklu host and deployment audit

| Integration point | Default and portability boundary |
| --- | --- |
| Lesson discovery | The original component and extractor both looked for `#curriculum_navigation_content`. The shared host adapter now selects the closest matching ancestor or first document match using `lesson-selector`. The existing extractor entry point `SavannaLessonContent.extractLesson()` retains the Savanna default. |
| Reading order and image context | The first visible `h1`, outermost `.formatted-content, .savanna-styles` descendants, nested-wrapper check and closest image context wrapper used Savanna's layout. `title-selector` and `content-selector` now drive preview, text and image extraction together. Per-image context still uses semantic headings, paragraphs, marks and figure captions. |
| Exclusions | The Savanna default skips Bootstrap's `.btn`, `.progress` and `.dropdown-menu`. A custom lesson root uses only the shared native/ARIA and visibility exclusions unless you set `exclude-selector`. Both exclude the `alx-learning-companion` element to avoid extracting its own interface. The tag name and original JS alias are compatibility names. |
| Embedding | Savanna's lesson references three classic scripts under `../assets/learning-companion/`. The component resolves its CSS next to its script and uses a shadow root. Host scripts must load the extractor and audio module before the component. The observer tracks changes in the document while the drawer is open. The launcher needs to persist or be remounted after navigation. |
| Browser requests | Simplify and Translate shared a root-relative fetch. Describe and speech each had separate root-relative fetches. All four use the embed's `api-base`, default `/api/`. The page must use HTTP(S). Cross-origin APIs require HTTPS except on loopback. URL credentials, query and fragment are rejected. |
| Backend hosts, routes and static assets | The listener uses IPv4 loopback and `PORT` (default 3000). Originally Host had to equal localhost or 127.0.0.1 plus the listening port; a supplied Origin had to equal HTTP plus Host, with no cross-origin preflight. These checks remain the default. The static handler serves only the index, the lesson test fixture, `pages/*.html` and supported files in fixed public asset subdirectories. Deploy host pages on their own site or proxy the four backend routes. |
| Images | Extraction originally required same-origin `/assets/img/<basename>.png`. `image-base` configures that URL directory (an absolute path on the lesson origin). Query strings, fragments, credentials, nested paths and remote URLs are excluded. The server defaults to the repository's `assets/img`; `INKLU_IMAGE_DIRECTORY` sets a trusted local directory. The server accepts restricted PNG basenames only, checks real paths, PNG headers, a 2 MiB limit and a 16 megapixel limit. One API instance uses one asset directory; filenames must identify the same image on both sides. |

## Reverse proxy setup

Prefer a same-origin prefix. For example, expose `https://learn.school.example/inklu/api/`,
strip `/inklu` at the TLS proxy, and forward to `http://127.0.0.1:3000/api/`.
Set `INKLU_PUBLIC_ORIGIN=https://learn.school.example` and have the proxy pass that
exact Host (including any nondefault port). The server ignores forwarded Host and
protocol headers. Leave `INKLU_LESSON_ORIGINS` empty for this deployment.

For a separate API, set `INKLU_PUBLIC_ORIGIN=https://api.school.example` and
`INKLU_LESSON_ORIGINS=https://learn.school.example`. Set the embed's `api-base`
to `https://api.school.example/api/`. Multiple lesson origins are comma-separated
exact origins, without trailing slashes, paths or wildcards. Restart after changing
the environment. Only approved cross-origin JSON POSTs and their Content-Type preflights
receive CORS access. Cross-origin requests do not use cookies. With a strict host CSP,
allow the widget's scripts and stylesheet, the API in `connect-src`, and `blob:` in
`media-src` for generated speech.

## Before public deployment

- Put the service behind TLS and an authenticated LMS gateway. Host/Origin checks
  constrain browser use; non-browser clients can omit Origin. The Node service has
  no learner identity, authorization, tenant isolation or per-learner quotas.
- Request limits and text/image caches are per process. The speech allowance covers
  estimated speech costs only. Other paid operations need a deployment spending policy.
- Persist the audio directory, MP3s and reservation ledger on storage with suitable
  locking before running multiple instances. Provision lesson PNGs separately.
- Verify focus, announcements, extraction boundaries and content policy on the actual
  LMS with NVDA. A host that changes the mount, blocks scripts or embeds lessons inside
  a different document must install Inklu in the lesson document.
