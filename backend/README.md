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
   Open **Inklu Companion**, select the **Translate** tab, and Tab to **Translate with Addis AI**.
   Use the browser Network panel to verify there are no translation requests yet.
2. **After approving live spend**, press Enter on **Translate lesson**. This sends
   the extracted title and body to Addis AI. Listen for the loading and completion
   status. On success, focus moves from the action to the result heading. Each Amharic
   passage has its own Listen button.
3. Close the drawer, switch the active lesson, and reopen it. The previous result clears. Activate the button to
   translate the new lesson. Returning to a previously translated lesson and pressing
   the button again uses the server cache while the entry is retained.
4. Open [the Savanna lesson](http://127.0.0.1:3000/pages/concept-with-navigation.html)
   to try the same control on the full lesson. Its longer text requires multiple
   provider requests. The developer preview (`?inkluDebug=1`), the two demos, and Escape-to-close also
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

## Amharic audio

Use the setup above, then open the [short lesson fixture](http://127.0.0.1:3000/tests/lesson-content.html).
The same steps work on the [Savanna lesson](http://127.0.0.1:3000/pages/concept-with-navigation.html).

1. Open Inklu and select **Translate**. After approval for live translation,
   activate **Translate with Addis AI**. Translation completion renders passage
   cards and sends zero speech requests.
2. Each passage contains up to 100 UTF-16 code units and has an inline **Listen**
   button named for its passage number. Activate it with Enter or Space.
   A saved MP3 enables **Play**. Otherwise, the polite status announces the voice and
   estimate. **Cancel** returns focus to the listening button and incurs no generation charge.
3. Only after approving live audio spend, Tab to **Confirm generation** and press Enter.
   The server checks the current estimate again. It rejects expired quotes, price
   increases, insufficient credit and estimates above **1 ETB per clip**.
   When the clip is ready, use **Play**, **Pause**, **Resume**, and **Stop**.
   Stop returns to the beginning. Playback never advances to a new passage automatically.
4. While playing, activate Listen on another passage, change modes, or close the
   drawer. Playback stops. On a new lesson, translate again before requesting audio.
   Reopening a previously generated passage with the same voice reuses the local MP3.
   Switching away after confirmation does not reverse a provider charge already in progress.
5. With a screen reader, check the passage-specific button names, the Amharic
   language on each passage, the quote, and playback announcements. Check that
   completion leaves focus on the current control if you have navigated elsewhere.

**API.** `POST /api/speech/estimate` takes `{"text":"…"}` and returns either
cached `audio/mpeg` bytes or a quote with `quoteId`, `voice`, `currency` and
`estimatedCost`. `POST /api/speech/generate` takes `{"quoteId":"…","confirmed":true}`
and returns MP3 bytes. Each random quote ID expires after two minutes and can be
redeemed once. It binds the exact passage, voice, format and price on the server.
Both routes inherit the local Host, same-origin and JSON checks. Limits are 2 KiB
per body, 240 units of Amharic-containing text, eight estimate requests and four
generation requests per minute across tabs.

**Billing and storage.** At the list rate of 5 ETB per generated minute, six billable
seconds would cost 0.50 ETB. Discounts can change the quote. The guard applies to
the estimate; actual billing follows generated duration. Server-side voice discovery,
quotes, and generation have deadlines of 10, 10 and 95 seconds respectively. The SDK
clip download has a 20-second deadline. The CLI and HTTP service share the hashed MP3
cache in Git-ignored `backend/output/` and the same provider request ID for identical
inputs. Concurrent HTTP approvals for the same clip share a single generation.
The browser receives audio bytes. Credentials, local paths and provider-signed URLs
stay on the server. [Official Addis AI pricing](https://docs.addisassistant.com/docs/platform/pricing)

**Offline verification.** `npm.cmd test` uses mocked provider responses and temporary
directories. It exercises confirmation, concurrent requests, replay, expiry, rate
limits, cost and balance changes, and safe provider failures.

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
