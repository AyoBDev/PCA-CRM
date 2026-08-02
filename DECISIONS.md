# Decisions Log

Build-vs-adopt reasoning, one entry per feature.

---

## 2026-08-02 — Log users out when their password changes

**Options considered:**
- Adopt a session/token-revocation library (e.g. server-side session store, JWT denylist via Redis, `express-session`). Signals: mature, but each adds infra (Redis/session table) and a second source of auth truth alongside the existing JWT.
- Extend the existing in-house mechanism: the app already has a `permissionsVersion` field on `User` that `authMiddleware` compares against the token, returning `401 permissions_changed` (which the frontend already turns into an auto-logout).

**Choice:** Extend the existing `permissionsVersion` mechanism — bump it on password change.

**Why:** The revocation primitive already exists and is battle-tested in-repo (used for permission-group changes). No new dependency, no new infra, no second auth source. The change is two one-line increments in the password-change handlers. Adopting a library would add operational weight for behavior we already have.
