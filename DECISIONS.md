# Decisions Log

Build-vs-adopt reasoning, one entry per feature.

---

## 2026-08-02 — Lead follow-up reminders + contact log

**Options considered:**
- Adopt a task/reminder or CRM-activity library (e.g. a job scheduler like `node-cron`/`bullmq` for reminders, or a generic activity-feed package). Signals: mature schedulers exist, but they solve *background job* scheduling, not "show this user the leads that need attention when they log in" — which is a query over existing lead state, not a cron job. A generic activity-feed package would impose its own schema and not know about our lead pipeline stages, ownership (`assignedTo`/`createdBy`), or dormancy rules.
- Build in-house on the existing patterns: a `LeadContact` model mirroring the existing `ClientNote` timeline, pure classifier functions over the current `Lead` fields for the four reminder buckets, and the app's existing `useUndoStack` + audit + `requirePermission` infrastructure. A once-per-day modal gated by `localStorage` (same pattern as `sidebarCollapsed`).

**Choice:** Build in-house.

**Why:** The "reminder" here is a derived view of lead state (follow-up due, going stale, new & untouched, stuck in stage), not a scheduled background job — so a scheduler library adds infra without solving the actual problem. The contact-log timeline is a near-exact clone of the existing `ClientNote` pattern, so building it keeps the data model consistent and reuses the audit/undo/History wiring every other entity already has. No new dependency, no second source of truth, and the bucket thresholds live as tunable constants next to the existing `DORMANT_DAYS`. An external package would have to be bent to fit our pipeline and would fragment the UX from the rest of the app.

## 2026-08-02 — Log users out when their password changes

**Options considered:**
- Adopt a session/token-revocation library (e.g. server-side session store, JWT denylist via Redis, `express-session`). Signals: mature, but each adds infra (Redis/session table) and a second source of auth truth alongside the existing JWT.
- Extend the existing in-house mechanism: the app already has a `permissionsVersion` field on `User` that `authMiddleware` compares against the token, returning `401 permissions_changed` (which the frontend already turns into an auto-logout).

**Choice:** Extend the existing `permissionsVersion` mechanism — bump it on password change.

**Why:** The revocation primitive already exists and is battle-tested in-repo (used for permission-group changes). No new dependency, no new infra, no second auth source. The change is two one-line increments in the password-change handlers. Adopting a library would add operational weight for behavior we already have.
