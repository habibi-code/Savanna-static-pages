# Tutor integration boundary

Register Roba's handler in `backend/app.js` once the LMS supplies authenticated
course membership and a canonical source for each lesson revision. Keep retrieval
and quote validation server-side. Implement the answer and insufficient-evidence
responses in the [team contract](../../../docs/team-integration.md#ai-tutor-roba).
This directory reserves the module boundary. No Tutor HTTP route is active.
