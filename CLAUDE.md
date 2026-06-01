# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Full-stack web app for a PCA (Personal Care Attendant) agency to manage client authorizations, timesheets, digital signatures, and payroll processing.

## Tech Stack
- **Frontend**: React 19 + Vite, page-per-file under `client/src/pages/`
- **Backend**: Express.js + Prisma ORM + PostgreSQL
- **Auth**: JWT with role-based access (`admin` / `pca`)
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
- `DashboardPage.jsx`, `ClientsPage.jsx`, `TimesheetsListPage.jsx`, `PayrollPage.jsx`, `SchedulingPage.jsx`, `EmployeesPage.jsx`, `InsuranceTypesPage.jsx`, `ServicesPage.jsx`, `UsersPage.jsx`, `PcaFormPage.jsx`

Shared components under `client/src/components/`:
- `common/Icons.jsx` — 25+ inline SVG icon components
- `common/ActivityDrawer.jsx` — `ActivityButton` (page-level) and `EntityActivityButton` (entity-level) audit log viewers
- `common/Modal.jsx`, `common/ConfirmModal.jsx`, `common/SignaturePad.jsx`
- `layout/Layout.jsx`, `layout/Sidebar.jsx`, `layout/Toast.jsx`

Hooks under `client/src/hooks/`:
- `useAuth.js` — auth context with `isAdmin`, `authUser`
- `useToast.js` — toast notification context

Utils under `client/src/utils/`:
- `dates.js` — `fmtDate()`, `formatWeek()`
- `time.js` — `hhmm12()` (24h→12h display)
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
- **Service tabs**: PAS (ADL) always shown; Homemaker/Respite toggle via tabs in the IADL section header.
- **Authorization limits**: displays authorized hours/units per service near client info. Blocks submission if hours exceed authorized limits. Service code mapping: PCS/PAS → PAS, S5130 → Homemaker, S5150 → Respite.
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
- Route scheme: `/dashboard`, `/timesheets`, `/payroll`, `/payroll/runs/:id`, `/insurance-types`, `/services`, `/users`, `/clients`, `/employees`, `/scheduling`
- Public routes: `/login`, `/pca-form/:token`, `/sign/:token`, `/schedule/view/:token`, `/schedule/confirm/:token`, `/forgot-password`, `/reset-password/:token`

**Server**: All API at `/api`. Public: `POST /auth/login`, `GET /sign/:token` (redirects to permanent link), `GET/PUT /pca-form/:token`. Admin-only routes use `requireRole('admin')`.

### React Hook Rule — Critical
All `useState`/`useCallback`/`useEffect` hooks must be declared **before** any conditional early returns (`if (authChecking) return ...`, `if (!authUser) return ...`). Violating this causes a silent blank-screen crash in production.

### Data Flow
1. Frontend calls `api.js` helper → Express route → controller
2. Controller calls service layer for business logic
3. Enriched data returned to frontend; filtering/sorting done client-side

## Data Model
- **Users** — staff accounts (admin/pca roles), `active` boolean, `archivedAt` soft delete
- **Employees** — caregivers with optional `userId` link, schedule links
- **Clients** — care recipients with Medicaid ID, insurance type, `enabledServices` JSON
- **Authorizations** — per client (PCS, SDPC, S5130, S5150, etc.) with start/end dates and `authorizedUnits` (15-min units, not hours)
- **Timesheets** — weekly records; status `draft`/`submitted`; signatures stored as JSON
- **TimesheetEntries** — daily ADL/IADL/Respite logs (JSON activities), time in/out, hours, timeBlocks for multiple shifts
- **SigningTokens** — legacy one-time-use tokens; `/sign/:token` now auto-resolves to a permanent link
- **PermanentLinks** — reusable links per client+PCA pair
- **InsuranceTypes / Services** — reference data
- **PayrollRun** — uploaded XLSX processing run with status, totals, and `authorizationSnapshot`
- **PayrollVisit** — individual visit record within a run; see payroll section below
- **Shifts** — scheduled shifts with client, employee, service code, date/time
- **AuditLog** — tracks all CRUD operations with field-level diffs
- **EmployeeScheduleLink** — per-employee tokens for viewing their schedule
- **ScheduleNotification** — email/SMS delivery tracking for schedules

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

## Deployment (Railway)
- Single service: Express serves the React build from `client/dist`
- Start command: `prisma migrate deploy` → `seed.js` → `node src/index.js`
- Environment variables: `DATABASE_URL` (PostgreSQL), `JWT_SECRET`, `PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`

## Spreadsheet Import Format (Client Data)
The client XLSX uses a parent-child row layout:
- **Parent row**: col A = row number, col B = client name, col C = Medicaid ID, col D = insurance type
- **Child rows**: col E = service category, col F = service code, col G = service name, col H = units, col I/J = dates
