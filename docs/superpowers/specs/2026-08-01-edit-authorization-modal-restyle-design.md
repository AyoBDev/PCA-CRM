# Edit Authorization Modal — Restyle & Flow Fix

**Date:** 2026-08-01
**Status:** Approved design, ready for implementation plan
**Scope:** `client/src/components/common/AuthorizationFormModal.jsx` (edit path only) + minor CSS in `client/src/index.css`.

## Problem

The Edit Authorization modal's flow feels wrong. When editing an existing
authorization, the modal currently shows the entire create-form field set first
(Service Category, Service Code, Service Name, Account Number, Sandata ID,
Authorization Number, Authorization Type, Units, dates, Notes), and only *then*,
at the bottom, shows the Renewal / Inactive status cards.

The approved mockup is the opposite: on Edit, the modal opens showing **only the
two status cards** (Renewal / Inactive), and the relevant fields appear **below,
based on which status the user picks**. The always-on create fields do not belong
in the edit flow.

This is a **reorder + conditional-render + styling** change. The renewal and
inactive field blocks, the auto-close behavior, undo/redo, and validation all
already exist and are correct — nothing about the underlying behavior changes.

## Goals

1. In **edit mode**, the modal opens showing the header + the two status cards and
   nothing else — no create-form fields visible until a status is selected
   (mockup picture 1).
2. Selecting **Renewal** reveals the renewal fields (mockup picture 2).
3. Selecting **Inactive** reveals the inactive fields (mockup picture 3).
4. Restyle the status cards and info banners to match the mockup's clean layout,
   rendered in the **live app's visual language** (Inter font, app blue/red,
   shadcn zinc tokens — NOT the mockup's serif/teal/amber look).
5. Leave the **create flow** (`!isEdit`) exactly as it is today.

## Non-goals

- No backend changes. Auto-close (old auth end = new start − 1 day), the renew and
  inactivate endpoints, undo/redo, and validation are unchanged.
- No change to the modal's entry point (still reached via the card's View Details →
  three-dot → Edit). A cleaner entry point is a separate future pass.
- No change to the standalone Authorizations master list or the service cards in
  this pass.
- The auto-close behavior stays. The explanatory "preview banner" stays (reworded
  only if needed for clarity, but its meaning is correct).

## Terminology

- **Preview banner** — the read-only blue info box in the Renewal view that
  explains what Save will do: *"On save, the current authorization (ending
  {oldEnd}) auto-closes with an end date of {newStart − 1 day} — the day before
  this new one starts. No overlapping dates, no manual entry."* It is explanatory
  text, not a control.
- **Auto-close** — on Save Renewal, the server sets the OLD authorization's end
  date to the day before the new one's start, so old and new never overlap. This
  is existing, wanted behavior.

## Design

### Edit-mode render order

When `isEdit` is true, the modal body renders in this order and hides the
create-only fields:

1. **Header**
   - Eyebrow: `{CLIENT NAME} · EDIT AUTHORIZATION`
   - Title: `{serviceCode} — {serviceName}`
   - Helper line: "Set automatically from the service category — GUIDE is tracked
     by annual visits, all other services by weekly units." (kept, app styling)
2. **Status cards** — two selectable cards, Renewal + Inactive, and **nothing
   else** until one is chosen. No status is pre-selected on open per the mockup
   (picture 1 shows neither selected); selecting one reveals its fields. *(If a
   sensible default is preferred, Renewal-default is acceptable — see Open items.)*
3. **Renewal selected** (`manualStatus === 'renewal' && !correctingInPlace`):
   - Preview banner (blue, app tokens)
   - New Authorization Number
   - Auth Units + Auth Start (2-col)
   - Auth End + Note preset dropdown (2-col); the free-text detail textarea under
     the preset
   - **Account Number + Sandata Client ID** (2-col) — carried to the new auth
   - Care-plan upload
   - "Correct current authorization instead" ghost link
4. **Inactive selected** (`manualStatus === 'inactive'`):
   - Info banner (red, app tokens): "This authorization will stay visible on
     {client}'s profile under {code}, flagged inactive with the reason and note
     below — nothing is deleted."
   - Authorization End Date
   - Reason (select)
   - Note (textarea)
5. **Correct-in-place** (`correctingInPlace === true`): reveals the editable core
   fields (Authorization Number, Auth Units, Auth Start, Auth End) for a typo fix,
   with a "Save Correction" button. No new auth, no history entry.
6. **Footer:** Cancel + context button:
   - create → "Add Authorization"
   - correctingInPlace → "Save Correction"
   - inactive → "Save & Mark Inactive"
   - else → "Save Renewal"

The create-only field block (Service Category, Service Code, Service Name, Account
Number, Sandata ID, Authorization Number, Authorization Type badge, the top-level
Units/dates/Notes) renders **only when `!isEdit`**. In edit mode those fields do
not appear at the top; the values still exist in component state (seeded from
`auth`) so the renewal payload and correct-in-place path carry them.

### Field-state sourcing

- Renewal fields (auth #, units, start, end, account, sandata) are seeded from the
  existing `auth` when the modal opens (already the case for units/number; ensure
  account/sandata are seeded too so they carry forward).
- Account Number + Sandata Client ID appear in the Renewal view and are included in
  the renewal payload (they already are in `onRenewal`).

### Styling (app design system, mockup layout)

- **Status cards** (`.auth-status-cards` / `.auth-status-card`): two side-by-side
  selectable cards, each with a radio dot, generous padding, rounded corners, and a
  clear selected state — border + subtle background tint using `--primary` for
  Renewal and `--destructive` for Inactive. Reuse/extend the existing
  `.auth-status-card*` CSS; replace the hardcoded `#2563eb` inline color on the
  Renewal label with the app primary token.
- **Banners** (`.preview-box` and a new inactive variant): blue info box for
  renewal, red info box for inactive, using app tokens. `.preview-box` already
  exists; add a `.preview-box--danger` (or reuse an existing danger banner class)
  for the inactive message.
- **Fields:** consistent 2-column grid using the app's `.field` / `.form-group`
  inputs and spacing. Match the surrounding modal conventions.
- **Header eyebrow/title:** app typography, not the mockup's Fraunces serif.

### Files

- `client/src/components/common/AuthorizationFormModal.jsx` — wrap the create-only
  field block in `!isEdit`, move/keep the status cards as the first edit-mode
  element, ensure account/sandata seed + render in the renewal view, minor class
  swaps (drop the inline `#2563eb`). No logic changes to submit routing, undo, or
  validation.
- `client/src/index.css` — polish `.auth-status-card*`, add the inactive banner
  variant. Use CSS variables (theme-safe), no hardcoded hex.

## Testing / verification

- There is no component unit-test harness for this modal; verify with
  `cd client && npm run build` (catches JSX/import errors) plus live manual check
  in the running app:
  1. Edit an active auth → modal opens showing only header + two status cards, no
     create fields.
  2. Pick Renewal → renewal fields appear in the specified order incl. Account
     Number + Sandata ID; banner shows the day-before date; Save Renewal works and
     the old auth auto-closes.
  3. Pick Inactive → inactive fields appear; Save & Mark Inactive works.
  4. "Correct current authorization instead" → core fields appear; Save Correction
     saves without creating a new auth.
  5. Create flow (Add Authorization) is unchanged.
- Confirm no regression to the existing renew/inactivate/undo behavior verified in
  the prior authorization-lifecycle work.

## Open items

- **Default status on open:** mockup picture 1 shows neither card selected. The
  current code defaults edit mode to `renewal`. Decision: default to **renewal**
  (so the common path is one fewer click) unless the reviewer prefers an unselected
  initial state matching the mockup exactly. Implementation will default to renewal
  and can be flipped trivially.

## Constraints

- Frontend follows the app design system (Inter, app tokens, `.field`/`.btn`/`.pa-*`
  patterns; theme-safe CSS variables). Read
  `docs/superpowers/specs/2026-06-01-design-system-design.md` before styling.
- No backend/TDD work in this pass (styling + render-order only); the underlying
  behavior is already covered by the authorization-lifecycle test suite.
