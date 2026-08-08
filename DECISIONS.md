# Decisions

A running log of notable build-vs-adopt and design decisions, most recent first.

## 2026-08-08 — Owner review of Sandata-ID drift: spreadsheet, not an app feature

**Feature:** Let the agency owner (not a developer) decide which stored Sandata
Client ID is correct for the ~1,329 drifted shifts, then apply exactly their calls.

**Options considered:** (a) owner-friendly Excel/CSV round-trip; (b) printable PDF
checklist; (c) a throwaway in-app admin review screen.

**Decision:** Build (a). A generator (`export-sandata-review.js`) writes an `.xlsx`
of ~48 decision rows (collapsed one-per client+service+old+new group) with a stable
`group_key` column and per-category default decisions; the owner marks each row
`Keep current` / `Use proposed` / `Enter correct ID`; then
`fix-shift-sandata-ids.js --decisions=<file>` applies exactly those choices
(dry-run by default, never blanks a shift, composes with `--only`).

**Why:** This is a one-time cleanup — the shipped view fix already prevents future
drift from reaching the shared PDF — so a permanent in-app screen (new route,
controller, mandatory undo/history wiring, ongoing maintenance) is over-engineering.
The spreadsheet keeps the developer out of the clinical decision, needs no training,
and adds nothing permanent to maintain. `xlsx@0.18.5` (SheetJS Community) can't
write real dropdowns (Pro-only), so decision values are validated on the apply side
instead. Verified end-to-end against a production copy: generate → defaults →
`--decisions` dry-run selects the 519 safe rows, leaves the 810 review rows for the
owner. Spec + plan: `docs/superpowers/specs|plans/2026-08-07-sandata-id-owner-review*`.

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

**Follow-up (same PR):** Extracted the live-resolution logic into a shared pure
helper (`server/src/lib/sandataResolver.js`) so the view and the cleanup can't
drift, and added a one-time cleanup script `npm run db:fix-shift-sandata-ids`
(dry-run by default, `-- --apply` to persist) that re-syncs the stale
`Shift.sandataClientId` copies from the authorization. The cleanup only rewrites
a shift when a matching authorization has a non-empty, differing ID — it never
blanks a shift — and is idempotent.
