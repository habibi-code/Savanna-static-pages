# Team services in Node

One Node process serves the embedded widget's learning APIs, private Human Help
and optional Telegram polling. `server.js` starts it. `app.js` handles route
registration and Host, Origin and method checks. Middleware handles bounded
JSON, learner identity and rate limits. The learning module uses the existing
provider implementations and speech ledger. Both the CLI and HTTP server use
the shared Addis client. Tutor's future integration point is documented in
[`modules/tutor`](../backend/modules/tutor/README.md).

## Local setup and embedding

Use Node 24 or Node 22.13+ for built-in SQLite. From the repository root:

```powershell
npm.cmd ci --prefix backend
npm.cmd start --prefix backend
```

The default listener is `127.0.0.1:3000`. Open the
[Savanna lesson](http://127.0.0.1:3000/pages/concept-with-navigation.html?inkluDebug=1)
and the [generic lesson](http://127.0.0.1:3000/pages/generic-lesson.html?inkluDebug=1).
On each page open **Inklu Companion**, expand the extraction preview, check
the lesson title and reading order, then use Escape to return to the launcher.
This works without a key. Use the browser suite below for free successful AI
and audio responses. With live credentials, activating learning actions can
spend credit.

Copy the complete `assets/learning-companion` directory, including its CSS.
Load the scripts in order. Place one element in the lesson document:

```html
<script defer src="/inklu/lesson-content.js"></script>
<script defer src="/inklu/amharic-audio.js"></script>
<script defer src="/inklu/reading-actions.js"></script>
<script defer src="/inklu/human-help.js"></script>
<script defer src="/inklu/learning-companion.js"></script>
<alx-learning-companion lesson-selector="#current-lesson" title-selector="h1"
  content-selector=".lesson-body" api-base="/api/"></alx-learning-companion>
```

Older three-script embeds load the new sibling scripts automatically. Omit
selectors to use Savanna defaults. Set `exclude-selector` for host exclusions,
and `image-base` for approved local PNGs. The drawer owns keyboard navigation,
focus restoration and announcements; feature handlers render into its Shadow DOM.

## Server configuration

Use an ignored `backend/.env` or a secret manager. Copy placeholders from
[the environment example](../backend/.env.example). Keep credentials off the page.

| Variable | Use |
| --- | --- |
| `PORT` | Loopback HTTP port, default 3000. |
| `ADDIS_API_KEY` | Live learning requests. Optional for the offline demo. |
| `INKLU_TTS_ALLOWANCE_ETB` | Estimated speech spending allowance, default zero. Retain the audio directory and ledger. Actual charges may differ. |
| `INKLU_CACHED_VOICES` | Optional additional cached voices. |
| `INKLU_PUBLIC_ORIGIN`, `INKLU_LESSON_ORIGINS` | Exact public origin and optional comma-separated lesson origins. |
| `INKLU_IMAGE_DIRECTORY` | Private directory of approved lesson PNGs. |
| `INKLU_HELP_GATEWAY_KEY`, `INKLU_HELP_DB` | LMS gateway secret and absolute private path to the dedicated SQLite file. |
| `INKLU_TELEGRAM_ENABLED`, `INKLU_TELEGRAM_BOT_TOKEN` | Poll only when explicitly enabled with a replacement token. |

Prefer a same-origin HTTPS LMS proxy to Node's loopback listener. Preserve the
public Host, configure its exact public origin and keep the lesson allowlist
empty for a same-origin installation. A separate learning API accepts only
explicitly allowlisted lesson origins. When AI is cross-origin, the widget
still uses the LMS path `/api/help/sessions`. Provide an authenticated same-origin
proxy for both help routes; its trusted upstream Host and Origin must match
the backend deployment. If the gateway maps these headers, it must validate the
original browser Origin against the exact LMS origin before rewriting it.
See [proxy and CSP settings](portability.md).

## Human Help

The HTTPS LMS gateway must authenticate the learner, check access to support,
strip all incoming `X-Inklu-Gateway` and `X-Inklu-Subject` headers (including
duplicates), then inject a shared random 32-byte base64url key and a stable
opaque subject only for the two authorized routes. Use one tenant per deployment.
Subject IDs use 1–128 ASCII letters, digits, underscores or hyphens. Protect the
internal listener and never log gateway credentials.

| Route | Result |
| --- | --- |
| `POST /api/help/sessions` with JSON `{}` | HTTP 201 with `{sessionId,status:"pending"}`. Duplicate requests reuse the same open ticket. |
| `GET /api/help/sessions/{sessionId}` | HTTP 200 with the owner's ticket ID and status. Unknown and other learners' tickets both return 404. |

To migrate, stop the old service, back up its dedicated SQLite database, then
give Node its original absolute file path via `INKLU_HELP_DB`. The schema,
UUIDs and one-open-ticket index are compatible. Stored `open` maps to public
`pending`. Retire the FastAPI service key and port. Keep the database outside
served directories with restricted permissions, backups and a retention policy.
Node 22.9–22.12 requires `--experimental-sqlite` if used for the full suite.

Designated operators must monitor the private queue and follow up through the
LMS. Read `SELECT ticket_id,user_id,created_at FROM tickets WHERE status='open' ORDER BY created_at`.
After follow-up use a parameterized update on the matching ticket ID to resolve it.
A later request then creates another ticket. Independent database copies have
independent queues. Chat, tutor assignment and screen capture await participant
authorization, learner consent and complete signaling.

## Telegram and Career

The optional private-chat poller supports `/start`, `/help`, `/language`,
`/jobs`, `/courses`, `/alerts` and `/accommodation`. The career catalog
preserves Barok's sample roles and course topics in six languages. Command
guidance is English. Language selections last for the process lifetime.
Live vacancies, subscriptions, SMS, account linking and accommodation
submissions remain future services.

Revoke the exposed Telegram credential independently and supply a replacement
in the server environment. Stop earlier pollers, remove any existing webhook,
and set `INKLU_TELEGRAM_ENABLED=true` on exactly one Node instance. It needs
outbound HTTPS. A crash before the next acknowledgment can repeat a menu reply.
[Telegram polling contract](https://core.telegram.org/bots/api#getupdates)

## Offline verification

```powershell
npm.cmd ci --prefix tests/browser
npm.cmd test --prefix backend
npm.cmd test --prefix tests/browser
```

Browser tests use installed Chrome. Set `INKLU_CHROMIUM` to a Chromium
executable to override it. Tests use temporary SQLite storage, mock Telegram
updates and mocked Addis responses. On the target LMS, retest NVDA announcements,
reading order, stable audio focus, Human Help submit/retry and Escape restoration.
A help request must never open the screen picker.
