# Decisions

A running log of notable build-vs-adopt and design decisions, most recent first.

## 2026-08-14 — Timesheet PDF blowing up to ~43 pages: fix in-house on PDFKit

**Options considered:**
- Adopt a higher-level PDF/layout library that paginates automatically (e.g. `pdfmake`, `@react-pdf/renderer`, or an HTML→PDF path via `puppeteer`). Signals: `pdfmake` and `@react-pdf/renderer` both handle flow layout and page breaks for you, but adopting either means rewriting the entire hand-tuned landscape grid (absolute-positioned day columns, merged totals cell, signature block) from scratch; `puppeteer` adds a headless-Chromium native dependency that is deploy-fragile on Railway. All three are large swaps for what is a single-page document that already renders correctly when it fits.
- Build in-house: keep PDFKit, fix the actual defect.

**Choice:** Build in-house — keep PDFKit; fix the pagination bug directly.

**Why:** The bug is in our own layout logic, not a missing capability. `renderTimesheetPage` draws everything at manually-tracked absolute `gridY` coordinates; when a timesheet has enough sections (PAS + Homemaker + Respite + Companion) the content grows past the page's bottom margin, and PDFKit's *automatic* pagination then flushes a fresh page on every subsequent `doc.text()` call — producing dozens of near-blank pages with the signature block stranded far down. Fix (two parts, both at root cause): (1) disable auto-pagination during a single page's render so overflow can never silently spawn pages (safety net), restoring real `addPage` afterward so bulk export still gets one page per timesheet; (2) measure total content height up front and apply a uniform vertical `doc.scale()` when it exceeds the printable area, so the whole record — including signatures — always fits one landscape page. A library swap would discard the existing grid/signature layout for no benefit. Built test-first: a failing test reproduced the 45-page explosion; after the fix, four-section and two-section timesheets render 1 page and bulk export renders exactly N pages.

## 2026-08-09 — Reusable Tooltip: adopt Radix over building or floating-ui

**Feature:** A reusable `<Tooltip>` for the whole app, replacing the native `title`
attribute (browser-fixed ~1s delay, unstyleable) starting with the read-only
Sandata/account `ResolvedIdField` on the Scheduling page. 56 files use native
`title=`; two ad-hoc CSS tooltip patterns already exist (`.payroll-note-tooltip`,
`.auth-note-tooltip`), so a shared primitive is overdue.

**Options considered:**
- **@radix-ui/react-tooltip** — ~8KB, unstyled (write our own CSS with zinc tokens),
  full WAI-ARIA 1.2 a11y out of the box, collision handling via its internal
  Floating UI dep. Actively maintained (v1.2.16, released within ~2 weeks; explicit
  React 19 re-render fixes; 6,100+ dependents). React 19 confirmed compatible.
- **@floating-ui/react** — ~10KB, unstyled, great positioning but a11y is
  DIY (manual `aria-describedby`, focus, Escape). 29k stars, 12M weekly downloads.
- **Tippy.js** — ~15KB, pre-styled (fight the defaults), ARIA not fully WAI-ARIA 1.2,
  slower maintenance.
- **Build custom** (CSS-only or JS-positioned) — no dep, but we'd re-solve collision
  positioning and a11y that Radix already ships correctly.

**Decision:** Adopt **@radix-ui/react-tooltip**. It gives Floating-UI positioning AND
full a11y for the smallest bundle, and being headless it styles cleanly with our
existing custom CSS (no design-system conflict). Wrapped in one app component
(`client/src/components/common/Tooltip.jsx`) so the Radix dependency stays behind our
own interface and future migration is a one-file change. Chosen over floating-ui
(would hand-roll a11y) and over building custom (re-inventing solved problems).

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

## 2026-08-05 — Employee onboarding + requirements (Employee Portal v3, Area 1)

**Options considered:**
- Adopt an onboarding/compliance-tracking product or a headless form/checklist library (e.g. a SaaS HR-onboarding tool, or a generic "document collection" package). Signals: mature onboarding SaaS exists, but it lives outside our data model — it can't read our `Employee`/`EmployeeCertification` records, our permission/role model, our audit trail, or our PHI-at-rest encryption, and would create a second source of truth for who a caregiver is and what they've submitted. A headless checklist/form library solves rendering, not the domain: it wouldn't know our cert catalog, our PCA-form availability schema, or the account-creation-on-submit flow.
- Build in-house on existing patterns: a `Client`-note-style requirement **ledger** (`EmployeeRequirement`) over three admin-managed catalogs (`DocumentType`/`CertType`/`PolicyDocument`), fulfilled by uploads that reuse the existing `storageService` bucket and `EmployeeCertification`/`EmployeeDocument` records; PHI (`ssn`) via the existing transparent-encryption layer; the employee-facing wizard reusing the existing `employee-app` `.onboard-*` design system; admin review surfaced in the **existing** lead-reminders popup and a `LeadDetailModal`-style modal with timesheet-style Accept/Reject/Request-Change actions.

**Choice:** Build in-house.

**Why:** Onboarding here is inseparable from the existing domain — it creates the login `User`, writes `Employee`/cert records, stores PHI under our encryption key, and must appear in our audit/History. An external tool would fragment identity and compliance across two systems and couldn't honor PHI-at-rest or our role model. Every building block already existed (bucket storage, cert records, audit/undo, the employee-app design system, the lead-reminders popup, the detail-modal pattern), so building reused them instead of importing a parallel stack. The one genuinely new concept — a requirement ledger with optional (non-gating) items — is a small model + pure `isOnboardingComplete` function, not something a library provides. No new dependency; one source of truth.

## 2026-08-07 — Scheduling bulk-edit fixes (future propagation + add-shift on empty day)

**Options considered:**
- Adopt a third-party scheduling/calendar component (e.g. FullCalendar, react-big-calendar) or a generic recurring-event library. Signals: mature and popular, but none of them model our domain — per-client authorization gating, `recurringGroupId` propagation, overlap blocking, audit logging, and undo/redo are all coupled to our data model. Swapping in a library would be a disproportionate rewrite of working UI and wouldn't address the actual bugs.
- Build in-house: fix the two defects in place inside our own `BulkEditModal` (`SchedulingPage.jsx`) and `bulkUpdateShiftsPerShift` (`schedulingController.js`).

**Choice:** Build in-house — fix in place, minimal change.

**Why:** The bugs are in our own logic, not a missing capability. (1) "Apply to all future recurring weeks" only propagated to shifts sharing a `recurringGroupId`, silently skipping week-by-week shifts; fixed by adding a fallback that matches future shifts by client + employee + weekday + service code (the existing day-of-week matcher already leaves non-matching shifts untouched). (2) A shift couldn't be added to a day with no existing shifts because the grid only rendered days that already had shifts; fixed by iterating all seven weekdays (mirroring the Create Shift modal), so every day shows "+ Add shift". A library swap would fragment our auth/overlap/audit/undo integration for no benefit. Server change built test-first (new failing test → fix); both fixes verified in the running app.

## 2026-08-10 — Inline file thumbnails + hover preview (Monday.com-style)

**Options considered:**
- Adopt `react-pdf` (wojtekmaj) 10.4.1 for PDF rendering. Signals: ~9k GitHub stars, actively maintained, explicit React 19 peer support, bundles `pdfjs-dist`. But it is a full document *viewer* (Document/Page components, text + annotation layers, 8 transitive deps) — far more than a 40px cell thumbnail needs. Right choice only if we later want an in-app multi-page PDF reader.
- Adopt server-side PDF thumbnailing (`pdf2pic`, `pdf-thumbnail`). Signals: produces real raster thumbnails, but requires native binaries (GraphicsMagick/ImageMagick + Ghostscript) on the host — deploy-fragile on Railway, heavy for marginal fidelity gain over client rendering.
- Adopt `sharp` for image thumbnails. Signals: industry standard, ~6M weekly downloads, native libvips, fast. But it solves a server *pipeline* we don't need — the browser already downscales small images for free via `<img>`.
- Build in-house on `pdfjs-dist` (raw) 6.2.108: render each PDF's first page to a small `<canvas>` client-side; render images via plain `<img>`; reuse the existing `PreviewModal` for click-to-open and a small custom hover popover for the peek. Lazy-render only visible thumbnails, cap at first N + a `+N` overflow badge, fall back to a typed file-icon on render failure / oversize.

**Choice:** Build in-house on raw `pdfjs-dist` (client-side); no server changes, no native binaries.

**Why:** `pdfjs-dist` is Mozilla's own library with **zero dependencies and zero native binaries** (~2.6M weekly downloads, actively maintained) — it renders a PDF page to canvas in the browser, which is exactly and only what a thumbnail needs. `react-pdf` would pull a full-viewer stack for a feature that is a single `getPage(1).render()` call. Server-side rendering (`pdf2pic`) and `sharp` both add native-binary deploy risk on Railway for fidelity the client already achieves. Images need no library at all (browser downscales `<img>`). The inline-thumbnail grid, `+N` overflow badge, and hover popover are presentational UI that reuse the `PreviewModal` and download endpoints already built in the employee-documents feature — one source of truth for fetching a file's bytes. The one tradeoff (client fetches each PDF to render its first page) is bounded by lazy-loading visible-only thumbnails and the `+N` cap.

## 2026-08-12 — Safe inline editing (`InlineEditable` shared primitive)

**Options considered:**
- Adopt a third-party inline-edit / editable-cell library (e.g. `react-easy-edit`, `@tanstack/react-table` editable cells, `react-contenteditable`). Signals: some are popular, but they either ship their own visual/interaction model that fights our shadcn/zinc design system, are coupled to a data-grid we don't use, or (contenteditable) are notoriously fragile for plain-text fields. None encode the specific safety behavior we need (explicit-open, blur-cancels, empty-guard, toast+undo, reject-to-detect-failure), so we'd be re-implementing our own contract on top of a dependency anyway.
- Patch each existing inline editor in place. Signals: smallest diff per file, but the app already had ~5 copy-pasted click-to-edit editors; patching each repeats the work and the next new page copies whichever unsafe copy it finds. Doesn't produce a durable app-wide guarantee.
- Build in-house: one shared `InlineEditable` primitive (`client/src/components/common/InlineEditable.jsx`) that owns the interaction, and route all existing editors through it.

**Choice:** Build in-house — a single shared primitive, migrate the 5 existing editors to it.

**Why:** The requirement is a specific *safety contract*, not a missing widget: edit opens only via an explicit pencil affordance, ✓/✕ confirm with **blur cancelling** (killing the old silent-blur-save), a blank-value guard, a success toast, optional undo, and — critically — failure detection via the `onSave` promise rejecting. No off-the-shelf library encodes this, and every candidate would still need our contract layered on top while dragging in its own styling/data-model assumptions that clash with our design system. A ~150-line presentational component with zero new dependencies gives one place to maintain the behavior; "app-wide" only stays true if there's a single primitive the next page reuses. Built strictly test-first (14 RTL tests), reviewed per task; the migration also surfaced and fixed two latent error-swallow bugs (`handleSaveCarePlanField`, `handleSandataClientIdChange`) that the stricter reject-to-fail contract exposed.

## 2026-08-18 — Future-dated authorization renewals no longer retire the current auth early (Scheduler/Care Plan)

**Options considered:**
- Adopt a temporal/effective-dated data library (e.g. a "valid-time" ORM layer or a bitemporal package) to model authorization validity windows. Signals: solves the general problem, but heavyweight — the app already stores `authorizationStartDate`/`authorizationEndDate` and already filters by date-range overlap (`filterAuthsByWeek`). A library would duplicate a model we have and fragment the existing audit/undo/renewal-chain logic for no gain.
- Patch only the symptom in the Scheduler view. Signals: smallest diff, but the root cause is upstream in the renewal handler, so Care Plan and any other date-driven consumer would still break.
- Build in-house: fix the root cause — stop the renewal handler from eagerly flipping the current auth to `inactive` when the new start date is in the future; let the (already-correct) date-range filtering govern visibility.

**Choice:** Build in-house — root-cause fix in `renewAuthorization`, plus close two latent date-guard gaps it exposed.

**Why:** The bug is in our own logic, not a missing capability. `renewAuthorization` set the renewed-from auth to `manualStatus: 'inactive'` immediately, and both the server (`filterAuthsByWeek`) and the client Scheduler reject non-active auths — so a future renewal made the current auth vanish (0 units) before its effective date. Fix: keep the old auth **active** on a future renewal (its end date is already moved to the day before the new start), so date-range filtering keeps showing current units until the new auth's start date, then switches automatically. Two guards the change surfaced were also fixed: (1) `deactivatePreviousAuths` now accepts an id array so the still-active renewed-from auth isn't swept as "superseded"; (2) the Scheduler's `authorizedServiceMap` now skips not-yet-effective auths (missing start-date check) so current + future units don't double-count during the gap. Also made the Programs tab pick the auth effective *today* for its card so a future renewal doesn't display its future units early. Immediate/backdated renewals (start ≤ today) still close the old auth now. Built test-first: failing test reproducing the vanished current auth → root-cause fix → green; added an end-to-end `filterAuthsByWeek` test proving current units before the new start and new units after. Server 720/721 (1 pre-existing cross-suite flake, passes in isolation), auth+scheduling 75/75, client 70/70.

**Backfill for rows broken before the fix:** existing authorizations already
retired early by this bug are NOT self-healing (the fix only changes new
renewals). Added `server/prisma/fix-early-retired-renewals.js` — a one-time,
dry-run-by-default, idempotent, audited repair that reactivates any
renewed-from auth whose successor's start date is still in the future and whose
own window still covers today (leaving end dates and the successor untouched).
Verified end-to-end on the test DB (dry-run → apply → no-op re-run). Run
`node prisma/fix-early-retired-renewals.js` (dry run) then `--apply` on prod.

**Model refinement (single source of truth):** per the SSOT rule that the
authorization is the source of truth and only the *current active*
authorization should drive the system, the fix was reworked so an auth's
START/END dates decide what is "current today", with `manualStatus` as a manual
override on top. The immediate-vs-scheduled decision is now an EXPLICIT choice
in the renewal confirmation modal ("Wait until start date" — recommended — vs
"Start immediately"), sent as `renewalActivation` and honored server-side (no
date inference except as back-compat). A shared helper
`client/src/utils/authorizations.js` (`isAuthEffectiveOn` / `currentAuthorizations`
/ `currentAuthForCode`) is the single place any consumer asks "is this the
current auth?", and the Scheduler unit maps + Programs card + account/Sandata
auto-fill all route through it — so nothing reads raw `manualStatus` without the
date window and a not-yet-effective scheduled renewal can never be counted.

**Renewal modal UX + payroll banner (follow-up):** the "wait vs start
immediately" choice moved to its OWN confirmation modal shown after "Save
Renewal" (only for a future start), and the pre-save "auto-closes on <date>"
preview banner was removed. Extended the single-source-of-truth (date-effective)
rule to the Payroll run: the banner's authorized-units map (`buildClientAuthMap`
in `payrollController.js`) now filters authorizations to those effective for the
run's pay period via `filterAuthsByWeek` (falling back to "today" when a run has
no period), so a scheduled future renewal is no longer summed on top of the
current auth (e.g. SDPC 28 + 28 = 56). The payroll processing pipeline and
manual-unit-limit cap already used `filterAuthsByWeek` per visit week, so only
the banner map needed the fix.

**App-wide single-source-of-truth audit + expired-drops-to-history:** audited
every surface that reads authorizations. Server operational paths were already
date-correct: Timesheet limits use a per-week filter (`filterActiveAuthsForWeek`
in `timesheetController.js`), Scheduling uses `filterAuthsByWeek` per shift week,
the PCA form uses `filterAuthsByWeek`/`classifyWeekAuthBySection` per week, and
payroll processing/manual-cap use `filterAuthsByWeek` per visit week — so a
future renewal never leaks into a past/current period. The only server gap
(payroll banner) was fixed earlier this session. On the client, the ledger LISTS
were status-only (`manualStatus==='active'`), so a date-expired auth lingered in
"Active" after its end date. Per the decision "hide expired from Active, keep in
History", added `isAuthListedActive` / `isAuthExpired` to `utils/authorizations.js`
and routed the master sheet (AuthorizationsPage), Programs tab card, Profile
overview, ClientServicePage current-auth, and the client-detail header chips
through the shared helpers — so once a renewal starts, the old program drops out
of Active views and remains under authorization history. Also added an advisory
coverage-gap/overlap WARNING (`coverageIssue`) in the auth modal (never
auto-edits dates) after finding a real 1-day SDPC gap (old ends Aug 30, renewal
starts Sep 1 → Aug 31 uncovered) in existing data.

**Pre-fix data — two categories.** Auditing live data surfaced two pre-existing
problems from renewals created before the fixes: (1) early-retired renewals (old
auth flipped inactive while its successor hasn't started) — repaired by
`fix-early-retired-renewals.js` (found 2: Frank Wilson PCS, Andranik Zadoyan
S5125); (2) coverage gaps/overlaps between same-code auths. Added
`report-auth-coverage-gaps.js` — REPORT-ONLY by default (matches "warn, don't
auto-change"), with an opt-in `--fix-gaps` that closes gaps by extending the
prior auth's end date to the day before the next start (never touches overlaps —
shortening an auth is a staff judgement call). Excludes MULTI_AUTH_CODES
(COPE/PAS) since concurrent program auths are by design. Dev DB: 2 real gaps
(Andranik SDPC + S5125, 1 day each on Aug 31) and 2 overlaps (Cheryl Johnson
S5150, Evan Moreland S5130) for staff review. Dates written at UTC midnight to
avoid a timezone day-shift.
