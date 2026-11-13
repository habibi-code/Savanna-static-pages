# Inklu · Savanna Addis AI backend

## Live lesson translation

Use Node.js 22.9 or later. Run these commands from the repository root in PowerShell:

```powershell
cd backend
npm.cmd ci --ignore-scripts --no-audit --no-fund
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm.cmd test
npm.cmd start
```

The server binds to `127.0.0.1:3000` and serves the static pages and API together.
Set `PORT` in `backend/.env` to change the port. A live translation requires
`ADDIS_API_KEY` in that file; restart the server after editing it. With the key
absent, opening pages, inspecting the preview, and testing the unavailable-service
state are free. Startup and automated tests make zero paid requests.

1. Open [the short lesson fixture](http://127.0.0.1:3000/tests/lesson-content.html).
   Open **Inklu Companion**, Tab to **Translate**.
   Use the browser Network panel to verify there are no translation requests yet.
2. **After approving live spend**, press Enter on **Translate**. This sends
   the extracted title and body to Addis AI. Listen for the loading and completion
   status. Focus stays on the current action as results arrive. Each Amharic
   passage has its own Generate Audio button.
3. Close the drawer, switch the active lesson, and reopen it. The previous result clears. Activate the button to
   translate the new lesson. Returning to a previously translated lesson and pressing
   the button again uses the server cache while the entry is retained.
4. Open [the Savanna lesson](http://127.0.0.1:3000/pages/concept-with-navigation.html)
   to try the same control on the full lesson. Its longer text requires multiple
   provider requests. The developer preview (`?inkluDebug=1`), Describe Visuals, and Escape-to-close also
   work with the API offline. To test an error for free, stop the server while the
   page is open and activate the action. Restart it before a user-initiated retry.

The browser posts JSON `{"text":"Check both time zones."}` to `/api/translate`.
Success returns `{"translation":"…"}`; errors return a safe `error` string and
an HTTP status. Requests accept at most 64 KiB of JSON and 16,000 UTF-16 code
units of text. The backend splits long text into ordered sections of at most
1,500 units. It prefers paragraph and sentence boundaries near the limit and
retains the original whitespace between translated sections. Each uncached
section makes one sequential provider request with a 20-second SDK timeout
and zero automatic retries. Smaller sections give each call less text to
translate but can increase the number of paid requests for a long lesson.
The local limit is eight POST requests per minute across all tabs. Concurrent
identical sections share one in-flight call. The last 128 successful sections
stay in process memory until eviction or restart. A failed section is eligible
for manual retry. Dismissing an in-flight result can still incur charges for
work already sent to the provider.

The relative API URL uses the page's origin. There is no CORS setup for the
bundled server. A separate development frontend should proxy `/api/translate`
through its own trusted same-origin backend; direct cross-origin and `file://`
API requests are unsupported. The local server checks Host and Origin, serves
only public site paths, and omits keys, provider error bodies, and lesson text
from logs. Any local process can call this endpoint. It is intended for local
development; a shared deployment needs authentication and per-user spending limits.

## Simple English explanations

**Explain Simply** sends the extracted lesson to `POST /api/simplify` as `{"text":"…"}`.
The endpoint returns `{"explanation":"…"}` and uses the existing server-side Addis
key. It applies the same origin and input checks as translation, with its own
eight-request-per-minute limit and cache of 128 successful explanations. Identical
pending requests share one provider operation. The prompt asks for beginner-friendly
English and the source lesson's terms, examples and qualifications. If Addis returns
primarily Amharic text, the server translates that generated explanation into English.
This can incur a second text request. The TTS allowance applies only to speech.
The drawer renders headings, paragraphs and lists as text, without inserting model HTML.

## Amharic audio

After translation, press Enter or Space on **Generate Audio** for a passage. The
button stays focusable while the status announces “Generating audio…”. Playback
starts when the clip is ready.
Tab to **Pause**, then Shift+Tab to **Play or resume**. **Stop** returns to the beginning.
If the browser blocks playback, **Play or resume** starts the loaded clip without a new request.
Changing passages, leaving Translate, replacing the lesson, or closing the drawer
cancels pending playback. Loading and errors use the passage's polite status; the
playing indicator stays outside the live region to avoid talking over Amharic.

**Learner endpoint.** `POST /api/speech/listen` accepts only `{"text":"…"}`. It
returns an MP3 from disk or generates one on demand. Host, same-origin and JSON checks still apply; limits are
2 KiB per body, 240 UTF-16 units of text containing an Ethiopic letter, and eight
requests per minute across tabs. The former HTTP estimate and generation routes
are no longer available.

**Storage and spending.** The server looks up the exact passage using the existing
hashed MP3 filenames in Git-ignored `backend/output/`. It checks the preferred
voice (`am-hamen`) first. If clips were prepared with a fallback voice, set
`INKLU_CACHED_VOICES` in the server's `.env` to the additional comma-separated voice
IDs and restart. Instances need the same cache files to serve the same clips.

Set `INKLU_TTS_ALLOWANCE_ETB` in `backend/.env` and restart the server. This is a
cumulative allowance for automatic speech generation. The default is 0, which
still permits playback from the cache. For example, 5 authorizes up to 5 ETB in
estimated requests, accounting for charges already recorded. A fresh estimate must
fit the remaining allowance and the 1 ETB per-clip limit, and the provider wallet
must cover it. Actual duration-based charges can exceed the estimate.

The server reserves the estimate in `output/automatic-speech.json` before each
paid call and replaces it with the reported charge when available. Keep this file
with the MP3 cache across restarts. Identical pending requests share one result.
The file lock serializes generation across processes using the same directory.
If another generation holds the lock, a different passage can be retried later.
After a crash, stop all writers and reconcile provider usage and outstanding
reservations before removing a stale `automatic-speech.json.lock`. A retry after
an uncertain response checks recent clip history using the original request ID.
Unresolved reservations remain charged against the allowance until reconciled.
Separate cache directories have independent allowances. CLI and translation usage
are outside this allowance.

**Offline verification.** From the repo root, run `npm.cmd test --prefix backend` and
`npm.cmd test --prefix tests/browser`. The tests use mock providers or a keyless
server; they exercise cache hits and misses, concurrent clicks, browser playback
restrictions, focus, and failures without buying audio.

## Phase 3A CLI

This server-side Node.js experiment uses the official `addisai` SDK with one English
sentence from the weekly-schedule fixture, “Check both time zones.” The local CLI
lets you inspect the translation and approve the audio quote before connecting a UI.

## Setup and offline checks

From the repository root, with Node.js 22.9 or later:

```powershell
cd backend
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd test
npm.cmd run poc
```

The tests exercise the installed SDK through an in-memory HTTP transport with a
dummy key. They cover the English-to-Amharic request, the Voices 2 request and MP3
download path, cancellation, cached results, budget checks, and API failures.
The downloaded bytes in these tests are synthetic. The last command prints help.

## Live test after approval

`ADDIS_API_KEY` is the only environment variable. Set it locally in `backend/.env`.
For a fresh clone, copy `.env.example` to `.env` first. Git ignores the key file,
dependencies and `output/`. Publish only the static site files when serving Savanna;
the backend directory belongs outside the public web root.

Run each command separately in an interactive terminal from `backend/`.

| Command | Expected result |
| --- | --- |
| `npm.cmd run poc -- translate` | Shows the English sentence. Type `TRANSLATE` to approve one paid request. Prints the Amharic result and saves it in `output/translation.txt`. Repeating the command reads that file. |
| `npm.cmd run poc -- estimate` | Uses the saved translation, queries the live Amharic voice catalog and prints a quote with the voice ID, billable seconds, estimated ETB and current balance. |
| `npm.cmd run poc -- speak` | Rechecks availability and price. Type `GENERATE` to approve one clip at the displayed estimate. Prints its ID and reported charge, then saves a playable MP3 in `output/`. |

Enter at either approval prompt cancels. The test prefers Hamen (`am-hamen`) when
the live catalog marks it available and otherwise selects an available Amharic voice.
Speech generation requires a valid ETB quote of at most **1 ETB** and sufficient
balance. The threshold applies to the estimate; the provider bills actual usage.
The sampled sentence and short translation limit keep the request small.
[Official voice catalog and estimates](https://docs.addisassistant.com/docs/capabilities/text-to-speech)

Translation costs **0.30 ETB per 1,000 input tokens** and **0.80 ETB per 1,000
output tokens**. For example, 10 input and 20 output tokens would cost **0.019 ETB**.
Voices 2 costs **5 ETB per generated minute**. Six billable seconds would cost
**0.50 ETB**. These examples illustrate the arithmetic; the account quote and
reported usage determine the test's cost. [Official pricing](https://docs.addisassistant.com/docs/platform/pricing)

The SDK uses zero automatic retries. A saved clip is reused for identical inputs.
If downloading fails after generation, keep the clip ID. A repeat with the same
text, voice, language and format uses the same client request ID for provider
deduplication. After an uncertain translation outcome, check account activity
before authorizing another translation. Access errors, insufficient credit and
rate limits produce short messages without dumping headers or provider responses.
[Official translation guide](https://docs.addisassistant.com/docs/capabilities/translation) ·
[Official Node.js SDK](https://github.com/Addis-AI-Org/addisai-js)
