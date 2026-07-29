# Authorization Lifecycle — Renew / Mark Inactive

**Date:** 2026-07-29
**Status:** Approved design, ready for implementation plan
**Scope:** Client Programs/Authorizations tab (`ProgramsAuthTab.jsx`) and its supporting controller/schema.

## Problem

"Active" as a manual authorization status doesn't make sense — an active auth is
already active. Letting users set status by hand produces inconsistent states and
missing information (wrong dates, overlapping periods, no record of *why* something
changed). We keep patching this one symptom at a time because the underlying
structure is wrong.

Separately, notes entered when creating/renewing an authorization currently surface
only in the read-only Notes tab (notes-timeline), where they feel like a
non-editable attachment rather than part of the authorization itself.

This spec replaces the manual-status model with a clean lifecycle: an active
authorization has exactly two actions — **Renew** or **Mark Inactive** — and notes
are split into two clearly separated, independently-editable types.

## Goals

1. Remove manual "Active" (and "Pending") as user-selectable statuses.
2. An active auth exposes exactly two actions: **Renew** and **Mark Inactive**,
   both driven from a single "Edit Authorization" modal with a Renewal/Inactive
   toggle at the top.
3. **Renew** is one modal, one save: new auth #, units, start/end dates, care-plan
   upload, and an authorization note. On save the OLD auth auto-closes with
   `end = newStart − 1 day`, server-computed — no manual end entry, no overlap ever.
4. The old auth is never deleted — it moves into a collapsible **history thread**
   under the same program, with its note attached.
5. **Mark Inactive** is separate: end date, reason (transferred / passed away /
   no contact / other), note. The auth stays visible on the profile under its
   program, flagged inactive — not hidden.
6. **Client Notes** and **Authorization Notes** are separate, each editable in its
   own home. Auth notes display directly on the authorization (and its history),
   not only in the read-only Notes tab.

## Non-goals

- No changes to the standalone Authorizations master page (`AuthorizationsPage.jsx`)
  or the Client Service detail page (`ClientServicePage.jsx`) in this pass. Scope is
  the client Programs/Authorizations tab only.
- The read-only notes-timeline (compliance aggregation) keeps aggregating auth
  notes as a mirror; it is not the edit surface and is otherwise unchanged.
- No new note table. Auth notes stay in `Authorization.notes`.

---

## 1. Status model

Status becomes **derived**, with one explicit override:

- **Active** — not archived, not explicitly closed, and (if dates present) today ≤
  end date. This is the default; there is no manual "active" toggle.
- **Inactive** — explicitly closed via **Mark Inactive**, or superseded by a
  **Renewal**. Stored via existing `manualStatus: 'inactive'` plus new structured
  fields below.

`manualStatus` column is **kept** but going forward only ever holds `'active'` or
`'inactive'`. The `'pending'` branch and the free-form status `<select>` are removed.

### Schema — additive migration

New fields on `Authorization` (all nullable / defaulted, so existing rows stay valid):

| Field | Type | Purpose |
|---|---|---|
| `renewedFromId` | `Int?` | Links a new auth to the one it replaced → builds the history thread. |
| `renewedToId` | `Int?` | The auth this one was renewed into (set on the old auth at renewal). |
| `inactiveReason` | `String @default("")` | transferred / passed away / no contact / other. |
| `inactiveNote` | `String @default("")` | Free-text detail for a manual close-out. |
| `closedAt` | `DateTime?` | When it was marked inactive or superseded. |

The **renewal/close-out note** (preset + detail) reuses the existing
`Authorization.notes` field. No new note table.

### Migration of existing data

Existing rows with `manualStatus = 'pending'` are one-time normalized to `'active'`
(a pending auth is functionally active for the app's purposes). Existing `'active'`
and `'inactive'` rows are unchanged. This normalization runs as part of the
migration.

---

## 2. The "Edit Authorization" modal (single modal, two modes)

Opened from the **Edit** action on an active auth in `ProgramsAuthTab`. **Replaces**
the current plain-edit modal — all field changes now flow through Renewal (which
creates history) or Mark Inactive.

**Top: mode toggle** — two segmented cards:

- **Renewal** — "Annual renewal or any significant change — new dates, new units,
  new care plan."
- **Inactive** — "Client transferred, passed away, or no longer receiving this
  service."

**Renewal mode fields:**

- Auto-close preview banner: *"On save, the current authorization ending
  {oldEnd} auto-closes with an end date of {newStart − 1 day} — the day before the
  new one starts. No overlapping dates, no manual entry."* (preview only; the
  server computes the real value).
- New Authorization Number.
- Auth Units — label flips to "Authorized Visits" for annual-tracked programs.
- Auth Start / Auth End — End defaults to Start + 1 year − 1 day; editable.
- Upload Care Plan — attaches to the **new** auth's documents.
- Authorization Note — preset dropdown (*Annual Renewal – No Changes / Hours
  Increased / Hours Decreased / New Care Plan Received / Other*) + free-text detail.
- Footer button: **Save Renewal**.

**Inactive mode fields:**

- Authorization End Date — defaults to today.
- Reason dropdown — transferred / passed away / no contact / other.
- Note — optional.
- Footer button: **Save & Mark Inactive**.

Switching modes swaps the body and the save button. Cancel closes without change.
One save round-trip either way.

**Correct-in-place affordance:** because Edit no longer offers plain field editing,
a small "Correct current authorization" link appears inside the Renewal mode. It
edits the *current* auth's fields (auth #, units, dates) via `PUT /authorizations/:id`
**without** spawning a new auth or a history entry — for fixing a typo on a
freshly-entered auth. This preserves the "no silent history-bypass for real
changes" rule while not forcing a fake renewal for a correction. (Flagged for
review — may be cut if unwanted.)

---

## 3. Data flow (what Save does)

### Renewal — `POST /api/authorizations/:id/renew` (extend existing endpoint)

In one transaction:

1. **Create** the new auth: new number/units/start/end, `manualStatus: 'active'`,
   `renewedFromId = oldId`, `notes = preset + detail`.
2. **Close the old auth:** `authorizationEndDate = newStart − 1 day`
   (server-computed; any client-sent end for the old auth is ignored),
   `manualStatus: 'inactive'`, `closedAt = now`, `renewedToId = newAuth.id`.
3. **Care plan** upload (if any) attaches to the **new** auth's documents.
4. **Propagate** `accountNumber` and `sandataClientId` from old → new (renewals
   must not lose these; consistent with the existing single-source-of-truth rule).
5. **Audit:** CREATE (new auth, metadata `{ renewedFromId }`) + UPDATE (old auth,
   metadata `{ reason: 'renewed', renewedToId }`).

The day-before math is computed server-side as the single source of truth. Overlap
is structurally impossible.

### Mark Inactive — `PATCH /api/authorizations/:id/inactivate` (new)

1. `manualStatus: 'inactive'`, `authorizationEndDate = provided end`,
   `inactiveReason`, `inactiveNote`, `closedAt = now`.
2. **Audit:** UPDATE with metadata `{ reason: inactiveReason }`.

### Retired paths

- `updateAuthManualStatus` free status write and its `'pending'` branch — removed.
- The status `<select>` in `ProgramsAuthTab` — removed.

### Undo / redo (required on this page per CLAUDE.md)

- **Renew** undo: archive/delete the new auth, restore the old auth's prior
  `authorizationEndDate`, `manualStatus: 'active'`, clear `closedAt`/`renewedToId`.
  Redo re-runs the renewal.
- **Inactivate** undo: restore prior `manualStatus`, `authorizationEndDate`,
  `inactiveReason`, `inactiveNote`, `closedAt`. Redo re-applies.
- **Note edit** undo: revert to snapshotted prior note text.

All undo/redo functions call the real API and update local state so UI and DB stay
in sync, matching the canonical `LeadsPage.jsx` pattern.

---

## 4. History thread

Under each program card, when the current auth has predecessors (follow
`renewedFromId` backwards to assemble the chain), render a collapsible thread:
**"View authorization history (N)"**.

Each entry shows: auth #, units, period, a **Superseded** pill, its note, and the
chain line — *"↳ Renewed into {newNum} · closed {oldEnd}, new period starts
{newStart} (no overlap)"*.

Authorizations that were **Mark Inactive**'d (closed, not renewed) stay on the card
itself with a red reason line (`{reason}. {note}`), not in the history thread.

---

## 5. Notes — two types, each editable in its own home

### Authorization Notes (`Authorization.notes`)

- Entered in the Renew modal (preset + free text) and on Mark Inactive.
- **Displayed directly on the auth card** — visible without expanding — as an
  "Authorization Note" line, and on each history-thread entry with its note.
- **Editable in place** on the authorization: a small inline edit (pencil →
  textarea → save via `PUT /authorizations/:id`). No leaving the auth to edit it.
  Edits are audited and wired into undo.
- The read-only notes-timeline continues to aggregate these for compliance — a
  mirror, not the primary surface.

### Client Notes (`Client.notes`)

- Their own section on the Client Profile — gate codes, caseworker, special
  instructions, emergency contacts. Editable there.
- Never rendered inside auth cards; auth notes are never rendered as client notes.

### Guarantee

No code path writes an auth note into `Client.notes` or vice-versa. An auth note
round-trips: create → renew → reopen → still shows on that authorization.

---

## 6. Audit & History-page wiring

- All new mutations (renew, inactivate, note edit) call `audit.logAction()`.
- `entityType: 'Authorization'` already exists in `ENTITY_TYPES` — no new entity
  type. The Activity drawer on the Programs tab reflects these actions.

## 7. Testing

- **Renew:** old auth closes at `newStart − 1 day`, new auth active with
  `renewedFromId`; account/sandata propagated; care-plan doc on new auth; no date
  overlap; audit entries present; undo restores old state.
- **Mark Inactive:** status/end/reason/note stored; auth still visible on profile
  flagged inactive; undo restores.
- **Day-before math:** verify across month/year boundaries and leap day.
- **Notes separation:** editing an auth note never touches `Client.notes`; auth
  note visible on the card and in history after a subsequent renewal.
- **Migration:** `'pending'` rows become `'active'`; `'active'`/`'inactive'`
  unchanged.
- **Multi-auth programs (COPE, PAS):** renewing one `serviceName` variant does not
  close the sibling variant (respect the `serviceCode|serviceName` composite key).

## 8. Open items for review

- Keep or cut the "Correct current authorization" in-place edit link (§2).
- Confirm `'pending'` → `'active'` normalization is acceptable (vs. leaving them).
- Care-plan upload mechanism (§3): the renew endpoint is JSON, file uploads are
  multipart. Implementation plan to choose either a multipart renew endpoint or an
  upload-then-link two-step (create renewal → attach doc to returned new auth id).
