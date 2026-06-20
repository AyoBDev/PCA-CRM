# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Full-stack web app for a PCA (Personal Care Attendant) agency to manage client authorizations, timesheets, digital signatures, and payroll processing.

## Tech Stack
- **Frontend**: React 19 + Vite, page-per-file under `client/src/pages/`
- **Backend**: Express.js + Prisma ORM + PostgreSQL
- **Auth**: JWT with role-based access (`admin` / `user` / `pca`)
- **Styling**: Custom CSS (`client/src/index.css`) using shadcn/ui zinc design tokens

## Key Commands
```bash
# Development
cd server && npm run dev          # Start API server (port 4000, uses --watch)
cd client && npm run dev          # Start Vite dev server (port 5173, proxies /api to 4000)

# Database
cd server && npx prisma migrate dev --name <name>   # Create + apply migration
cd server && npm run db:seed                         # Seed admin user (uses ADMIN_EMAIL/ADMIN_PASSWORD env vars)
cd server && node prisma/import-xlsx.js             # Import clients from data/all-data.xlsx
cd server && npm run db:migrate-data                # One-time SQLite → PostgreSQL data migration

# Build & Production
cd client && npm run build        # Build to client/dist (served by Express at port 4000)
npm start                         # Run migrations → seed → start server

# Tests
cd server && npm test             # Run Jest tests (--verbose)
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
  middleware/authMiddleware.js  # authenticate() + requireRole(...roles)
  lib/prisma.js     # Singleton Prisma client instance
prisma/
  schema.prisma     # PostgreSQL schema with @@map snake_case names
  seed.js           # Creates admin user (skips if already exists, uses ADMIN_EMAIL/ADMIN_PASSWORD env vars)
  migrate-data.js   # One-time SQLite → PostgreSQL data migration script
  migrations/       # Timestamped SQL migrations
```

### Frontend Structure
Pages are split into individual files under `client/src/pages/`:
- `DashboardPage.jsx`, `ClientsPage.jsx`, `TimesheetsListPage.jsx`, `PayrollPage.jsx`, `SchedulingPage.jsx`, `EmployeesPage.jsx`, `InsuranceTypesPage.jsx`, `ServicesPage.jsx`, `UsersPage.jsx`, `PcaFormPage.jsx`, `FilesPage.jsx`

Shared components under `client/src/components/`:
- `common/Icons.jsx` — 25+ inline SVG icon components
- `common/GlobalToolbar.jsx` — Tier 1 system toolbar (Back, Title, Undo/Redo/History/Activity, Trash, Archive, Overflow)
- `common/ContextBar.jsx` — Tier 2 page-specific toolbar (compound: `ContextBar.Left` + `ContextBar.Right`)
- `common/AutocompleteInput.jsx` — Reusable autocomplete text input (used for Service Category, Service Name)
- `common/HistoryPanel.jsx` — Session history dropdown (shows undo stack)
- `common/OverflowMenu.jsx` — Three-dot "⋯" overflow menu
- `common/DropdownMenu.jsx` — Reusable dropdown (trigger + panel)
- `common/ActivityDrawer.jsx` — `ActivityButton` (page-level) and `EntityActivityButton` (entity-level) audit log viewers
- `common/Modal.jsx`, `common/ConfirmModal.jsx`, `common/SignaturePad.jsx`
- `layout/Layout.jsx`, `layout/Sidebar.jsx`, `layout/Toast.jsx`

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
- When `accountNumber` or `sandataClientId` changes on an Authorization, it propagates to all active Shifts for that client + serviceCode
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
- **Users** — staff accounts (admin/user/pca roles), `active` boolean, `archivedAt` soft delete
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

## Database & Backup
- **Database**: PostgreSQL (migrated from SQLite, April 2026)
- **Local dev**: Postgres.app or Docker (`postgresql://mac@localhost:5432/nvbestpca`)
- **Production**: Railway managed PostgreSQL with automatic daily backups
- **On-demand backup**: `GET /api/backup/export` (admin-only) — downloads all tables as JSON. Dashboard has a "Backup" button.
- **Seed script**: `seed.js` only creates admin if none exists (never overwrites). Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars with fallback defaults.
- **Data migration**: `prisma/migrate-data.js` transfers data from SQLite `dev.db` to PostgreSQL (one-time use, requires `better-sqlite3` devDependency)

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
- Start command: `prisma migrate deploy` → `seed.js` → `node src/index.js`
- **Storage Bucket**: Create bucket on Railway canvas → Connect to service → env vars auto-injected
- Environment variables: `DATABASE_URL` (PostgreSQL), `JWT_SECRET`, `PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`

## Service Code System — Cross-Entity Trace

Service codes are the connective tissue of the app. A change to service codes must be traced through every layer:

### Canonical Service Codes
**EVV Services**: `PCS`, `S5120`, `S5125`, `S5130`, `S5135`, `S5150`, `SDPC`
**Timesheet Services**: `TIMESHEET_PCS`, `TIMESHEET_HOMEMAKER`, `TIMESHEET_RESPITE`, `TIMESHEET_COMPANION`, `TIMESHEET_CHORE`
**Programs**: `COPE`, `PAS`

### Where Service Codes Live (must stay in sync)
| Location | Purpose |
|----------|---------|
| `server/src/controllers/authorizationController.js` → `VALID_SERVICE_CODES` | Server-side validation of allowed codes |
| `server/src/services/authorizationService.js` → `REMINDER_WINDOWS`, `RENEWAL_COLORS` | Expiry reminder config per code |
| `server/prisma/seed-services.js` → `DEFAULT_SERVICES` | Reference data seeder |
| `server/src/controllers/pcaFormController.js` → `deriveTimesheetService()` | Maps auth service codes → PCA form sections (PAS/Homemaker/Respite/Companion) |
| `client/src/utils/serviceCodes.jsx` → `SERVICE_CODE_OPTIONS` | **Single source** for all frontend service code dropdowns |
| `client/src/utils/constants.js` → `AUTH_COLORS`, `SERVICE_CODE_NAMES` | **Single source** for all frontend display colors/names |
| `client/src/utils/accountMapping.js` → `SERVICE_CODE_ACCOUNT_MAP` | Service code → account number auto-fill |
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

### PCA Form Service Mapping (`deriveTimesheetService`)
| Auth Service Code | → PCA Form Section |
|---|---|
| PCS, PAS, TIMESHEET_PCS, COPE | PAS (ADL activities) |
| S5130, S5120, TIMESHEET_HOMEMAKER, TIMESHEET_CHORE | Homemaker (IADL activities) |
| S5150, TIMESHEET_RESPITE | Respite |
| S5135, TIMESHEET_COMPANION | Companion |

### Impact Checklist (when adding/changing a service code)
1. Add to `VALID_SERVICE_CODES` in `server/src/controllers/authorizationController.js`
2. Add to `REMINDER_WINDOWS` and `RENEWAL_COLORS` in `server/src/services/authorizationService.js`
3. Add to `server/prisma/seed-services.js`
4. Update `deriveTimesheetService()` mapping in `server/src/controllers/pcaFormController.js`
5. Add to `SERVICE_CODE_OPTIONS` in `client/src/utils/serviceCodes.jsx` (all dropdowns update automatically)
6. Add to `AUTH_COLORS` and `SERVICE_CODE_NAMES` in `client/src/utils/constants.js` (all pages update automatically)
7. Add to `SERVICE_CODE_ACCOUNT_MAP` in `client/src/utils/accountMapping.js` (auto-fill updates automatically)
8. If it maps to a new timesheet section: add DB fields, update controller totals, update PCA form + admin form + list page

## Spreadsheet Import Format (Client Data)
The client XLSX uses a parent-child row layout:
- **Parent row**: col A = row number, col B = client name, col C = Medicaid ID, col D = insurance type
- **Child rows**: col E = service category, col F = service code, col G = service name, col H = units, col I/J = dates
