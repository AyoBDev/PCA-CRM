# Employee Portal (PCALink) v3.0 — Roadmap

**Date:** 2026-08-04
**Status:** Approved (brainstorming)
**Scope:** Sequencing document for closing the gap between the current `employee-app` and the PCALink Employee Portal v3.0 spec.

## Context

The current `employee-app/` is already the correct architecture for v3.0: a React 19 + Vite **PWA** (installable, offline API cache, autoUpdate service worker), mobile bottom-tab / desktop left-rail layout, its own employee auth, socket.io real-time messaging, and a Vitest + Jest test suite. v3.0 is therefore **feature completion and lifecycle hardening on an existing foundation**, not a rewrite.

Two mockup details were explicitly reconciled during brainstorming and do **not** change the product:

- **Clock-in/out on the visit card** — rejected as the portal's job. A **separate, state-owned Sandata EVV system owns clock-in/out and official visit verification.** The portal is informational + agency-record-keeping only (see Area 3).
- **"Open Shifts Near You" job board** — a mockup mistake. **Follow the spec:** scheduler-initiated Cover Shift Requests only (already partly built via the offers flow). No self-serve open-shift marketplace.

## Decomposition

The v3.0 gap is split into four sequenced sub-projects. Each gets its own spec → plan → build cycle.

### Area 1 — Onboarding + Requirements (Documents / Certifications / Policies) — **deep spec now**

Expanded onboarding backed by a shared **requirement ledger** over three **admin-managed catalogs** (Documents, Certifications, Policies), with per-employee requirement selection made **at add-employee time**.

Onboarding step sequence becomes:
`Password → Personal Info → Emergency Contact → Availability → Documents → Certifications → Policies → Review → Submit`

Foundation for everything else: it creates the requirement/catalog data that Areas 2 and 4 operate on. Full spec: `2026-08-04-employee-onboarding-requirements-design.md`.

### Area 2 — Lifecycle + Agency Review

Formalize the employee status machine from today's 3 states (`invited → submitted → active`) to the spec's 7 (Invitation Pending → Onboarding In Progress → Pending Review → Changes Requested → Approved → Active → Inactive). Add:

- **Agency review** actions (Approve / Reject / Request Changes) over the Area 1 requirement ledger.
- **Changes Requested** loop: per-item rejection reason; the employee corrects **only** the rejected item without restarting onboarding.
- **Status-based feature gating** (which portal features are available per status).

**Depends on Area 1** — the review targets are the requirement items Area 1 produces.

### Area 3 — Visit Workflow (info + notes/tasks)

A read/record visit screen on the Schedule surface:

- Care-plan view, task checklist, visit notes — for the **agency's own records**.
- **Sandata owns clock-in/out and EVV verification.** The portal never performs or submits official EVV.
- **Payer-gated Private-Pay timesheet:** for Private Pay clients (not in Sandata), the last step is a timesheet with hours/break/mileage + **client signature + employee signature**. Medicaid/waiver/insurance visits show **no** timesheet step.

Requires payer-type awareness on clients/visits. **Mostly independent** of Areas 1–2; can be parallelized.

### Area 4 — Catalog management + polish

- Admin UI to fully manage the Documents / Certifications / Policies catalogs (edit, reorder, deactivate) beyond the seed + inline-add in Area 1.
- Expiry/renewal reminder tuning.
- Deferred items: **email verification** during onboarding, **biometric login**.

## Build order & rationale

1. **Area 1** creates the requirement/catalog foundation everything references.
2. **Area 2** wraps review + lifecycle logic around that ledger.
3. **Area 3** is separable (scheduling/timesheet, not onboarding) and may run in parallel.
4. **Area 4** is cleanup once the core exists.

## Cross-cutting conventions (apply to every area)

- **Design system:** all frontend work uses the app design system (per standing user feedback); admin pages follow the two-tier toolbar + Undo/Redo/History/Activity pattern.
- **TDD:** backend logic is built test-first (Jest); frontend components tested with Vitest.
- **Audit:** every mutation logs `audit.logAction()`; new `entityType`s are added to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.
- **PHI:** SSN and DOB follow the existing encryption-at-rest layer (`phiCrypto` / `PHI_FIELDS`); DOB stored as a `YYYY-MM-DD` string.
- **Storage:** employee documents use the Railway bucket via `storageService` (local FS fallback in dev), storing only a `storageKey`.
