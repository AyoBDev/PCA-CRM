# Decisions

A running log of notable build-vs-adopt and design decisions, most recent first.

## 2026-08-07 — Shared schedule PDF/link showed the wrong Sandata Client ID

**Feature/bug:** Employees' shared schedule view (`/schedule/view/:token`) rendered a
stale/wrong Sandata Client ID, causing a PCA to clock in under another client's ID.

**Root cause:** The Sandata Client ID has no single source. It lives on `Authorization`
(source of truth, shown on the Client Profile) and is also *copied* onto each `Shift`
row (free-text, set at creation). The scheduling board and profile read the live
authorization value; the public schedule view read the shift's stored copy, so the two
drifted. A wrong value on a shift leaked into the shared PDF while the profile looked fine.

**Options considered:**
- Just backfill/re-sync the stale shift copies — fixes today's data but drift recurs.
- Make the shared view read the live authorization value at render time — drift-proof.
- Both.

**Decision:** Resolve the Sandata Client ID **live from the client's Authorization** in
the shared schedule view, matched by the shift's service code, falling back to the shift's
stored value only when no matching authorization carries an ID. No new dependency; a
~35-line change to `employeeScheduleLinkController.getScheduleView`, covered by
regression tests in `server/__tests__/getScheduleView.test.js`.

**Why:** Aligns the shared view with the app's stated single-source-of-truth rule
(Client + Authorization), so the shared PDF can never disagree with the profile again.
