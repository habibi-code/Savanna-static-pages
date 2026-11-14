# Embedded Inklu team integration

Shared baseline: `feature/inklu` at `b552cfa9faf9de5eb82d8c9077271afbfebb2335`.
Branch module work from this commit or its integrated successor. Keep the core
maintainer responsible for registering routes and mounting controls in the drawer.
The following contracts describe planned services. Existing AI and speech routes
continue to use their current payloads.

## Lesson identity and citations (core maintainer)

`lesson-content.js` currently returns `{title, content, images, visuals}`.
Proposed additive change: return a fifth field, `lessonContext`, while preserving
the existing fields and both extractor aliases. Its shape is
`{courseId, lessonId, revision, sections:[{id, heading, text}]}`.

- The LMS publishes its opaque identifiers and revision on the active lesson root
  (proposed attributes: `data-inklu-course-id`, `data-inklu-lesson-id`,
  `data-inklu-revision`). Missing values are `null`. Static captures can still
  expose reading sections. Course-grounded Tutor requires a verified lesson and
  revision. Never derive course identity from a title, URL slug or DOM position.
- Build sections in reading order from the same filtered body traversal. Start a
  section at each visible heading. Keep introductory text as a section with
  `heading: null`; preserve paragraph/list boundaries and normalize whitespace
  within each block. Use unique publisher section IDs when available. A publisher
  without IDs can assign revision-scoped ordinals in its canonical manifest
  (for example `s1`, `s2`). A citation identifies a section within one lesson
  revision. The adapter must use the same mapping and refresh it on lesson changes.
- On the backend, authenticate the LMS session or verify its signed launch, then
  resolve the submitted lesson in that tenant's authoritative LMS/catalog. Derive
  the course from that record, check enrollment/access, and look up the published
  revision and its canonical sections. Client IDs are lookup hints. Browser text,
  section IDs, Host and Origin confer no access. An inaccessible lesson returns
  `404`; an authorized but stale revision returns `409` and requires a refresh.

## AI Tutor (Roba)

`POST /api/tutor/answers` accepts `{lessonId, revision, question}`.
After the access checks above, retrieve source sections for that revision and use
them to ground the answer. Return one of these JSON results with HTTP 200:

- Answered: `{answer: string, citations: [{sectionId, quote}]}`, with at least
  one citation. Verify on the server that each section belongs to this revision
  and each quote occurs in its canonical text before returning it.
- Insufficient evidence: `{status: "insufficient_evidence", answer: null, citations: []}`.
  The drawer can explain the outcome and offer Human Help. A provider outage
  returns an error so the learner can retry.

The drawer resolves citation targets against its active lesson revision and
renders quoted text as text. Discard late answers after a lesson change.

## Human Help (Ermi)

| Operation | Contract |
| --- | --- |
| Request help | `POST /api/help/sessions` with `{lessonId, revision}` → `201 {sessionId, status:"pending"}` |
| Reopen a session | `GET /api/help/sessions/{sessionId}` → `{sessionId, status}` |
| Accept or resolve | `PATCH /api/help/sessions/{sessionId}` with `{status:"active"|"resolved"}` → updated session. An authorized tutor accepts pending sessions. The learner can cancel a pending request. Either participant can resolve an active session. Resolved is terminal. |
| Send and receive | `POST /api/help/sessions/{sessionId}/messages` with `{clientMessageId, text}` → `{messageId, sentAt}`. Deduplicate per sender and session. Stream `message` and `session-status` events over an authenticated session channel, with event IDs for reconnect. |

Check membership on every read, write and stream connection. Scope the pending
queue to authorized tutors. Derive sender identity on the server. Screen sharing
starts off. Only an explicit learner action in an active session may invoke the
browser's capture picker. Provide a keyboard-accessible Stop sharing control and
stop tracks when the learner stops, disconnects, or the session resolves.

## Telegram and Career (Barok)

| Operation | Contract |
| --- | --- |
| Browse jobs | `GET /api/career/jobs?cursor=…` → `{items:[{jobId,title,employer,url}], nextCursor:string|null}`. Bound each page and use the same text results for web and Telegram. |
| Opt in to alerts | `POST /api/career/alert-subscriptions` with `{channel:"telegram", keywords:[string]}` → `{subscriptionId,status:"active"}`. Require an explicitly linked account and reuse an identical active subscription. |
| Unsubscribe | `DELETE /api/career/alert-subscriptions/{subscriptionId}` → `204`. Authorize the owner. |
| Request an interview accommodation | `POST /api/career/accommodation-requests` with `{jobId, interviewId, requestedAdjustment}` → `201 {requestId,status:"submitted"}`. Validate the learner's interview association server-side. The authenticated owner can retrieve status at `GET /api/career/accommodation-requests/{requestId}`. |

Keep the bot token, account mapping and accommodation details on the server.
Verify the Telegram webhook secret, deduplicate updates by update ID and link
accounts using an expiring, single-use challenge. Collect accommodation details
through an authenticated private form. Limit access to the requester and designated
staff. Send only a generic status notification through Telegram and omit private
details from logs, job listings and tutor/chat payloads.

## Handoff and verification

Agree on the LMS identity source and canonical section manifest before enabling
Tutor. Each owner supplies mocked success, authorization denial and failure cases.
Keep module controls in the dialog workspace, in DOM order, using native controls
and ordinary Tab order. Core owns focus restoration and completion announcements.
Run the backend and browser suites against the embedded lesson and generic fixture
before integration. Check the new controls with NVDA on the target LMS.
