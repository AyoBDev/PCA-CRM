# Employee Portal (PCALink) v3.0 — Area 2: Lifecycle + Agency Review — Design

**Date:** 2026-08-06
**Status:** Approved design, ready for implementation plan
**Depends on:** Area 1 (Onboarding + Requirements) — merged in PR #49
**Roadmap:** `docs/superpowers/specs/2026-08-04-employee-portal-v3-roadmap.md` (Area 2)

## Purpose

Formalize the employee onboarding **lifecycle** (a proper status machine) and add **per-item agency review** over the Area 1 requirement ledger, including a "Changes Requested" loop where the employee fixes only the flagged items. Gate the portal so non-active employees see only onboarding.

## What already exists (from Area 1 / PR #49)

- `Employee.onboardingStatus` with ad-hoc values `invited`, `submitted`, `active`, and `changes_requested` (added by the first-pass reject flow).
- `Employee.adminReviewNote` (single free-text note).
- `EmployeeRequirement` rows (kind = document/certification/policy) with `status` (`required`/`submitted`/`approved`), `optional` (non-gating), and a **dormant** `rejectionReason` field.
- Review endpoints `approveOnboarding` / `rejectOnboarding` / `requestOnboardingChange` (whole-submission, single note) + `onboardingService.reviewOnboarding` (reopens token, sets `changes_requested`).
- Admin `OnboardingReviewModal` (Accept / Reject / Request Change) surfaced in the lead-reminders popup; the employee sees `adminReviewNote` back on the onboarding screen.
- `projectLedger(employeeId)` shared projection returning per-item `{ id, kind, status, optional, rejectionReason, label, requiresExpiry, fileName }`.

Area 2 formalizes and extends this. It **replaces** the whole-submission review endpoints with per-item review + a finalize step.

## Decisions (locked during brainstorming)

1. **Per-requirement-item review** — admin approves/rejects each document/cert/policy individually, each rejection carrying its own reason.
2. **Full 7-state machine** (see below).
3. **Auto-activate on approval** — approving records `approved` then immediately transitions to `active` (login activated) in one action.
4. **Onboarding-only gating** — until `active`, the employee app shows only the onboarding flow (or the changes-requested view). All other features hidden.
5. **Changes Requested loop** — approved items are locked/read-only; only rejected items are editable; re-submit sends the whole submission back to `pending_review`, and the admin only needs to re-check the redone items.

## Architecture (Approach A — extend the ledger + a status-machine module)

Reuse the Area 1 `EmployeeRequirement` ledger as the review target (no new review table). Centralize all status transitions in one server module. Derive employee status from item review states on re-submit/finalize. One app-level gate keys off status.

---

## Section 1 — Status machine

**Canonical statuses** (stored in `Employee.onboardingStatus`):

```
invitation_pending → onboarding_in_progress → pending_review → changes_requested → approved → active
                                                                         ↑                              │
                                                                         └──────────────────────────────┘
active → inactive → active
```

**Module:** `server/src/services/onboardingLifecycle.js`
- Exports `STATUSES` (the 7 constants), `TRANSITIONS` (allowed from→to table), and `transition(employeeId, to, meta)`.
- Every `onboardingStatus` write goes through `transition()`. Illegal jumps throw `Error('Illegal onboarding transition: <from> → <to>')`.
- Each transition writes an audit entry (`entityType: 'Employee'`, `action: 'UPDATE'`, `metadata: { statusFrom, statusTo, ...meta }`).

**Allowed transitions:**

| From | → To | Trigger |
|---|---|---|
| `invitation_pending` | `onboarding_in_progress` | employee saves their first onboarding data — i.e. the first `PATCH /onboarding/:token/personal` or `.../emergency` or availability-draft save (password is never persisted, so it can't be the trigger). Fired once; a no-op if already past `invitation_pending`. |
| `onboarding_in_progress` | `pending_review` | employee submits |
| `pending_review` | `approved` | admin finalizes with all items approved |
| `approved` | `active` | automatic, same action as approval (login activated) |
| `pending_review` | `changes_requested` | admin finalizes with ≥1 item rejected |
| `changes_requested` | `pending_review` | employee re-submits fixed items |
| `active` | `inactive` | admin deactivates |
| `inactive` | `active` | admin reactivates |

`approved` is momentary (auto-flips to `active`) but is a valid, logged state for the audit trail.

---

## Section 2 — Per-item review model

Add **one** field to `EmployeeRequirement`:

- `reviewStatus String @default("pending")` — the admin's decision: `pending` / `approved` / `rejected`. Distinct from `status` (the employee's fulfillment: `required`/`submitted`/`approved`).
- `rejectionReason` (already exists) carries the per-item reason when `reviewStatus === 'rejected'`.

**Why separate `status` and `reviewStatus`:** `status` answers "did the employee fulfill it?"; `reviewStatus` answers "did the admin accept it?". An item can be `status: submitted, reviewStatus: rejected` — submitted-but-bounced — which is exactly the changes-requested case. Overloading a single field loses that.

**Pure derivation:** `reviewSummary(requirements)` in `requirementService.js`:
- All **required** items `reviewStatus === 'approved'` → submission fully approved (eligible to activate).
- Any item `reviewStatus === 'rejected'` → `changes_requested`; those items reopen for the employee.
- `optional` items never block (consistent with `isOnboardingComplete`).

**On re-submit after fixes:** a rejected item the employee redoes flips to `reviewStatus: 'pending'` + `status: 'submitted'`, and its `rejectionReason` clears — so it appears fresh in the next review round.

`projectLedger` gains `reviewStatus` in its output so both admin and employee UIs read it.

---

## Section 3 — Admin review flow

**Server (admin-only, on the onboarding/employee controller). All writes go through `onboardingLifecycle.transition()` and log audits.**

- `PATCH /api/employees/:id/requirements/:reqId/review` — body `{ decision: 'approved' | 'rejected', reason? }`. Sets that item's `reviewStatus` (+ `rejectionReason` on reject; reason required when rejecting → 400 if blank). Scoped to the employee (item must belong to `:id`).
- `POST /api/employees/:id/onboarding/finalize` — the admin's "submit review". Reads `reviewSummary`:
  - any rejected → `transition(id, 'changes_requested')`, reopen the onboarding token so the employee's link works, surface per-item reasons.
  - all approved → `transition(id, 'approved')` then `transition(id, 'active')`, activate the login `User`, send the existing welcome email.

These **replace** the PR #49 whole-submission `approve`/`reject`/`requestChange` endpoints; finalize is now driven by per-item decisions rather than one global note. The legacy single-note path and `adminReviewNote` are retired in favor of per-item `rejectionReason` (a migration clears/leaves `adminReviewNote` unused).

**UI — upgrade the existing `OnboardingReviewModal`:**
- Render a **per-item row list**: each document/cert/policy shows its label, the uploaded file (reuse `PreviewModal` / `FileThumbnail` / `useFileThumbnail`), and **Approve / Reject** controls; Reject reveals a required reason input.
- A single **"Finish Review"** button, enabled once every required item has a decision. It calls `finalize`: approve→activate if all-approved, else send back with the per-item reasons.
- Keep a one-click **"Approve all remaining"** bulk action for the common all-good case.
- Design-system buttons (`btn btn--success` / `btn--danger`) and existing file-preview components.

---

## Section 4 — Employee side (changes-requested loop + gating)

**Changes Requested return loop (`employee-app` `OnboardingPage`):**
- `projectLedger` now returns each item's `reviewStatus` + `rejectionReason`. When `onboardingStatus === 'changes_requested'`, show a **"Changes Requested" banner** listing the flagged items, each with the admin's reason underneath.
- **Approved items are locked** — read-only (the Area 1 "✓ Uploaded" state, no Replace). Only `reviewStatus: 'rejected'` items are editable (re-upload / re-ack).
- The wizard **jumps to the first rejected item's step** (reuse Area 1 resume logic) so the employee doesn't re-walk everything.
- **Re-submit** calls the existing submit endpoint → `transition(..., 'pending_review')`; each redone item flips to `reviewStatus: 'pending'` (Section 2). Personal/emergency/availability are editable only if they were flagged; otherwise locked.

**Status-based gating (app-level, one guard):**
- Until `onboardingStatus === 'active'`, the employee app renders **only** the onboarding flow (or the changes-requested view). Schedule, timesheets, messages, payroll, profile — hidden/redirected.
- Implemented once at the routing/shell level, keyed off the status from the existing auth/me response — not per-page.

**Edge case:** the login account is created at first submit (Area 1), so `pending_review` / `changes_requested` employees can already log in; the gate keeps them onboarding-only until `active`. Intentional.

---

## Section 5 — Data migration, testing, scope

**Data migration (one-time, idempotent; runs in the deploy seed chain, Area 1 pattern):**
- Add `EmployeeRequirement.reviewStatus` (default `pending`).
- Rename `Employee.onboardingStatus`: `invited → invitation_pending`, `submitted → pending_review`. `active` / `changes_requested` unchanged.
- Backfill mid-onboarding employees: `onboarding_in_progress` if they have saved onboarding data but haven't submitted, else `invitation_pending`.

**Testing (TDD):**
- **Server, test-first:**
  - `onboardingLifecycle` transition table — legal and illegal transitions (pure-function tests).
  - `reviewSummary` derivation — all-approved / some-rejected / optional-ignored.
  - Per-item review endpoint — sets `reviewStatus`/`rejectionReason`; rejects blank reason with 400; scoped to the employee.
  - `finalize` — all-approved → `active` + `User` activated + welcome email; any-rejected → `changes_requested` + token reopened + rejected items surfaced.
  - Re-submit flip-back — redone item → `reviewStatus: pending`, reason cleared, status → `pending_review`.
- **Employee-app, Vitest + design system:** changes-requested banner renders flagged items + reasons; approved items locked/read-only; gating guard hides non-onboarding routes until `active`.
- **No regression:** full server + both frontend suites green. Run server tests with `TZ=UTC` (`npm test`) against a dedicated `_test` DB — a `.env.test` pointing at a `*_test` database must exist, or `jest.setup.js` falls back to a shared DB and mass-fails on schema drift (lesson from Area 1 verification).

**Out of scope (YAGNI / later areas):**
- Multi-round formal review *history* table — the audit log already captures who/when per transition and per item decision.
- Area 3 (visit workflow, Private-Pay timesheet) and Area 4 (catalog-management UI) — separate specs.
- Status-change email/SMS beyond the existing welcome email.
- No change to Area 1 onboarding wizard *content*; Area 2 only adds the review-status overlay, the changes-requested loop, and gating.

**Cross-cutting conventions:** every transition and item decision logs an audit entry (`entityType: 'Employee'`); new statuses are added to any status-filter/label maps (admin employee list, History filters).
