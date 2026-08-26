# Employee Portal (PCALink) v3.0 — Areas 3 + 4: Visit Care-Plan, Employee Cert Management, Catalog Management — Design

**Date:** 2026-08-06
**Status:** Approved design, ready for implementation plan
**Depends on:** Area 1 (Onboarding + Requirements, merged PR #49). Independent of Area 2.
**Roadmap:** `docs/superpowers/specs/2026-08-04-employee-portal-v3-roadmap.md` (Areas 3 + 4, combined because Area 3 shrank)

## Purpose

Combine the two remaining v3 areas into one spec:

- **Area 3 (reduced):** surface the client's care-plan summary, read-only, on the employee's visit card. (The Private-Pay timesheet is OUT — the existing public PCA-form iframe already handles timesheets in production and employees use it today. The per-visit task checklist and employee visit-notes are deferred.)
- **Area 4:** full employee-app certification management (same experience as the admin cert tab, driven by the Area 1 ledger); an admin catalog-management UI (edit/reorder/deactivate the Documents/Certifications/Policies catalogs); catalog-driven expiry/renewal reminder tuning; and a shared `CertCard` so admin and employee cert cards look identical.

## What already exists

- **Care plan:** `Client.mainServices`, `Client.carePlanSchedule`, `Client.caregiverRequirements` (plain text, none PHI-encrypted). Admin edits them in the "Care Plan Summary" of `CarePlanTab`.
- **Employee schedule:** `employeePortal/scheduleController.js` returns each shift with an included `client` (name/address/phone/gateCode). `SchedulePage.jsx` already has expandable shift cards.
- **Certifications:** `EmployeeCertification` (expiry/status/current file) + `CertificationUpload` (file history) — the same records the admin manages in `EmployeeDetailPage` → Certifications tab (per-cert cards, upload via `CertUploadModal`, history download). Area 1 already links each certification **requirement** to an `EmployeeCertification` slot.
- **Employee app certs today:** `CertificationsPage.jsx` + `CertCard.jsx` exist but are driven by the hardcoded `CERT_TYPES` list, NOT the ledger.
- **Catalogs:** `DocumentType` / `CertType` / `PolicyDocument` already have `active`, `sortOrder`, editable `label`/`title`/`requiresExpiry`/`renewalYears`/`body`/`version`. `catalogController.js` has `list` + `create` only. No admin management page — only the Area 1 inline-add during employee creation.
- **Compliance:** `complianceService.evaluateCompliance` computes expiring/expired certs and creates tasks/notifications; renewal windows are effectively hardcoded per cert type in the UI today.

## Decisions (locked during brainstorming)

1. **Care plan:** show all three summary fields (`mainServices`, `carePlanSchedule`, `caregiverRequirements`), read-only, on the expanded visit card.
2. **Employee cert management:** give the employee app the FULL admin cert experience (per-cert cards with expiry/status, upload/replace, file history + download), **driven by the Area 1 requirement ledger** (only the certs the admin assigned), replacing the hardcoded `CERT_TYPES`.
3. **Admin catalog UI:** edit / reorder / deactivate the three catalogs. Deactivate (never hard-delete) — existing employee requirements referencing a row are untouched.
4. **Reminder tuning:** make expiry evaluation catalog-driven — `CertType.requiresExpiry` / `renewalYears` (editable in the admin UI) drive `complianceService`.
5. **Card consistency:** admin's employee-cert view reuses the same `CertCard` component the employee app uses (shared component).

---

## Section 1 — Care-plan on the visit card (Area 3)

**Server:** `employeePortal/scheduleController.js` — widen the existing `client: { select: {...} }` in the week-schedule query to also select `mainServices`, `carePlanSchedule`, `caregiverRequirements`. No new endpoint, no schema change, no migration. None are PHI-encrypted; the endpoint is already scoped to the employee's own shifts, so no new exposure.

**Employee app:** in `SchedulePage.jsx`, the already-expandable shift card gets a read-only **"Care Plan"** section in its expanded details — three labeled blocks (Main Services / Care Schedule / Caregiver Requirements), each rendered only when non-empty, using existing `.shift-card__detail-*` classes. Read-only; no employee editing.

---

## Section 2 — Employee certification management (full experience, ledger-driven)

**Server — new employee-portal endpoints** (auth = `req.employee`, scoped to their own certs; on `routes/employee.js`):
- `GET /api/employee/certifications` → for each certification the ledger assigned this employee: `{ requirementId, certType, label, status, reviewStatus, expirationDate, currentFile, uploads: [history] }`.
- `POST /api/employee/certifications/:reqId` (multipart `file`, optional `expirationDate`) → upload/replace. Reuses the Area 1 upload path (`safeFileName`, storage bucket): creates a `CertificationUpload`, updates the `EmployeeCertification` (fileName/expiry), and flips the requirement to `submitted`. (If Area 2 has landed, also set `reviewStatus: pending` so the re-uploaded item re-enters review; if not, that field does not exist yet and is simply omitted — the two areas are independent and neither blocks the other.) Audit-logged.
- `GET /api/employee/certifications/uploads/:uploadId/download` → stream a history file, scoped to the employee (404 cross-employee).

**Employee app — rebuild `CertificationsPage`:**
- Drive the list from `GET /api/employee/certifications` (the ledger), NOT the hardcoded `CERT_TYPES`.
- Each cert = a **card** (the shared `CertCard`, Section 4): status badge (approved/pending/expiring/expired/missing), expiry date, upload/replace, and an expandable **file-history list** with per-file download (reuse Area 1 upload/preview patterns + the app design system).

---

## Section 3 — Admin catalog-management UI (Area 4a)

**Server — extend `catalogController.js`** (admin-only, gated under the `employees` permission like the existing catalog routes; every mutation audit-logged):
- `PATCH /api/catalogs/:kind/:id` — edit label/title, `requiresExpiry`, `renewalYears`, `body`, etc.
- `PATCH /api/catalogs/:kind/:id/active` — toggle `active`. Deactivated rows stop appearing in the assign picker; existing employee requirements referencing them are untouched.
- `PATCH /api/catalogs/:kind/reorder` — accept an ordered id list, write `sortOrder`.
- (`create` + `list` already exist.)
- **Never hard-delete** — deactivate only (soft-delete norm).

**Admin — new management page** (a settings-style page, e.g. under the Services/settings area) with **three tabs**: Documents / Certifications / Policies. Each tab lists its catalog rows with inline edit, an active toggle, drag-to-reorder, and an "Add" (reusing create). Follows the app's settings-page + `.data-table`/card conventions and the **two-tier toolbar** pattern (GlobalToolbar undo/redo/activity + ContextBar), since it is a mutation page. New `entityType`s (`DocumentType`/`CertType`/`PolicyDocument`) added to `ENTITY_TYPES` in `HistoryPage`.

---

## Section 4 — Reminder tuning + shared CertCard (Area 4b + card consistency)

**Catalog-driven expiry.** Re-point the EXISTING `complianceService` at the catalog instead of a hardcoded per-type map:
- A cert's `requiresExpiry` / `renewalYears` (editable in Section 3) drive the expiry evaluation: `requiresExpiry: false` never flags; `renewalYears` sets the renewal cadence.
- `complianceService.evaluateCompliance` reads these from the `CertType` catalog (registry-style lookup) so tuning a cert in the admin UI changes reminders everywhere — admin compliance badges, employee cert cards (Section 2), and generated reminder tasks/notifications.
- No new reminder system; the "expiring soon" threshold stays a single tunable constant.

**Shared `CertCard`.** The admin employee-detail Certifications tab currently renders bespoke cert-card markup. Replace it with the same `CertCard` component the employee app uses (status badge + expiry + file + history), so admin and employee cert cards are identical. NOTE: `client/` (admin) and `employee-app/` are separate build roots with no shared module system, so one component cannot be imported by both. `CertCard` is therefore MIRRORED — the same component + styles exist in each app, kept identical and taking the same props, driven by the same per-cert data shape from Section 2.

---

## Section 5 — Migration, testing, scope

**Data / schema:** No new tables, no migration. Everything reuses existing models. The only non-UI change is `complianceService` reading `renewalYears`/`requiresExpiry` from the catalog (logic, not schema).

**Testing (TDD):**
- **Server, test-first:** employee cert endpoints (list scoped to `req.employee`; upload creates a `CertificationUpload` + flips requirement status; history download employee-scoped, 404 cross-employee); catalog update/reorder/deactivate (deactivate hides from picker, leaves existing requirements intact; reorder writes `sortOrder`); `complianceService` catalog-driven (a `requiresExpiry:false` cert never flags; `renewalYears` drives the window).
- **Frontend, Vitest + design system:** employee `CertificationsPage` renders ledger-driven cards with status/expiry/history and uploads via the endpoint; admin catalog page edits/reorders/toggles; shared `CertCard` renders identically in both apps.
- **No regression:** full server + both frontend suites green. Server tests run `TZ=UTC` (`npm test`) against a dedicated `_test` DB — a `.env.test` pointing at a `*_test` database must exist, or `jest.setup.js` falls back to a shared DB and mass-fails on schema drift (Area 1 verification lesson).

**Out of scope (YAGNI / deferred):**
- Private-Pay timesheet — skipped entirely (existing public PCA-form iframe handles timesheets in production).
- Per-visit task checklist and employee visit-notes — deferred; only the read-only care plan ships.
- Email verification during onboarding; biometric (WebAuthn/passkey) login — explicitly deferred.
- No hard-delete of catalog rows; deactivate only.

**Cross-cutting:** every catalog + cert mutation logs an audit entry (`entityType` Document/CertType/PolicyDocument or Employee); the admin catalog page follows the two-tier toolbar (undo/redo/activity) pattern.
