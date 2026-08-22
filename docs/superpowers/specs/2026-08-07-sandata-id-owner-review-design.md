# Owner Sandata-ID Review Sheet + Apply-from-Decisions

**Date:** 2026-08-07
**Status:** Design approved, pending spec review
**Related:** PR #50 (shared schedule view live-resolution fix + `fix-shift-sandata-ids.js` cleanup)

## Problem

Production has 1,329 scheduled shifts whose stored `sandataClientId` differs from
the client's authorization value for that shift's service code (see PR #50 for how
the drift arose and why the shared schedule view already resolves it live). The
one-time cleanup script (`fix-shift-sandata-ids.js`) can re-sync these, but it
classifies them into three buckets:

- `blank_fill_in` (457 shifts) — shift blank, authorization has a value. Benign.
- `cross_client` (62 shifts, 3 clients) — the shift carries an ID that belongs to
  a **different** client. The wrong-clock-in bug class.
- `value_review` (810 shifts, ~23 clients) — the shift has a different non-blank ID
  that is **not** owned by another client (typo, leading zero, per-code tangle).
  Whether the shift or the authorization is correct is not mechanically decidable.

A **developer must not decide** which Sandata ID is correct for `value_review`
cases — only the agency owner knows the real IDs. This is a **one-time** cleanup:
the shipped view fix prevents future drift from reaching the shared PDF, so no
permanent in-app review feature is warranted (YAGNI).

## Goal

Get the owner's per-case decisions with **zero technical burden** on them (no DB,
no code, no CSV wrangling), then apply exactly those decisions. The owner works in
Excel/Google Sheets — tools they already know.

## Non-goals

- No new app page, route, controller, or UI. (One-time task; the view fix already
  prevents recurrence.)
- No change to the shared schedule view (already fixed in PR #50).
- Not deciding correctness for the owner — the sheet captures their judgement.

## Approach

Two deliverables, both plain Node scripts alongside the existing cleanup, sharing
its classification logic from `server/src/lib/sandataResolver.js`.

### Deliverable 1 — Review-sheet generator

`server/prisma/export-sandata-review.js`

- Reads all non-archived shifts + their clients' non-archived authorizations
  (same queries as `fix-shift-sandata-ids.js`).
- Computes the drift + category per shift via the shared resolver/classifier.
- **Collapses to one row per `clientId | serviceCode | oldValue | newValue` group**
  — a client's 25 weekly shifts for one code share one decision, not 25. (~54 rows
  across ~26 clients from current prod data.)
- Writes an `.xlsx` with columns:

  | Column | Meaning |
  |---|---|
  | Client | Decrypted client name (grouped/sorted by this) |
  | Service | Service code (PCS, S5130, …) |
  | Current ID | The value currently on the shifts (`(blank)` if empty) |
  | Proposed ID | The authorization's value (what "Use proposed" would write) |
  | # shifts | How many shifts this decision affects |
  | Date range | First–last shift date in the group |
  | Category | `blank_fill_in` / `cross_client` / `value_review` |
  | **Owner decision** | One of: `Keep current` / `Use proposed` / `Enter correct ID` (validated on apply) |
  | **Correct ID** | Owner types the right value here iff decision = `Enter correct ID` |
  | Notes | Free text for the owner |

- **Owner decision** is pre-filled with a sensible default per category:
  `cross_client` and `blank_fill_in` → `Use proposed`; `value_review` → left blank
  so the owner is forced to choose. The three allowed values are documented in a
  legend at the top of the sheet and in a `Choices` reference tab. NOTE: the
  installed `xlsx@0.18.5` (SheetJS Community) cannot **write** Excel data-validation
  dropdowns (Pro-only). So the decision cell is a plain text cell; correctness is
  enforced on the **apply** side (Deliverable 2 rejects any value that is not one
  of the three). A Google-Sheets user can point a dropdown at the `Choices` tab
  themselves if they want one. If a native Excel dropdown is later deemed essential,
  switch the generator to `exceljs` (supports `dataValidations` on write) — noted
  as a possible swap, not required for v1.
- A hidden/stable **group key** column (`clientId|serviceCode|oldValue|newValue`)
  is written so the apply step can match rows back unambiguously even if the owner
  re-sorts or edits display columns. (Human columns are for reading; the key is for
  matching.)
- Built with the `xlsx` library (already a dependency; used by payroll import),
  writing a legend, a `Choices` reference tab, and the data grid.
- Output path: `server/tmp/sandata-owner-review.xlsx`. Dry/read-only — never writes
  to the DB.

### Deliverable 2 — Apply-from-decisions mode

Extend `server/prisma/fix-shift-sandata-ids.js` with `--decisions=<path>`:

- Parses the owner's filled-in sheet (xlsx/csv), keyed by the group key column.
- Recomputes the current drift live (never trusts stale values baked into the
  sheet — the sheet is the *decision* source, the DB is the *value* source), then
  for each shift in a decided group:
  - `Use proposed` → set `sandataClientId` to the live authorization value.
  - `Enter correct ID` → set `sandataClientId` to the owner's typed `Correct ID`
    (trimmed; row skipped with a warning if blank).
  - `Keep current` (or blank/undecided) → skip.
- Groups present in the DB but **absent/undecided** in the sheet are skipped and
  listed in a summary, so nothing is silently applied without a decision.
- Still **dry-run by default**; `--apply` persists. Reuses the existing per-shift
  `prisma.shift.update` path.
- Existing `--only=<categories>` continues to work and composes with `--decisions`
  (e.g. apply only decided `value_review` rows).

## Data flow

```
export-sandata-review.js            → server/tmp/sandata-owner-review.xlsx
   ↓ (send to owner)
owner fills "Owner decision" / "Correct ID" in Excel or Google Sheets
   ↓ (send back)
fix-shift-sandata-ids.js --decisions=<file>            (dry run: show what applies)
   ↓ review
fix-shift-sandata-ids.js --decisions=<file> --apply    (persist)
```

## Error handling

- Missing/unreadable decisions file → clear error, exit 1, no writes.
- Unknown decision value in a row → treat as undecided (skip) + warn.
- `Enter correct ID` with blank Correct ID → skip that group + warn (never blanks).
- Group key in sheet not found in current DB drift (e.g. already fixed) → skip +
  note (idempotent-friendly).
- Owner re-sorted or added rows → matched by stable group key, not row position.

## Testing

Reuse the mocked-prisma + mocked-fs pattern already in
`server/__tests__/fixShiftSandataIds.test.js`.

- **Grouping/collapse**: many shifts sharing client+code+old+new collapse to one
  row with correct `#shifts` and date range.
- **Default decision seeding**: `cross_client`/`blank_fill_in` default to
  `Use proposed`; `value_review` blank.
- **xlsx round-trip**: generate a sheet, parse it back, group keys stable.
- **Decision → action mapping**: `Use proposed` writes auth value; `Enter correct
  ID` writes the typed value; blank `Correct ID` skips; `Keep current` skips;
  undecided group skips.
- **Decision-value validation**: an unrecognized decision string (e.g. a typo like
  `use proposd`) is treated as undecided (skip) + warned, never applied.
- **Compose with `--only`**: decided rows outside the `--only` set are not applied.

## Rollout

1. Run `export-sandata-review.js` against the prod copy (local v18), send the
   `.xlsx` to the owner.
2. Owner reviews (~54 rows, grouped by client) and returns it.
3. Developer runs `--decisions` dry-run against prod, reviews the summary, then
   `--apply`.
4. Independently, the `cross_client` + `blank_fill_in` tranches may be applied
   first via `--only` without waiting on the owner (they default to `Use proposed`
   and are unambiguous) — owner review then only gates the `value_review` rows.

## Out of scope / follow-up

- EVV/Sandata-side correction of already-logged visits recorded under the wrong ID
  (external system; PR #50 follow-up).
- Rotating the exposed production Postgres credential.
