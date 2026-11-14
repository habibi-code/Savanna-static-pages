# Savanna Multilingual Assistant & Live Help

> **Hackathon submission — Track 3: Multilingual Assistant and Live Help**  
> Deadline: Sunday 15 Nov 2026 · 16:30 AST

---

## What it is

A fully accessible, multilingual AI tutor and live-help assistant embedded in the Savanna learning platform. Learners can ask questions in **English or Amharic** by voice or text, get answers cited directly from their course content, and escalate to a human agent with one click.

```
┌─────────────────────────────────────────────────────────┐
│          Savanna page (any HTML)                        │
│   <script src="/widget/widget.js" data-api-url="…">    │  ← Level 1 drop-in
│                                                         │
│   ┌───────────────────────────────┐                     │
│   │  Savanna Assistant  [EN] [×]  │                     │
│   │  ─────────────────────────── │                     │
│   │  🤖  "Week 10 deliverable is…│  aria-live="polite" │
│   │       [Sources ▸]            │                     │
│   │  👤  "What about the score?" │                     │
│   │  ─────────────────────────── │                     │
│   │  [🎙] [___________________] [→]                    │
│   │  [ Get human help ]          │                     │
│   └───────────────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## Quick start

```bash
# 1. Clone
git clone <repo> && cd Hackathon2

# 2. Configure
cp .env.example .env
# Edit .env — set OPENAI_API_KEY (or AI_PROVIDER=offline for no key)

# 3. Start everything
make dev
# → API at http://localhost:8000
# → Widget at http://localhost:80/widget/iframe.html
# → Docs at http://localhost:8000/docs

# 4. Open a frozen Savanna page
open pages/homepage-v1-paced.html
# The floating chat bubble appears bottom-right.
```

---

## Architecture

```
┌─────────────┐    ┌──────────────────────────────────────────┐
│  Web Widget │    │          FastAPI  :8000                   │
│  iframe.html│───▶│  /chat  /escalate  /jobs  /accommodate   │
│  widget.js  │    │  /lti/launch  /webhook/sms  /openapi.json│
└─────────────┘    └────────┬──────────────────┬──────────────┘
                            │                  │
              ┌─────────────▼──┐    ┌──────────▼─────────┐
              │   AI Layer     │    │   RAG (ChromaDB)   │
              │  ┌──────────┐  │    │  multilingual-e5   │
              │  │  OpenAI  │  │    │  Savanna HTML docs │
              │  │  Ollama  │  │    │  Job listings      │
              │  │  Offline │  │    └────────────────────┘
              │  └──────────┘  │
              └────────────────┘
                            │
              ┌─────────────┴──────────────┐
              │  Channels                  │
              │  Telegram Bot (polling)    │
              │  SMS / Africa's Talking    │
              └────────────────────────────┘
```

### Services (docker-compose)

| Service | Port | Role |
|---|---|---|
| `api` | 8000 | FastAPI backend, OpenAPI docs |
| `telegram-bot` | — | Polling Telegram bot |
| `worker` | — | Job alert cron (every 6 h) |
| `nginx` | 80 | Widget + operator static files; API proxy |
| `redis` | 6379 | Sessions, escalation tickets, job alert subs |

---

## Requirement coverage

### ✅ Accessibility gate

| Test | Method | Status |
|---|---|---|
| NVDA | Semantic HTML, `aria-live="polite"` log, focus management | ✅ |
| TalkBack (Android) | Same HTML structure, tested in Chrome Android | ✅ |
| Keyboard-only | All controls reachable by Tab; Enter/Space activate; Escape closes | ✅ |
| 200% zoom | `rem`-based layout; no fixed pixel widths on text | ✅ |
| Sound off | All audio cues have visual equivalents; no audio-only content | ✅ |
| axe-core | `make axe` → 0 critical/serious violations | ✅ |

### ✅ Core assistant

| Feature | Implementation |
|---|---|
| Voice + text (EN + AM) | Web Speech API (`en-US` / `am-ET`); browser TTS |
| Course-only answers | RAG retriever → system prompt guardrail; "not in sources" response |
| Citations | `[chunk_id]` parsed from LLM output → footnote `<details>` |
| `aria-live` new messages | `role="log" aria-live="polite"` on `<ul>` |
| RTL support | `dir` attribute toggled; CSS logical properties throughout |
| Human escalation | One-click button → WebRTC `getDisplayMedia()` → `/escalate` → operator dashboard |
| Pluggable AI | `AI_PROVIDER=openai\|ollama\|offline` env var |

### ✅ Multi-channel

| Channel | Details |
|---|---|
| Web embed | Drop-in `<script>` tag (Level 1); REST API + OpenAPI (Level 2); LTI 1.3 (Level 3) |
| Telegram | `/start`, `/jobs`, `/accommodate`, chat passthrough, job alerts |
| SMS | Africa's Talking webhook; 160-char pagination; `JOB` prefix for job listing |

### ✅ Career gateway

| Feature | Details |
|---|---|
| Job Q&A | Jobs ingested into RAG; `/jobs` endpoint; domain-filtered retrieval |
| Job alerts | Cron worker every 6 h; Telegram + SMS delivery; `/job-alert` subscription |
| Interview accommodation | `/accommodate` endpoint; ConversationHandler in Telegram; email/Telegram notification |

### 🌟 Bonus Features ("Earns Extra" & "Built for Ethiopia")

| Bonus Feature | Specification | Implementation & Route |
|---|---|---|
| **Plain-Language "Simple Mode"** | Slide 11: *"A plain-language 'simple mode'"* | Header toggle `[Aa]`; simplifies responses into short sentences, basic vocabulary, and zero jargon for cognitive accessibility. |
| **Anonymous Teacher Insights** | Slide 11: *"A teacher view of the most asked questions, without names"* | Accessible portal at `http://localhost:8000/teacher-ui/` + `GET /teacher/analytics`; aggregated topics & frequencies with 100% zero PII. |
| **Ethiopian Calendar (Ge'ez)** | Slide 12: *"Built for Ethiopia: the Ethiopian calendar"* | Native JDN Gregorian $\leftrightarrow$ Ethiopian conversion (`ህዳር 5 ቀን 2019 ዓ.ም.`); stamped on chat messages and `/accommodate` booking confirmations. |
| **Double-Space Live Help** | Rapid accessibility shortcut | Double-tap <kbd>Space</kbd> anywhere on page or widget to instantly pop up the Live Help Desk screen share modal. |

### ✅ Integration

| Level | Method |
|---|---|
| Level 1 | `<script src="/widget/widget.js" data-api-url="…">` |
| Level 2 | REST API · `GET /openapi.json` · Scalar UI at `/docs` |
| Level 3 | LTI 1.3 · `pylti1p3` · `/lti/launch` · `/lti/jwks` |
| Savanna embed | Script tag already added to all three frozen pages |

---

## Configuration

Copy `.env.example` to `.env` and edit:

```bash
# AI provider — openai | ollama | offline
AI_PROVIDER=openai
OPENAI_API_KEY=sk-…

# Telegram (already set)
TELEGRAM_BOT_TOKEN=9190071258:AAFZ6n8mIV66dBj_bXuVNhncljAbaHwWY1g

# SMS (Africa's Talking sandbox = simulation)
AT_USERNAME=sandbox
AT_API_KEY=atsk_…
```

---

## LTI 1.3 setup

```bash
# Generate RSA keypair
make lti-keys

# Register the tool in your LMS:
# Launch URL:  http://your-host/lti/launch
# JWKS URL:    http://your-host/lti/jwks
# Login URL:   http://your-host/lti/login
```

---

## Adding new course content

Drop Markdown or HTML files into `docs/course-content/` and re-ingest:

```bash
make ingest
```

The RAG pipeline will chunk, embed and index the new content automatically. The assistant will immediately cite it in answers.

---

## Telegram bot commands

| Command | Description |
|---|---|
| `/start` | Welcome + command list (EN + AM) |
| `/language` | Toggle English ↔ Amharic |
| `/jobs` | Show 5 latest job listings |
| `/job-alert` | Subscribe to job alerts |
| `/accommodate` | Request interview accommodation |
| `/escalate` | Escalate to a human agent |
| Any text | Chat with the AI tutor |

---

## SMS commands (Africa's Talking shortcode)

| SMS text | Action |
|---|---|
| `HELP` | Show available commands |
| `JOB` or `KAZI` | List latest jobs (paginated, 160 chars) |
| `ALERT ON` | Subscribe to job alerts |
| Anything else | Chat with the AI tutor |

---

## Running tests

```bash
make test   # Python unit tests
make axe    # axe-core accessibility audit (zero critical/serious required)
make wcag   # Full WCAG conformance check (see wcag-report.md)
```

---

## File structure

```
Hackathon2/
├── api/                    Python backend (FastAPI)
│   ├── main.py             App factory
│   ├── config.py           Settings (pydantic-settings)
│   ├── models.py           Pydantic schemas
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── routers/            API endpoints
│   │   ├── chat.py         POST /chat
│   │   ├── escalate.py     POST /escalate (WebRTC signal)
│   │   ├── jobs.py         GET /jobs, POST /job-alert
│   │   ├── accommodate.py  POST /accommodate
│   │   ├── lti.py          LTI 1.3 endpoints
│   │   └── sms.py          POST /webhook/sms
│   ├── ai/                 Pluggable AI layer
│   │   ├── provider.py     Abstract base class
│   │   ├── openai_provider.py
│   │   ├── ollama_provider.py
│   │   ├── offline_provider.py  FAQ fallback
│   │   └── factory.py      get_provider()
│   ├── rag/                Retrieval-augmented generation
│   │   ├── ingest.py       Chunk + embed + store
│   │   └── retriever.py    Vector search
│   ├── channels/
│   │   ├── telegram_bot.py  Telegram polling bot
│   │   └── sms_handler.py   Africa's Talking SMS helper
│   └── jobs/
│       └── alerts.py        Job alert cron worker
├── widget/                 Drop-in web embed
│   ├── widget.js            Level 1 drop-in script
│   ├── iframe.html          Accessible chat UI
│   ├── style.css            rem-based, RTL-safe, WCAG AA colours
│   └── widget-a11y.test.js  axe-core test suite
├── operator/
│   └── index.html           Operator escalation dashboard (WebRTC)
├── docs/
│   ├── course-content/      Seed content for RAG
│   ├── jobs/jobs.json       10 seeded VA/remote job listings
│   └── offline_faq.json     Offline FAQ fallback (EN + AM)
├── nginx/nginx.conf
├── docker-compose.yml
├── Makefile
├── .env.example
├── README.md                (this file)
└── wcag-report.md           WCAG 2.2 AA conformance report
```

---

## Submission checklist

- [x] Code (all files above)
- [x] README (this file)
- [x] `docker-compose.yml`
- [x] WCAG 2.2 AA conformance report (`wcag-report.md`)
