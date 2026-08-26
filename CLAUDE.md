# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Full-stack web app for a PCA (Personal Care Attendant) agency to manage client authorizations, timesheets, digital signatures, and payroll processing.

## Tech Stack
- **Frontend**: React 19 + Vite, page-per-file under `client/src/pages/`
- **Backend**: Express.js + Prisma ORM + PostgreSQL
- **Auth**: JWT with role-based access (`superadmin` / `admin` / `user` / `pca`). JWTs carry `agencyId` + `agencySlug` and only work on that agency's subdomain — a token minted on `nvbest.<BASE_DOMAIN>` is rejected on any other agency's subdomain. The platform console lives at `admin.<BASE_DOMAIN>` (reserved slug — no agency can claim it); superadmin login and all `/api/platform` routes require that host in production. The apex domain (`<BASE_DOMAIN>`) serves a public landing page, not a login form — `LoginPage.jsx` calls `GET /api/host-info` on mount and renders the platform login, the agency login, or `LandingPage.jsx` accordingly.
- **Multi-tenancy**: every agency's data lives in the same database, isolated by Postgres Row-Level Security keyed on `agency_id`. See the Backend Structure section below for `tenantPrisma.js` / `tenantContext.js` / `resolveAgency.js` / `tenantMiddleware.js`.
- **Styling**: Custom CSS (`client/src/index.css`) using shadcn/ui zinc design tokens

## Key Commands
```bash
# Development
cd server && npm run dev          # Start API server (port 4000, uses --watch)
cd client && npm run dev          # Start Vite dev server (port 5173, proxies /api to 4000)

# Database
cd server && npx prisma migrate dev --name <name>   # Create + apply migration
cd server && node prisma/setup-app-role.js          # Provision/refresh the RLS-constrained app_user DB role (needs APP_DB_PASSWORD)
cd server && npm run db:seed                         # Seed default agency + admin; superadmin credentials synced from env every run (ADMIN_EMAIL/ADMIN_PASSWORD, SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD, NVBEST_AGENCY_NAME/NVBEST_AGENCY_SLUG env vars)
cd server && node prisma/import-xlsx.js --agency <slug>   # Import clients from data/all-data.xlsx into one agency (flag required)
cd server && npm run db:migrate-data                # One-time SQLite → PostgreSQL data migration

# Build & Production
cd client && npm run build        # Build to client/dist (served by Express at port 4000)
npm start                         # prisma migrate deploy → setup-app-role.js → seed → start server

# Tests
cd server && npm test             # Run Jest unit tests (--verbose) — auto-provisions its DB, see note below
cd server && npm run test:integration   # Run Postgres-backed integration tests (RLS, tenant isolation, cross-agency guards) — spins up/migrates a nvbestpca_test DB automatically
cd server && npx jest --testPathPattern=authorizationService  # Run a single test file

# Backup
# Admin can download a full database backup via Dashboard → "Backup" button
# Or via API: GET /api/backup/export (admin-only, returns JSON file)
```

**Important**: In production mode (`localhost:4000`), Express serves `client/dist`. After any frontend change, rebuild the client and hard-refresh (`Cmd+Shift+R`).

## Architecture

### Backend Structure
```
server/src/
  app.js            # Express setup: CORS, JSON body parser, /api routes, static serving
  index.js          # Entry point: loads env, starts server on PORT (default 4000)
  routes/api.js     # All route definitions
  controllers/      # Route handlers (thin layer, delegate to services)
  services/         # Business logic
  middleware/authMiddleware.js     # authenticate() + requireRole(...roles)
  middleware/resolveAgency.js      # Parses Host header → subdomain slug → req.agency (cached 60s); 404s unknown subdomains on /api, sets req.agencyNotFound otherwise
  middleware/tenantMiddleware.js   # Requires req.user.agencyId, rejects superadmin tokens, checks agency status, sets req.db = tenantClient(agencyId), runs the rest of the request inside runWithTenant()
  lib/prisma.js       # Owner-connection Prisma client — ALLOWLIST-ONLY, see rule below
  lib/tenantPrisma.js # tenantClient(agencyId) / tenantTransaction(agencyId, fn) — Prisma client extension that auto-stamps agencyId on creates and scopes every query via `SET LOCAL app.agency_id` so RLS applies
  lib/tenantContext.js # AsyncLocalStorage-backed getTenantDb()/getAgencyId() — lets services read the current request's tenant client without req being threaded through
  lib/timesheetUtils.js  # Shared: roundTo15, computeHours, computeTotalHoursWithBlocks, deriveTimesheetService, activity lists
prisma/
  schema.prisma     # PostgreSQL schema with @@map snake_case names; Agency model + agency_id on every tenant table
  seed.js           # Creates default agency + admin once (skips if exists); syncSuperadmin() creates-or-updates the superadmin from SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD on every run. Uses ADMIN_EMAIL/ADMIN_PASSWORD, NVBEST_AGENCY_NAME/NVBEST_AGENCY_SLUG env vars
  setup-app-role.js # Idempotently provisions the `app_user` Postgres role (NOBYPASSRLS) that tenantClient connects as via APP_DATABASE_URL
  migrate-data.js   # One-time SQLite → PostgreSQL data migration script
  migrations/       # Timestamped SQL migrations (includes the RLS-enabling migration: ENABLE ROW LEVEL SECURITY + tenant_isolation policy per tenant table, keyed on current_setting('app.agency_id'))
```

**Tenant data-access rule (enforced by test):** controllers read/write the database via `req.db` (set by `tenantMiddleware`); services that don't have `req` in scope call `getTenantDb()` from `lib/tenantContext.js` instead. `lib/prisma.js` (the owner connection, bypasses RLS) is allowlist-only — see `server/src/__tests__/prismaImportGuard.test.js`, which greps the codebase for `lib/prisma'` imports and fails if any file outside its allowlist (auth/tenant middleware, platform + backup controllers, auditService, public-token controllers, cron jobs) imports it directly.

### Frontend Structure
Pages are split into individual files under `client/src/pages/`:
- `DashboardPage.jsx`, `ClientsPage.jsx`, `TimesheetsListPage.jsx`, `PayrollPage.jsx`, `SchedulingPage.jsx`, `EmployeesPage.jsx`, `InsuranceTypesPage.jsx`, `ServicesPage.jsx`, `UsersPage.jsx`, `PcaFormPage.jsx`, `FilesPage.jsx`

Shared components under `client/src/components/`:
- `common/Icons.jsx` — 25+ inline SVG icon components
- `common/GlobalToolbar.jsx` — Tier 1 system toolbar (Back, Title, Undo/Redo/History/Activity, Trash, Archive, Overflow)
- `common/ContextBar.jsx` — Tier 2 page-specific toolbar (compound: `ContextBar.Left` + `ContextBar.Right`)
- `common/AutocompleteInput.jsx` — Reusable autocomplete text input (used for Service Category, Service Name)
- `common/InlineEditable.jsx` — **Safe** click-to-edit primitive for inline cell/field editing (see "Inline Editing" section below)
- `common/HistoryPanel.jsx` — Session history dropdown (shows undo stack)
- `common/OverflowMenu.jsx` — Three-dot "⋯" overflow menu
- `common/DropdownMenu.jsx` — Reusable dropdown (trigger + panel)
- `common/ActivityDrawer.jsx` — `ActivityButton` (page-level) and `EntityActivityButton` (entity-level) audit log viewers
- `common/Modal.jsx`, `common/ConfirmModal.jsx`, `common/SignaturePad.jsx`
- `common/DocViewer.jsx` — the shared pdf.js/image **rendering engine**; both `PreviewModal` (full-screen) and `FilePreviewPane` (docked) render it. See "File Preview & Thumbnails" below.
- `common/FilePreviewPane.jsx` — **docked** split-view alternative to the full-screen `PreviewModal`. See "File Preview & Thumbnails" below.
- `common/CertViewerPanel.jsx` — **persistent** DocViewer panel for the two-column certification portfolio layout. See "File Preview & Thumbnails" below.
- `common/ToggleSwitch.jsx` — reusable sliding on/off switch (`role="switch"`, keyboard-toggleable).
- `common/Tooltip.jsx` — **App-wide tooltip** (see below). Use this for all hover/focus hints; do not add new native `title=` attributes.
- `layout/Layout.jsx`, `layout/Sidebar.jsx`, `layout/Toast.jsx`

### Tooltip (`common/Tooltip.jsx`) — the standard hover/focus hint

Reusable tooltip that wraps `@radix-ui/react-tooltip` behind our own interface (so the library stays swappable in one file). Radix gives collision-aware positioning (via Floating UI) and full WAI-ARIA a11y (`aria-describedby`, keyboard focus, Escape to dismiss); we only supply styling. **Prefer this over the native `title` attribute** — `title` has a browser-fixed ~1s delay, can't be styled, and doesn't work on keyboard focus.

- **Provider is already mounted once** at the app root (`TooltipProvider` in `client/src/main.jsx`). Do not add another provider — just use `<Tooltip>` anywhere.
- **Styling** lives in `index.css` (`.tooltip-content`, `.tooltip-arrow`), using the zinc tokens (`--popover`, `--border`, `--radius`). `z-index: 2000` so it renders above modals (`.modal-backdrop` is `z-index: 100`).
- **Usage** — wrap any focusable/hoverable trigger (`asChild` passes the tooltip to your element, so it keeps its own styles):

```jsx
import Tooltip from '../components/common/Tooltip';

<Tooltip content="Explains this control">
  <button className="icon-btn" aria-label="Help">{Icons.helpCircle}</button>
</Tooltip>
```

Props: `content` (string/node — if falsy, the trigger renders with no tooltip), `side` (`'top'` default), `align` (`'center'` default), `delayDuration` (ms, default 150), `sideOffset` (default 6). The trigger should be a single focusable element for a11y. Migrate existing native `title=` usages to `<Tooltip>` opportunistically when touching a component.

Hooks under `client/src/hooks/`:
- `useAuth.js` — auth context with `isAdmin`, `authUser`
- `useToast.js` — toast notification context
- `useUndoStack.js` — undo/redo stack state management (pushAction, undo, redo, undoTo, clear)
- `useNavigationStack.js` — smart Back button navigation with logical parent fallbacks

Utils under `client/src/utils/`:
- `constants.js` — **Single source of truth** for all shared constants (AUTH_COLORS, SERVICE_COLORS, SERVICE_CODE_NAMES, SERVICE_CODE_COLORS, activity lists, TIMESHEET_STATUS_STYLES, DAY_NAMES, PAGE_SIZE, SERVICE_CODE_SORT_ORDER, `getAuthSortKey()`, ACTION_COLORS, CERT_COLORS)
- `serviceCodes.jsx` — `SERVICE_CODE_OPTIONS`, `SERVICE_CATEGORIES`, `SERVICE_NAME_SUGGESTIONS`, `ServiceCodeSelect` component, `deriveServiceCode()` (pattern-match service name → code)
- `accountMapping.js` — `ACCOUNT_NUMBER_OPTIONS`, `getAccountForCategory()`, `getAccountForServiceCode()`, `CATEGORY_ACCOUNT_MAP`, `SERVICE_CODE_ACCOUNT_MAP`
- `dates.js` — `fmtDate()`, `formatWeek()`, `formatDate()`, `formatDateTime()`, `getSunday()`, `toLocalDateStr()`, `getWeekRange()`
- `time.js` — `hhmm12()` (24h→12h display), `roundTo15()` (15-min rounding), `computeHours()` (time diff in quarter-hours), `unitsToHours()` (units÷4)
- `ui.js` — `getInitials()`, `getAvatarColor()`, `CLIENT_COLORS`, `getClientColor()` (avatar/color helpers used across list pages)
- `status.js` — `visitRowClass()`, status labels

`client/src/api.js`: one named export per endpoint. Token stored in `localStorage('token')`; 401 responses dispatch `auth:logout` event and clear token. File uploads (`uploadPayrollRun`) use raw `fetch` to avoid setting `Content-Type` (lets browser set multipart boundary).

### Timesheet Controller Notes
- `roundTo15()` rounds time strings to nearest 15 minutes before computing hours
- `computeHours()` uses rounded times and returns decimal hours
- `computeTotalHoursWithBlocks()` sums primary shift + all extra shifts (timeBlocks)
- Entries store ADL/IADL activity arrays as JSON in the `activities` column

### PCA Form (`PcaFormPage.jsx`)
Public-facing timesheet form accessed via permanent link (`/pca-form/:token`). Features:
- **Multiple shifts per day**: "+ Add Shift" button adds Shift 2, 3, etc. with independent time in/out. Stored as JSON in `adlTimeBlocks`/`iadlTimeBlocks`/`respiteTimeBlocks` fields. "x" button removes the last shift.
- **Reusable weekly date control**: "Week of Sunday" date picker with prev/next arrows. Changing the Sunday date auto-fills Mon–Sat. Loads or creates a timesheet for the selected week.
- **Save Progress**: draft save without submitting. Submit requires signatures and validation.
- **Service sections**: PAS (ADL), Homemaker (IADL), Respite, Companion — each enabled/disabled based on client's active authorizations for the week.
- **Authorization limits**: displays authorized hours/units per service near client info. Blocks submission if hours exceed authorized limits. Service code mapping: PCS/PAS/COPE → PAS, S5130/S5120 → Homemaker, S5150 → Respite, S5135 → Companion.
- **Legacy `/sign/:token` redirect**: `SignRedirectPage` resolves the signing token to a permanent link (auto-creates one if needed) and redirects to `/pca-form/:token`.

### Timesheet PDF Export
`exportTimesheetPdf` in `timesheetController.js` generates a landscape LETTER PDF with:
- Full grid borders and column dividers for each day
- Multiple shift rows (Shift 1, Shift 2, etc.) from timeBlocks
- 12-hour time format (AM/PM)
- Page overflow handling with day header repeat on new pages
- Signature section with lines and labels

### Routing
**Client-side** (React Router):
- Route scheme: `/dashboard`, `/timesheets`, `/payroll`, `/payroll/runs/:id`, `/insurance-types`, `/services`, `/users`, `/clients`, `/employees`, `/scheduling`, `/files`
- Public routes: `/login`, `/pca-form/:token`, `/sign/:token`, `/schedule/view/:token`, `/schedule/confirm/:token`, `/forgot-password`, `/reset-password/:token`

**Server**: All API at `/api`. Public: `POST /auth/login`, `GET /sign/:token` (redirects to permanent link), `GET/PUT /pca-form/:token`. Admin-only routes use `requireRole('admin')`.

### React Hook Rule — Critical
All `useState`/`useCallback`/`useEffect` hooks must be declared **before** any conditional early returns (`if (authChecking) return ...`, `if (!authUser) return ...`). Violating this causes a silent blank-screen crash in production.

### Two-Tier Toolbar Pattern (GlobalToolbar + ContextBar)
Every page uses a two-tier enterprise command bar. **All new pages MUST implement this pattern.**

**Tier 1 — GlobalToolbar** (sticky top, z-index 11): System-level actions identical across pages.
- Back button (smart navigation via `useNavigationStack`)
- Page title + subtitle + icon
- Connected button group: Undo | Redo | History | Activity (Fluent UI style)
- Right group: Trash, Archive toggle, Overflow "⋯" menu

**Tier 2 — ContextBar** (sticky below Tier 1, z-index 10): Page-specific controls.
- Left: search, filters, view switchers
- Right: bulk actions, create buttons

**Required setup for any page with mutations (create/update/delete):**
```jsx
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { useUndoStack } from '../hooks/useUndoStack';

// Inside component, BEFORE any early returns:
const undoState = useUndoStack();

// After each successful mutation:
undoState.pushAction('Description of action',
    async () => { /* undo function — reverse the action */ },
    async () => { /* redo function — repeat the action */ }
);

// In JSX:
<GlobalToolbar title="Page" subtitle="..." icon={Icons.xxx} undoState={undoState} activityEntity="EntityType" />
<ContextBar>
    <ContextBar.Left>{/* filters */}</ContextBar.Left>
    <ContextBar.Right>{/* actions */}</ContextBar.Right>
</ContextBar>
```

**GlobalToolbar props:** `title`, `subtitle`, `icon`, `hideBack` (Dashboard only), `hideUndo` (Dashboard only), `undoState`, `activityEntity`, `trashConfig`, `archiveConfig`, `overflowItems`

**Undo/redo wiring rules:**
- Wire ALL mutations: create, update, delete/archive, bulk operations
- For creates: undo = delete/archive the created item
- For updates: snapshot old data before API call, undo = revert to old data
- For deletes/archives: undo = restore, redo = re-archive
- For bulk operations with batchId: undo = `api.bulkUndo*(batchId)`
- Skip permanent deletes (irreversible)

### MANDATORY: Undo / Redo / History / Activity on EVERY New Page

**Every new page added to the app MUST wire up all four command-bar features — Undo, Redo, History, and Activity — and they MUST actually work end-to-end.** This is not optional and is not "wire it and move on": before considering a page done, verify each one behaves correctly in the running app, not just that the code compiles.

The four features and how they are satisfied:

| Feature | How it's wired | How to verify it works |
|---------|----------------|------------------------|
| **Undo** | `useUndoStack()` + `undoState.pushAction(...)` after every mutation; pass `undoState` to `<GlobalToolbar>` | After a mutation the Undo button ENABLES; clicking it reverses the change in the UI **and** persists the reversal to the DB (call the reverse API inside the undo fn, then update local state) |
| **Redo** | Provide the third arg to `pushAction` (the redo fn); handled automatically by `useUndoStack` | After an Undo the Redo button ENABLES; clicking it re-applies the change in the UI and DB |
| **History** | Automatic — the History button links to `/history`; no per-page wiring beyond passing `undoState` | The connected button group renders the History link; the session's undo stack is visible in `HistoryPanel` |
| **Activity** | Pass `activityEntity="<EntityType>"` to `<GlobalToolbar>`; log audits server-side (see Audit Logging section) | The Activity button opens the drawer and shows this page's audit log entries; new mutations appear there |

**Per-page checklist (all must be true before the page is complete):**
1. `const undoState = useUndoStack();` declared BEFORE any early returns (React Hook Rule).
2. **Every** create / update / delete / archive / restore / bulk mutation calls `undoState.pushAction(description, undoFn, redoFn)` on success — no mutation left unwired.
3. Each `undoFn`/`redoFn` calls the real API to reverse/re-apply the change AND updates local component state, so the UI and DB stay in sync (see `LeadsPage.jsx` `handleMove` / `handleArchive` / `handleSave` for the canonical example).
4. `<GlobalToolbar ... undoState={undoState} activityEntity="EntityType" />` — both props passed. Only Dashboard may use `hideUndo`.
5. The controller logs `audit.logAction()` for every mutation, and the new `entityType` is added to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx` (so History filters and the Activity drawer resolve it).
6. **Manually verified in the running app**: perform a mutation → Undo enables → Undo reverses it (UI + DB) → Redo enables → Redo re-applies it. Confirm the Activity drawer shows the entries. A page whose Undo button never enables, or enables but doesn't reverse the change, is NOT done.

Common failure modes to check for:
- Undo button never enables → `pushAction` not being called (or called before the mutation succeeds).
- Undo enables but nothing happens on click → the `undoFn` updates local state but skips the reverse API call (or vice-versa), so the change doesn't actually revert.
- Activity drawer empty → controller isn't calling `audit.logAction()`, or `activityEntity` prop/`entityType` string mismatch.
- Testing on an empty list/board can make working buttons *look* broken (nothing to act on) — seed a record first before concluding it's broken.

### Data Flow
1. Frontend calls `api.js` helper → Express route → controller
2. Controller calls service layer for business logic
3. Enriched data returned to frontend; filtering/sorting done client-side

## UI Consistency — Same Data, Same Presentation

The app must feel connected, not fragmented. When the same data appears in multiple places (e.g., authorizations on the Profile tab AND the Programs tab), it MUST use:
- **Same data source** — derive from the same API response / parent prop
- **Same sort order** — always use `getAuthSortKey()` for authorization/service code ordering
- **Same filtering logic** — active/expired/archived rules must match across views
- **Same display format** — dates, units, labels rendered identically

When building or modifying any view that shows authorizations, service codes, or client data that also appears elsewhere, verify the other views match. The Profile tab's "Programs and Authorizations Overview" and the Programs tab's service cards are the canonical example — both must sort by `getAuthSortKey()` and filter expired/inactive identically.

### Consistency Rules (enforced)

| Rule | Correct Pattern | Wrong Pattern |
|------|----------------|---------------|
| Null manualStatus | `(a.manualStatus \|\| 'active') === 'active'` | `a.manualStatus === 'active'` (excludes null/undefined, hides old records) |
| Hours precision | `unitsToHours()` or `.toFixed(2)` everywhere | Mixing `.toFixed(1)` and `.toFixed(2)` on the same page |
| Date formatting | Use `formatDate()` from `utils/dates.js` for display dates | Using `fmtDate()` (produces inconsistent "M/D/YYYY" format) — migrate to `formatDate()` |
| Auth totals | Include ALL service types (PAS + Homemaker + Respite + Companion) | Omitting Companion from totals |
| Service code sort | Import `SERVICE_CODE_SORT_ORDER` from constants | Inline sort maps in page components |
| deriveServiceCode | Use shared `deriveServiceCode()` from `utils/serviceCodes.jsx` | Inline string matching in page components |
| COPE/PAS mapping | Check `serviceName` to determine PAS/Homemaker/Respite/Companion | Mapping all COPE/PAS unconditionally to one service |
| Activity lists | Server and client must have identical activity arrays | Subset lists on server (PDF export) vs full lists on client |

## DRY Principle — Centralized Constants & Functions

**All shared constants and utility functions live in `client/src/utils/`.** Never hardcode service codes, colors, activity lists, date/time formatting, or avatar logic inline. Import from the shared files.

When adding a new value (e.g., new service code), update the centralized file and all consumers automatically get it.

### Constants (`constants.js`)
| Constant | Used By |
|----------|---------|
| `AUTH_COLORS` | ProgramsAuthTab, ProfileInsuranceTab, ClientServicePage, ClientDetailPage |
| `SERVICE_COLORS` | SchedulingPage, FutureShiftsView, MonthlyCalendarView, ScheduleTab |
| `SERVICE_CODE_NAMES` | AuthorizationsPage, ProfileInsuranceTab, auth form auto-fill |
| `SERVICE_CODE_COLORS` | AuthorizationsPage badges |
| `ADL/IADL/RESPITE/COMPANION_ACTIVITIES` | PcaFormPage, TimesheetFormPage |
| `TIMESHEET_STATUS_STYLES` | EmployeeDetailPage, TimesheetsTab |
| `DAY_NAMES_SHORT/FULL/UPPER` | SchedulingPage, FutureShiftsView, ScheduleTab, PcaFormPage |
| `SERVICE_CODE_SORT_ORDER` | PayrollPage (banner + visit sorting) |
| `getAuthSortKey(code, serviceName)` | AuthorizationsPage, ProgramsAuthTab, ProfileInsuranceTab (sort order: PCS → S5130 → S5125 → waiver → COPE-PCS → COPE-HM) |
| `ACTION_COLORS` | ActivityDrawer, HistoryPage |
| `CERT_COLORS` | EmployeeDetailPage certifications |
| `PAGE_SIZE` | All paginated lists |

### Service Codes (`serviceCodes.jsx`)
| Export | Purpose |
|--------|---------|
| `SERVICE_CODE_OPTIONS` | All auth form dropdowns (via `ServiceCodeSelect`) |
| `SERVICE_CATEGORIES` | Auth form autocomplete suggestions |
| `SERVICE_NAME_SUGGESTIONS` | Service name autocomplete |
| `ServiceCodeSelect` | Shared dropdown component |
| `deriveServiceCode(name)` | Pattern-match service name → code (payroll, scheduling) |

### Account Mapping (`accountMapping.js`)
| Export | Purpose |
|--------|---------|
| `ACCOUNT_NUMBER_OPTIONS` | All account number selects |
| `getAccountForCategory(cat)` | Auto-fill account from service category |
| `getAccountForServiceCode(code)` | Auto-fill account from service code |

### Date/Time (`dates.js`, `time.js`)
| Function | File | Purpose |
|----------|------|---------|
| `formatDate(d)` | `dates.js` | "Jun 14, 2026" display format |
| `formatDateTime(d, t)` | `dates.js` | "Jun 14, 2026 at 3:00 PM" |
| `getSunday(date)` | `dates.js` | Get week-start Sunday for any date |
| `toLocalDateStr(d)` | `dates.js` | Convert Date/string to YYYY-MM-DD |
| `getWeekRange(dateStr)` | `dates.js` | Get {weekStart, weekEnd} for a date |
| `hhmm12(t)` | `time.js` | "14:30" → "2:30 PM" |
| `roundTo15(timeStr)` | `time.js` | Round time to nearest 15 minutes |
| `computeHours(in, out)` | `time.js` | Time diff in quarter-hour increments |
| `unitsToHours(units)` | `time.js` | Authorization units ÷ 4 |

### UI Helpers (`ui.js`)
| Function | Purpose |
|----------|---------|
| `getInitials(name)` | "John Smith" → "JS" |
| `getAvatarColor(name)` | Deterministic color from name hash |
| `CLIENT_COLORS` | 10-color palette for client badges/avatars |
| `getClientColor(index)` | Get color by index (wraps around) |

### Auto-Fill Behavior in Authorization Forms
When a user changes the **Service Code** dropdown:
1. `serviceName` auto-fills from `SERVICE_CODE_NAMES[code]` (if currently empty)
2. `accountNumber` auto-selects from `SERVICE_CODE_ACCOUNT_MAP[code]` (if not manually set)

When a user changes the **Service Category** (autocomplete):
1. `accountNumber` auto-selects from `CATEGORY_ACCOUNT_MAP[category]` (if not manually set)

This behavior is implemented via `handleServiceCodeChange` and `handleServiceCategoryChange` in both AuthorizationsPage and ClientCreationWizard.

## Single Source of Truth — Client + Authorization

The **Client** and **Authorization** tables are the single source of truth for the entire system. All operational modules (Timesheets, Scheduling, Payroll) read from Authorization at query time.

**Key rules:**
- **`accountNumber` and `sandataClientId` are owned by the Authorization and resolved LIVE for every shift — the `Shift.account_number` / `Shift.sandata_client_id` columns are dormant (never read or written for display).** New shifts store `''` for both; they are NOT accepted from create/update/bulk request bodies, and there is no auth→shift propagation. To change either value, edit it on the client's authorization (client-details page) — that is the single place.
- **Resolution** lives in `server/src/lib/sandataResolver.js` (`buildLiveSandataMap` → `resolveShiftAccountNumber` then `resolveShiftSandataId`). Account is derived first by `clientId|serviceCode` (fallback `name|serviceCode`); the Sandata ID is then derived by `clientId|derivedAccount` (fallbacks `clientId|serviceCode`, `name|serviceCode`). There is **no fallback to the shift's stored value** — unresolvable → `''` (renders `—`). Server surfaces enrich shifts via `enrichShiftLive(shift, maps)` in `schedulingService.js` (used by `listShifts` and the shared schedule view); never render the raw `shift.sandataClientId` / `shift.accountNumber`.
- The Scheduling page shows both values **read-only** (with a copy button + info tooltip pointing to the client's authorization). `server/prisma/fix-shift-sandata-ids.js` remains as a one-time historical cleanup of the now-dormant stored column; it is not part of the live path.
- The admin timesheet form auto-expands `enabledServices` from active authorizations (not just the stored client field)
- The PCA form PUT handler also auto-expands `enabledServices` from authorizations (prevents Respite/Companion data from being zeroed on save)
- Archiving an authorization logs the count of affected shifts in the audit trail

### Multi-Auth Program Codes (COPE, PAS)
Program codes (`COPE`, `PAS`) allow **multiple active authorizations** with different `serviceName` values (e.g., COPE/Personal Care Services + COPE/Homemaker). This is enforced at multiple levels:
- **`deactivatePreviousAuths`** in `authorizationController.js` filters by both `serviceCode` AND `serviceName` for `MULTI_AUTH_CODES`
- **`filterAuthsByWeek`** in `authorizationService.js` deduplicates by `serviceCode|serviceName` composite key for program codes
- **`dedupAuthorizations`** groups by `clientId|serviceCode|serviceName` for program codes
- **Programs tab** (`ProgramsAuthTab.jsx`) renders separate cards per `serviceCode::serviceName`
- **Client detail badges** use composite keys to show distinct badges (e.g., "COPE - Homemaker", "COPE - Personal Care Services")

## Data Model
- **Agency** — one row per tenant (`name`, `slug` unique, `status` active/suspended, `settings` JSON). Every tenant table carries a required `agency_id` FK (cascade delete) enforced by Postgres RLS `tenant_isolation` policies; `User.agencyId` is the exception (nullable, since `superadmin` accounts are platform-level and belong to no agency). Managed via the `/platform` console (superadmin-only).
- **Users** — staff accounts (superadmin/admin/user/pca roles), `active` boolean, `archivedAt` soft delete
- **Employees** — caregivers with optional `userId` link, schedule links
- **Clients** — care recipients with Medicaid ID, insurance type, `enabledServices` JSON
- **Authorizations** — per client (PCS, SDPC, S5130, S5150, etc.) with start/end dates and `authorizedUnits` (15-min units, not hours)
- **Timesheets** — weekly records; status `draft`/`submitted`; signatures stored as JSON
- **TimesheetEntries** — daily ADL/IADL/Respite/Companion logs (JSON activities), time in/out, hours, timeBlocks for multiple shifts
- **SigningTokens** — legacy one-time-use tokens; `/sign/:token` now auto-resolves to a permanent link
- **PermanentLinks** — reusable links per client+PCA pair
- **InsuranceTypes / Services** — reference data
- **PayrollRun** — uploaded XLSX processing run with status, totals, and `authorizationSnapshot`
- **PayrollVisit** — individual visit record within a run; see payroll section below
- **Shifts** — scheduled shifts with client, employee, service code, date/time
- **AuditLog** — tracks all CRUD operations with field-level diffs
- **EmployeeScheduleLink** — per-employee tokens for viewing their schedule
- **ScheduleNotification** — email/SMS delivery tracking for schedules (tracks opened, response)
- **AdminFolder** — hierarchical folder structure (self-referencing parentId, materialized path)
- **AdminFile** — file records with `storageKey` pointing to Railway Bucket / local filesystem

All FK relationships use cascade delete. Prisma schema uses `@@map` for snake_case table/column names.

## Audit Logging
`auditService.js` provides fire-and-forget audit logging:
- `audit.logAction(userId, userName, userRole, action, entityType, entityId, entityName, changes, metadata)` — never awaited
- `audit.diffFields(oldObj, newObj, fields)` — returns array of `{field, oldValue, newValue}` for UPDATE actions
- Actions: CREATE, UPDATE, DELETE, ARCHIVE, RESTORE, SUBMIT, PERMANENT_DELETE, BULK_DELETE, TOGGLE_ACTIVE, RESET_PASSWORD
- All controllers call `audit.logAction()` for every mutation
- Frontend: `ActivityButton` (page-level) and `EntityActivityButton` (entity-level) in `ActivityDrawer.jsx`
- **History Page** (`HistoryPage.jsx`): shows all audit logs with filters by action, entity type, and date range. Entity types: Client, Employee, User, Shift, Timesheet, Authorization, PayrollRun, PermanentLink, InsuranceType, Service, Task, Receipt

### Audit Logging — Required for All New Features
**Every new page or feature that performs mutations MUST log audit events.** This ensures the History page always reflects all system activity. When adding a new feature:
1. Import `audit` from `../services/auditService` in the controller
2. Call `audit.logAction()` for every CREATE, UPDATE, DELETE, ARCHIVE, RESTORE, or SUBMIT action
3. If the feature introduces a new `entityType`, add it to the `ENTITY_TYPES` array in `client/src/pages/HistoryPage.jsx`
4. Use `metadata` field for contextual details (e.g., `{ action: 'onboarding_invite_sent' }`)
5. For public endpoints (no `req.user`), use `userId: 0` and the entity name as `userName`

## Payroll Module

### Import Pipeline (`payrollController.js` + `payrollService.js`)
Every non-blank row in the uploaded XLSX is saved — nothing is silently dropped. Rows with missing or suspect data are flagged `needsReview = true` with a `reviewReason` string (comma-separated: `missingClient`, `missingEmployee`, `numericEmployee`, `missingDate`, `missingCallIn`, `missingCallOut`).

**EVV split-row merge**: consecutive rows where row A has callIn/no callOut and row B has callOut/no callIn (same client+date) are merged into one row before processing.

`needsReview` rows bypass the unit calculation pipeline but still parse and store clock-in/clock-out times (via `parseTimeToMinutes` → `minutesToHHMM`). They appear in the **Needs Review** tab in the UI for admin correction.

### Processing Pipeline (service layer)
`applyTimeRules` → `calcUnits` → `detectOverlaps` → `applyDailyCap` → `applyAuthCap`

Key constants: `CLIP_START = 04:30`, `CLIP_END = 23:30`, `OVERNIGHT_VOID = 01:00`, `MAX_UNITS = 28` (7 hrs × 4 units/hr).

### PATCH `/api/payroll/visits/:id`
Accepts `finalPayableUnits`, `notes`, `clientName`, `employeeName`, `visitDate`, `callInTime`, `callOutTime`. When time fields change, re-runs `applyTimeRules` + `calcUnits` server-side. Always re-evaluates `needsReview`/`reviewReason` and recomputes `totalPayable` on the parent run.

### Payroll UI
`PayrollRunDetail` has two tabs:
- **All Visits** — excludes `needsReview` rows; shows void/overlap/incomplete legend
- **Needs Review** — only `needsReview` rows with purple highlight; count badge on tab

Inline editors: `PayrollEditableText` (client, employee, times), `PayrollEditableUnits`, `PayrollEditableNotes`. All wrapped in `React.memo` for performance. Search input uses 300ms debounce to prevent lag.

`PayrollClientGroup` receives `authMap` (from `getPayrollRun` response) keyed by `normalizeName(clientName)` → `{ serviceCode → authorizedUnits }`. The banner is **authorization-driven**: it starts from the master sheet authorizations (showing all service codes the client is authorized for), then matches reported units from ALL visits regardless of status (Verified, Incomplete, In Process — all count). Units colored **green** (reported ≥ authorized) or **red** (reported < authorized). When a visit has no `serviceCode`, it derives the code from the `service` name using `deriveServiceCode()` (client-side mirror of `SERVICE_CODE_RULES`). Banner service codes are sorted: `PCS → S5125 → S5130 → S5150 → S5135 → SDPC`.

`PayrollEditableText` accepts an optional `displayValue` prop — shown in read mode while `value` (raw) is used in edit mode (e.g. `hhmm12()` formatted display vs. raw `HH:MM` editing).

`getPayrollRun` enriches the run response with `authMap` by fetching all clients+authorizations and building the normalized lookup. Uses `normalizeName` from `payrollService` which lowercases, strips non-alphanumeric, and sorts words — so "Smith, John" matches "John Smith".

### Payroll Visit Sort Order
Within each `PayrollClientGroup`, visits are sorted by **service group first, then date, then time-in**:
1. **PCS** (Personal Care Services)
2. **S5125/S5130** (Attendant Care + Homemaker — interleaved by date, they pair on the same day in EVV)
3. **S5150** (Respite)
4. **S5135** (Companion)
5. **SDPC** (Self Directed Personal Care)

**No-service/incomplete rows**: attach to the service group that has the most entries on the same date. If no same-date match exists, defaults to PCS (group 0). This keeps incomplete rows in date order within their most likely service group rather than pushing them to the bottom.

Client groups themselves are sorted alphabetically, with unknown/numeric names at the bottom.

## Sidebar
Collapsible: `256px` expanded → `52px` collapsed. State persisted in `localStorage('sidebarCollapsed')`. The `<aside>` element must **not** have an inline `style={{ position: 'relative' }}` — that overrides CSS `position: fixed` and breaks the layout gap. The collapse toggle button uses `position: fixed` tied to `--sidebar-width`/`--sidebar-collapsed-width` CSS variables.

## Inline Editing — `InlineEditable` (safe click-to-edit)

`client/src/components/common/InlineEditable.jsx` is the **single, mandatory primitive for all inline cell/field editing** (editing a value in place, without opening a modal or form). It exists to prevent accidental data loss: the old copy-pasted pattern let a single stray click open edit mode and a blur silently save. **Never hand-roll a click-to-edit `<input>`/`<textarea>` with `onBlur`-to-save — route it through `InlineEditable`.**

### Guaranteed safe behavior
- **Opens only via an explicit affordance** — read mode shows the value plus a pencil icon that appears on hover (and is keyboard-focusable). Clicking the value text does nothing; only the pencil opens edit mode.
- **Explicit confirm, blur cancels** — edit mode shows the input with ✓ (save) and ✕ (cancel). **Enter / ✓ save; Escape / ✕ / clicking away (blur) CANCEL.** There is no silent auto-save. (The ✓/✕ buttons use `onMouseDown` + `preventDefault` so they win the race against the input's blur.)
- **Empty-guard** — a blank value is blocked (✓ disabled + inline reason) unless `allowEmpty`. `type="number"` enforces `min`/`max`. Pass a custom `validate` to override.
- **Notice + undo** — on a successful save it fires a success toast; if `undoState` + `buildUndo` are supplied it pushes an undo entry onto the page's undo stack.
- **Re-entrancy guarded** — a rapid double-Enter can't fire two saves.

### Error contract — CRITICAL
`InlineEditable` detects a failed save by the **`onSave` promise rejecting**. Your `onSave` handler must let API errors **propagate** (throw / reject) — do **not** `try/catch` and swallow them. A handler that catches its own error and returns normally makes a *failed* save show a *success* toast and silently drop the change. If a handler needs its own error toast, it must **rethrow** after showing it (and drop any success toast of its own, since `InlineEditable` owns the success notification — otherwise you get a double toast).

### Interface
```jsx
<InlineEditable
  value={row.employeeName}          // current value (string)
  displayValue={hhmm12(value)}      // optional formatted read-mode display; falls back to value
  placeholder="Employee"
  type="text"                        // 'text' | 'number'
  multiline={false}                  // true → <textarea> (Shift+Enter = newline, Enter = save)
  min={0} max={112}                  // number bounds (type='number')
  allowEmpty={false}                 // true → blank is a valid save
  validate={(v) => v ? null : 'Required'}  // return error string or null; overrides default guard
  onSave={async (v) => { /* API call — MUST let errors reject */ }}
  undoState={undoState}              // optional: from useUndoStack, wires undo
  buildUndo={(prev, next, result) => ({ description, undo, redo })}  // optional undo entry
  undoLabel="employee name"          // used in the success toast ("Updated employee name")
  width={130}                        // read + edit width
  highlight={false}                  // purple-accent styling for flagged values
  readOnly={false}                   // render plain value, no affordance
/>
```

**Canonical usages** (all migrated to this component): `PayrollEditableText` / `PayrollEditableUnits` / `PayrollEditableNotes` in `PayrollPage.jsx`, `EditableField` in `client-tabs/CarePlanTab.jsx`, and the Client-ID field in `client-tabs/ProgramsAuthTab.jsx`. Tests: `client/src/__tests__/InlineEditable.test.jsx`.

## UI Design System — Tables

All tables use the `.data-table` class system. **Every new table MUST follow this pattern.**

### Table Variants
| Class | Use Case | Header Style |
|-------|----------|-------------|
| `.data-table` | Default | Light background, muted text |
| `.data-table--sheet` | Master sheet pages (Authorizations, Clients list) | Dark navy sticky header |
| `.data-table--dark-header` | Same as sheet but with gradient | Dark gradient background |
| `.data-table--compact` | Drawers, inline detail panels | No background, smaller padding |

### Required Table Structure
```html
<div class="table-scroll">
  <table class="data-table data-table--dark-header">
    <thead>
      <tr>
        <th scope="col">Column Name</th>
        ...
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Cell value</td>
        ...
      </tr>
    </tbody>
  </table>
</div>
```

### Table Design Rules
- **Vertical dividers between header columns** — All variants include `border-right: 1px solid` on `<th>` (last column excluded). Dark headers use `hsl(230 20% 30%)`, light headers use `hsl(var(--border))`.
- **Horizontal row separators** — `border-bottom: 1px solid hsl(var(--border))` on `<td>`, last row excluded.
- **Row hover** — `background: hsl(var(--primary) / 0.04)` on tbody `tr:hover`.
- **Sticky headers** — Sheet variant uses `position: sticky; top: 0; z-index: 2`.
- **Sort indicators** — Use `.th-content` wrapper with `.th-sort` icon inside `<th>`.
- **Text styling** — Headers: 11px, uppercase, 600 weight, 0.06em letter-spacing. Cells: 14px normal.
- **No wrapping** — Sheet/dark headers use `white-space: nowrap` on both `<th>` and `<td>`.
- **Padding** — Standard: 12px 16px. Compact: 6px 8px.

### When to Use Each Variant
- **Main list pages** (Authorizations, Employees, Timesheets list): `data-table--sheet` or `data-table--dark-header`
- **Drawer/modal content** (auth detail, employee certs): `data-table--compact`
- **Settings pages** (Insurance Types, Services): `data-table` (default)

## File Preview & Thumbnails — Reusable Components

**Any feature that previews, thumbnails, or lists a file (PDF or image) MUST reuse these components. Do NOT re-implement `window.open`/`<iframe>` previews, ad-hoc download links, or bespoke thumbnail logic.** They are the single source of truth for the in-app document experience and are already used by the File Manager (`/files`) and employee certifications.

All of them take a **`fetchBlob` function** (not a URL): `() => Promise<Response>` — a raw `fetch` Response the component reads `Content-Type` / `Content-Length` / `.blob()` from. This keeps them auth-agnostic and endpoint-agnostic; each caller passes its own authorized download call (e.g. `() => fetch(url, { headers: { Authorization: \`Bearer ${api.getToken()}\` } })` or an `api.downloadX(id)` helper that returns a `Response`).

| Component / util | File | Purpose |
|------------------|------|---------|
| `PreviewModal` | `common/PreviewModal.jsx` | Full-screen in-app **document viewer**. Portals to `<body>`; renders `DocViewer` internally for the actual PDF/image rendering, plus its own modal chrome (backdrop, Esc/←/→ close/page handling, optional delete). Unpreviewable/oversized → download fallback. |
| `DocViewer` | `common/DocViewer.jsx` | The **single rendering engine** for PDFs/images — both `PreviewModal` (full-screen) and `FilePreviewPane` (docked) render it; never duplicate pdf.js/image rendering elsewhere. Props: `{ fileName, fetchBlob, maxBytes?, showToolbar?, extraToolbarActions? }`. PDFs render via **pdf.js multi-page canvas**, images via `<img>`. Toolbar (when `showToolbar`): zoom −/reset/+, fit-to-width, page ‹ n/total ›, rotate, download, print. `extraToolbarActions` lets a host inject buttons (e.g. "Expand" in the docked pane). |
| `FilePreviewPane` | `common/FilePreviewPane.jsx` | **Docked** split-view alternative to the full-screen `PreviewModal` — a file list on the left, `DocViewer` rendering the selected file on the right. Props: `{ items, selectedId, onSelect, open, onExpand, onDownload, emptyText }`. Item shape: `{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }`. The **Preview toggle lives in the host page's toolbar** (not inside the component) — the host owns `open`/`selectedId` state. Uses `useIsWide(900)` to auto-collapse to modal-only (call `onExpand` instead of docking) on narrow screens, so it degrades gracefully without separate mobile logic. |
| `useIsWide` | `hooks/useIsWide.js` | `(minWidth)` → boolean, tracks `window.innerWidth >= minWidth` via a resize listener. Backs `FilePreviewPane`'s docked/modal-only breakpoint; reusable anywhere a component needs a live viewport-width gate. |
| `FileThumbnail` | `common/FileThumbnail.jsx` | Inline file thumbnail button (lazy via IntersectionObserver). Renders a first-page PDF / image thumbnail, or a type icon fallback. Hover shows an enlarged **popover portalled to `<body>`** (`position: fixed`, viewport-clamped) so no panel/overflow can clip it (`z-index: 2000`). |
| `FileThumbnailStrip` | `common/FileThumbnailStrip.jsx` | A row of `FileThumbnail`s with a `+N` overflow gallery. |
| `CertFileRow` | `files/CertFileRow.jsx` | A **file row** styled like the File Manager list (`.file-row`): thumbnail · name · meta line · Preview + Download. Used for both a current file and history items. Optional `fetchBlob`/`cacheKey`/`badge`/`expiresText`. |
| `FileRow` | `files/FileRow.jsx` | The File Manager list row (checkbox · thumbnail · name · meta · actions). Reuse for file lists; use `CertFileRow` for lighter, badge-carrying rows. |
| `CertViewerPanel` | `common/CertViewerPanel.jsx` | **Persistent** (non-modal) DocViewer panel used as the right-hand column of a two-column "certification portfolio" layout — header, a file-bar (filename + status badge), and `DocViewer` underneath. Props: `{ fileName, fetchBlob, status?, statusClass?, onHistory?, onReplace?, emptyText? }`; `onHistory`/`onReplace` are injected into `DocViewer` via `extraToolbarActions`. Renders an empty state when `fetchBlob` is falsy (nothing selected yet). |
| `CertCard` | `employee/CertCard.jsx` | A selectable card for one certification in the portfolio's cards grid: icon, status badge, expiry date + days-remaining, a status-colored progress bar (via `progressForCert`), and View/Upload/Replace actions. Props: `{ label, icon, colors, status, statusLabel, days, expDate, renewalLabel, hasFile, selected, onSelect, onView, onUpload }`. |
| `progressForCert` | `utils/certProgress.js` | `({ status, days, renewalYears, hasFile }) → { pct, variant }` — pure function computing a `CertCard`'s progress-bar fill percent and color variant (`expired`/`expiring`/`active`/`complete`/`notset`). Route any cert progress-bar math through this instead of re-deriving inline. |
| `useFileThumbnail` | `hooks/useFileThumbnail.js` | `(cacheKey, fetchBlob, mimeType, { enabled, maxPdfBytes })` → `{ status, thumbUrl }`. LRU-cached, lazy. Backs `FileThumbnail`. |
| `renderPdfFirstPage` / `loadPdfDocument` / `getPdfjs` | `lib/pdfThumbnail.js` | pdf.js helpers: first-page thumbnail dataURL; open a doc for the viewer; shared worker setup. **Always** go through these so the pdf.js worker is configured once. |
| `getFileTypeInfo` / `FileTypeIcon` / `formatFileSize` / `formatUploadDate` | `files/fileTypeUtils.jsx` | File-type label/icon and size/date formatters used by the rows. |

### Usage

```jsx
import PreviewModal from '../components/common/PreviewModal';
import * as api from '../api';

const [preview, setPreview] = useState(null);
// ...
{preview && (
  <PreviewModal
    open
    fileName={preview.name}
    fetchBlob={() => fetch(`/api/files/${preview.id}/download`, { headers: { Authorization: `Bearer ${api.getToken()}` } })}
    onClose={() => setPreview(null)}
    onDelete={() => { const f = preview; setPreview(null); handleDelete(f); }}  // optional — shows the Delete tool
  />
)}
```

`CertFileRow` for a list of files:

```jsx
<div className="cert-history__list">
  {files.map(f => (
    <CertFileRow key={f.id} upload={f} onPreview={setPreview} onDownload={handleDownload}
      fetchBlob={() => api.downloadX(f.id)} cacheKey={`x:${f.id}`} />
  ))}
</div>
```

### Rules
- **`DocViewer` is the only rendering engine for previewing a file in-app** (never open files in a new tab or embed a bare `<iframe>` for preview) — route through either `PreviewModal` (full-screen) or `FilePreviewPane` (docked), which both render `DocViewer`. Don't duplicate pdf.js/image rendering in a new component.
- Prefer `PreviewModal` for a single ad-hoc preview action; use `FilePreviewPane` when a page wants a persistent, dockable split-view (list + preview side by side) with a toolbar toggle — see `FilesPage.jsx` and the certifications tab for reference usage.
- **Two-column "certification portfolio" pattern** (`CertificationsTab` in `EmployeeDetailPage.jsx`): a cards grid (`CertCard`, one per certification) on the left plus a persistent `CertViewerPanel` on the right. The viewer column is only rendered on wide viewports — gated by `useIsWide(1024)` — and collapses to the existing full-screen `PreviewModal` on narrow screens (single-column card list; tapping a card opens the modal instead of docking). Each `CertCard`'s progress bar is driven by `progressForCert()` from `utils/certProgress.js`, never ad-hoc math.
- Pass `onDelete` only where deletion is supported (it renders the Delete tool and should trigger the caller's existing confirm flow).
- Thumbnails/previews are **lazy** and **cached** (`useFileThumbnail`) — reuse a stable `cacheKey` per file (`file:{id}`, `cert-upload:{id}`, `cert:{id}`).
- PDF rendering must go through `lib/pdfThumbnail.js` (shared worker). The pdf.js bundle is code-split (`pdf-*.js`) — don't import `pdfjs-dist` directly elsewhere.
- Row/list markup reuses `.file-row` / `.file-row--cert` / `.cert-history__list` classes for a consistent look across the app.

## Conventions
- All API routes under `/api`; admin-only routes use `requireRole('admin')` middleware
- Pagination: 25 rows per page; page state resets on filter change
- Toast notifications auto-dismiss after 3 seconds
- Authorization renewal reminder windows: PCS = 60 days, SDPC = 30 days, TIMESHEETS = 15 days, default = 30 days
- Time values in `PayrollVisit` are stored as `HH:MM` 24-hour strings (`callInTime`, `callOutTime`); use `hhmm12()` for display only
- Service code mapping is defined in `SERVICE_CODE_RULES` array in `payrollService.js` — order matters (first match wins)
- Authorization units are stored as 15-minute units (not hours). 1 hour = 4 units.
- Client addresses on schedule pages are Google Maps hyperlinks
- **Design System**: See `docs/superpowers/specs/2026-06-01-design-system-design.md` for color tokens, component patterns, spacing, and UI conventions. Agents must read this before any frontend work.

## PHI Encryption at Rest & Timesheet Integrity

- **Encrypted PHI fields** (AES-256-GCM, `ENCRYPTION_KEY`): `Client.medicaidId/dob/notes/pcaNotes`, `Employee.dob/notes`, `HospitalVisit.providerName/location/purpose/notes` — plus the pre-existing SSN/EIN on payroll profiles.
- **Transparent crypto layer**: `server/src/lib/prisma.js` is a Prisma client extension that encrypts PHI on write and deep-decrypts query results (incl. nested includes). Field list lives in `server/src/lib/phiCrypto.js` (`PHI_FIELDS`). `server/src/lib/prismaBase.js` is the raw client — use it ONLY where ciphertext must stay as-is (backup export uses raw SQL and emits ciphertext by design; the encrypt-phi migration script).
- **Rules**: encrypted fields must never appear in Prisma `where`/`orderBy`/`@unique`; `dob` columns are `YYYY-MM-DD` **strings**, not DateTime; audit diffs of PHI fields must be wrapped in `audit.redactChanges(changes, fields)` so plaintext never lands in AuditLog.
- **One-time data migration**: `npm run db:encrypt-phi` (idempotent — skips already-encrypted rows by format).
- **Timesheet signature integrity**: `server/src/services/timesheetIntegrityService.js` stores an HMAC-SHA256 (`INTEGRITY_KEY`) over the persisted signed payload at submit. The hash is bound to the signing event: PCA-form submits always recompute; admin re-submits only recompute when the PCA/recipient signatures changed. `integrityStatus` (`valid`/`tampered`/`unsigned`) is returned on timesheet GET/list, shown in `TimesheetFormPage`, and printed on the PDF export. Any new code path that mutates timesheet entries or signatures must keep this rule intact.

## Database & Backup
- **Database**: PostgreSQL (migrated from SQLite, April 2026)
- **Local dev**: Postgres.app or Docker (`postgresql://mac@localhost:5432/nvbestpca`)
- **Production**: Railway managed PostgreSQL with automatic daily backups
- **On-demand backup**: `GET /api/backup/export` (admin-only) — downloads all tables as JSON. Dashboard has a "Backup" button.
- **Seed script**: `seed.js` only creates admin if none exists (never overwrites). Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars with fallback defaults.
- **Data migration**: `prisma/migrate-data.js` transfers data from SQLite `dev.db` to PostgreSQL (one-time use, requires `better-sqlite3` devDependency)

## Unit Test Environment (`server/jest.setup.js` + `jest.globalSetup.js`)
`npm test` runs against a dedicated `nvbestpca_authlifecycle_test` Postgres database — never the dev DB — and is fully reproducible from a cold checkout:
- **Auto-provisioning**: `jest.globalSetup.js` runs once before any test worker starts. It resolves the target DB URL (from `server/.env.test` if present, else the hardcoded `nvbestpca_authlifecycle_test` fallback), runs `createdb` (no-op if it already exists), then `prisma migrate deploy`, then `node prisma/seed.js` (idempotent — creates the default agency + an `admin`-role user only if missing; several suites, e.g. `permissionGroupController.test.js`, assume an admin user exists). No manual `createdb`/`migrate`/`seed` step is required — `npm test` on a brand-new clone provisions everything itself.
- **`.env.test` override**: copy `server/.env.test.example` → `server/.env.test` (gitignored) to point at a different DB or override the keys below. `jest.setup.js` refuses to run if the resolved `DATABASE_URL` doesn't end in `_test` (guards against ever touching dev/prod data).
- **`ENCRYPTION_KEY` / `INTEGRITY_KEY` defaults**: `jest.setup.js` defaults both to fixed dev values (`'e'.repeat(64)` / `'f'.repeat(64)`) when not set via `.env.test`, mirroring `src/__integration__/setupEnv.js` — so PHI-field writes and signed-timesheet tests work out of the box with no key setup.
- **`TZ=UTC` requirement unchanged**: the `test` npm script sets it; `jest.setup.js` throws if the effective timezone isn't UTC (date-assertion drift otherwise). Prefix `TZ=UTC` on any direct `npx jest` invocation.
- Integration tests (`npm run test:integration`) are a separate, unaffected harness against `nvbestpca_test` — see `src/__integration__/globalSetup.js` / `setupEnv.js`, which this unit-test setup mirrors.

## Admin File Manager

Full-featured file management system for administrative documents (insurance, eligibility, contracts).

- **Route**: `/files` (admin-only, sidebar footer)
- **Frontend**: `FilesPage.jsx` — custom grid with breadcrumbs, checkbox multi-select, upload, rename, delete, preview (opens in new tab), download
- **Backend**: `fileManagerController.js` — CRUD for `AdminFolder` + `AdminFile` models
- **Storage**: Railway Bucket (S3-compatible via `@aws-sdk/client-s3`). Local dev falls back to `server/uploads/admin-files/` filesystem. Controlled by `storageService.js`.
- **Env vars**: `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` (auto-injected by Railway bucket connection)
- **Default folders**: Insurance/ (Medicaid, UnitedHealth, BCBS, Aetna) and Eligibility/ (Active, Pending, Expired) — seeded on first deploy
- **Duplicate handling**: Upload conflict modal with "Keep Both" (auto-rename) or "Replace" options
- **Export**: "Export All Files" in overflow menu — streams all files as zip via `archiver`
- **Audit**: All operations logged as `entityType: 'AdminFile'`

## Deployment (Railway)
- Single service: Express serves the React build from `client/dist`
- Start command: `prisma migrate deploy` → `setup-app-role.js` → `seed.js` → `node src/index.js`
- **Storage Bucket**: Create bucket on Railway canvas → Connect to service → env vars auto-injected
- Environment variables: `DATABASE_URL` (PostgreSQL, owner connection used by `lib/prisma.js`), `JWT_SECRET`, `PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `ENCRYPTION_KEY` (64 hex chars — PHI-at-rest encryption; losing it makes encrypted PHI unrecoverable, including in backups), `INTEGRITY_KEY` (64 hex chars — timesheet signature HMAC; falls back to a key derived from `ENCRYPTION_KEY`)
- **Multi-tenancy env vars**:
  - `BASE_DOMAIN` — the root domain agencies are subdomained under (e.g. `pcalink.com`); drives `resolveAgency.js` subdomain parsing, CORS origin matching (`lib/corsOrigin.js`), and socket auth. Defaults to `localhost` for local dev.
  - `APP_DATABASE_URL` — connection string for the RLS-constrained `app_user` role that `tenantClient()` uses for all tenant-scoped queries; falls back to `DATABASE_URL` if unset (fine locally before `setup-app-role.js` has run, unsafe in production — always set it on Railway).
  - `APP_DB_PASSWORD` — password `setup-app-role.js` assigns to the `app_user` Postgres role (`NOBYPASSRLS`); must match the credential embedded in `APP_DATABASE_URL`.
  - `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` — platform-console login, synced by `seed.js` on **every** boot (not just first-create): if a superadmin row exists, its email + password hash are overwritten to match whatever these env vars currently hold (only the vars that are set — an unset var leaves that field untouched). Rotation = edit the env var + restart, no manual DB work. Production refuses to create a default-credential superadmin if `SUPERADMIN_PASSWORD` is unset on first boot — set both before first deploy.
  - `NVBEST_AGENCY_NAME` / `NVBEST_AGENCY_SLUG` — only apply on a fresh DB via `seed.js` (agency #1 is otherwise created with static values inside migration 1, since migrations can't read env vars). The agency's name is editable afterward from the platform console via `PATCH /api/platform/agencies/:id` (superadmin-only; the slug is immutable).
- **Railway wildcard-domain requirement**: subdomain routing (`acme.<BASE_DOMAIN>`) needs a wildcard custom domain (`*.<BASE_DOMAIN>`) added on the Railway service plus a wildcard CNAME at the DNS provider pointing to Railway. This wildcard also covers the reserved `admin.<BASE_DOMAIN>` platform-console host — no separate DNS entry needed. Until the wildcard is provisioned, agencies without a working wildcard entry fall back to being reached via their exact per-agency custom domain (added individually on the Railway service) — `resolveAgency.js` matches on whatever `Host` header actually arrives, so either path works as long as the agency's slug/domain resolves to this service.

## Service Code System — Cross-Entity Trace

Service codes are the connective tissue of the app. A change to service codes must be traced through every layer.

> **Runtime source of truth**: the DB `Service` table (managed via the `/services` page) is the RUNTIME SOURCE OF TRUTH for service **name, label, account number, color, timesheetSection, sortOrder, and enforceAuthLimit**. The constants in `client/src/utils/serviceCodes.jsx`, `client/src/utils/constants.js`, `client/src/utils/accountMapping.js`, and the server's `server/src/lib/serviceDefaults.js` are FALLBACK DEFAULTS ONLY — used to seed the DB and as a safety net when a code has no DB row. They are merged UNDER live DB values by `server/src/services/serviceRegistry.js` (server) and the `useServices()` hook / `ServicesProvider` (`client/src/hooks/useServices.jsx`) on the client. To change a service's display name, color, account, timesheet section, or whether it enforces authorization limits, edit it on the `/services` page — do not edit the frontend/backend constant files for that purpose. Only edit the constants files when adding a brand-new service code (see Impact Checklist below) or changing the pre-DB fallback behavior.

### Canonical Service Codes
**EVV Services**: `PCS`, `S5120`, `S5125`, `S5130`, `S5135`, `S5150`, `SDPC`
**Timesheet Services**: `TIMESHEET_PCS`, `TIMESHEET_HOMEMAKER`, `TIMESHEET_RESPITE`, `TIMESHEET_COMPANION`, `TIMESHEET_CHORE`
**Programs**: `COPE`, `PAS`

### Where Service Codes Live (must stay in sync)
| Location | Purpose |
|----------|---------|
| **DB `Service` table** (via `/services` page, `serviceController.js`) | **Runtime source of truth** for name/label/account/color/timesheetSection/sortOrder/enforceAuthLimit per code |
| `server/src/services/serviceRegistry.js` → `getServiceMap()`/`getServiceMapSync()`/`invalidate()`/`deriveTimesheetSection()`/`sectionEnforcesLimit()` | Cached DB-over-defaults registry; single place server code reads service metadata from. `invalidate()` clears cache after CRUD writes. `deriveTimesheetSection(code, serviceName)` maps an auth to a PCA-form section; `sectionEnforcesLimit(section)` gates whether that section's hours are capped by authorized units |
| `server/src/lib/serviceDefaults.js` → `SERVICE_DEFAULTS`, `getDefault()` | **Fallback defaults only** — merged under DB values by `serviceRegistry`; also used to seed the DB |
| `client/src/hooks/useServices.jsx` → `ServicesProvider`, `useServices()` | Cached DB-over-constants registry on the client; single place frontend code reads service metadata from (`serviceMeta`, `serviceOptions`, `serviceName`, `serviceColor`, `accountForCode`, `sortKey`, `refetch`) |
| `server/src/controllers/authorizationController.js` → `VALID_SERVICE_CODES` | Server-side validation of allowed codes (registry-backed) |
| `server/src/services/authorizationService.js` → `REMINDER_WINDOWS`, `RENEWAL_COLORS` | Expiry reminder config per code (unchanged — not part of the Service table migration) |
| `server/prisma/seed-services.js` | Reference data seeder — imports `SERVICE_DEFAULTS` from `serviceDefaults.js` (not a local `DEFAULT_SERVICES` constant) and creates any DB `Service` rows that don't already exist (create-missing-only; never overwrites existing rows) |
| `server/src/lib/timesheetUtils.js` → `deriveTimesheetService()` | Legacy hardcoded auth code → timesheet section mapping; superseded at runtime by `serviceRegistry.deriveTimesheetSection()`, which is DB-aware and falls back to the same logic |
| `server/src/controllers/pcaFormController.js` | Gates the PCA-form authorized-hours ceiling per section using `serviceRegistry.sectionEnforcesLimit('PAS'|'Homemaker'|'Respite'|...)` — sections whose codes have `enforceAuthLimit: false` (e.g. private Timesheets codes) are not capped |
| `client/src/utils/serviceCodes.jsx` → `SERVICE_CODE_OPTIONS` | Fallback dropdown options; merged under DB via `useServices()` |
| `client/src/utils/constants.js` → `AUTH_COLORS`, `SERVICE_CODE_NAMES` | Fallback display colors/names; merged under DB via `useServices()` |
| `client/src/utils/accountMapping.js` → `SERVICE_CODE_ACCOUNT_MAP` | Fallback service code → account number auto-fill; merged under DB via `useServices()` |
| `server/src/services/payrollService.js` → `SERVICE_CODE_RULES` | Maps EVV service names → codes for payroll |
| `server/src/controllers/authorizationController.js` → `MULTI_AUTH_CODES` | Program codes allowing multiple active auths (COPE, PAS) |
| `client/src/utils/constants.js` → `getAuthSortKey()` | **Single source** for auth display sort order across all pages |

### Entity Relationship Flow
```
Client
 ├── Authorizations (serviceCode, units, dates)
 │     ↓ derives enabledServices on client record
 │     ↓ feeds authLimits into PCA form
 │     ↓ feeds authMap into payroll verification
 ├── Timesheets (linked via PermanentLink → client+PCA pair)
 │     ├── TimesheetEntries (ADL/IADL/Respite/Companion hours per day)
 │     └── totalPasHours, totalHmHours, totalRespiteHours, totalCompanionHours
 ├── Shifts (scheduled: client + employee + serviceCode + date/time)
 │     ↓ bulk edit applies service code + times
 │     ↓ generates schedule views for employees
 └── PayrollVisits (imported from EVV, matched to client by name)
       ↓ service code drives unit caps from authorizations

Employee
 ├── Shifts (assigned via scheduling)
 ├── Timesheets (as PCA/caregiver via pcaName)
 ├── EmployeeScheduleLink (public schedule view token)
 └── PayrollVisits (matched by employee name)
```

### PCA Form Service Mapping (`deriveTimesheetService` — in `server/src/lib/timesheetUtils.js`)
| Auth Service Code | → PCA Form Section |
|---|---|
| PCS, PAS, TIMESHEET_PCS, COPE | PAS (ADL activities) |
| S5130, S5120, TIMESHEET_HOMEMAKER, TIMESHEET_CHORE | Homemaker (IADL activities) |
| S5150, TIMESHEET_RESPITE | Respite |
| S5135, TIMESHEET_COMPANION | Companion |

### Impact Checklist (when adding a brand-new service code)
Adding a code still requires updating the fallback constants below (they seed the DB and back-stop any code that has no DB row yet). Changing an *existing* code's name/label/account/color/timesheetSection/sortOrder/enforceAuthLimit should be done on the `/services` page, not by editing these files.
1. Add to `VALID_SERVICE_CODES` in `server/src/controllers/authorizationController.js`
2. Add to `REMINDER_WINDOWS` and `RENEWAL_COLORS` in `server/src/services/authorizationService.js`
3. Add to `SERVICE_DEFAULTS` in `server/src/lib/serviceDefaults.js` (include `enforceAuthLimit`) — `server/prisma/seed-services.js` picks it up automatically and create-only-seeds it into the DB `Service` table on next run
4. Update `deriveTimesheetSection()` in `server/src/services/serviceRegistry.js` (and, for parity, the legacy `deriveTimesheetService()` in `server/src/lib/timesheetUtils.js`)
5. Add to `SERVICE_CODE_OPTIONS` in `client/src/utils/serviceCodes.jsx` (fallback for `useServices()`; all dropdowns update automatically once the DB row exists)
6. Add to `AUTH_COLORS` and `SERVICE_CODE_NAMES` in `client/src/utils/constants.js` (fallback for `useServices()`; all pages update automatically once the DB row exists)
7. Add to `SERVICE_CODE_ACCOUNT_MAP` in `client/src/utils/accountMapping.js` (fallback auto-fill; updates automatically once the DB row exists)
8. If it maps to a new timesheet section: add DB fields, update controller totals, update PCA form + admin form + list page, and confirm `sectionEnforcesLimit()` behaves as intended for that section
9. Verify the new code appears correctly on the `/services` page (name/account/color/section/sortOrder/enforceAuthLimit editable) — that page is the source of truth going forward

## Spreadsheet Import Format (Client Data)
The client XLSX uses a parent-child row layout:
- **Parent row**: col A = row number, col B = client name, col C = Medicaid ID, col D = insurance type
- **Child rows**: col E = service category, col F = service code, col G = service name, col H = units, col I/J = dates
