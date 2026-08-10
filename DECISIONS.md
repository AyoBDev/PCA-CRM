# Decisions Log

Build-vs-adopt reasoning, one entry per feature.

---

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
