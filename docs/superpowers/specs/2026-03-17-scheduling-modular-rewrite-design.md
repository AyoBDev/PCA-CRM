# Scheduling System & Modular Frontend Rewrite — Design Spec

**Date:** 2026-03-17
**Branch:** dev/modular-rewrite (off Schduling-Feature)
**Status:** Approved

---

## 1. Overview

Enhance the NV Best PCA scheduling module and restructure the frontend from a single-file SPA (~4000-line App.jsx) into a modular, maintainable architecture. Production (`main` branch) remains untouched throughout development.

### Goals

- Full modular rewrite of the React frontend (separate pages, shared components, React Router)
- Enhanced scheduling with real-time weekly authorization validation
- Schedule delivery to employees via SMS and email with confirmation tracking
- New Employee model for caregiver contact management
- Dashboard as an overview hub; Clients extracted to dedicated page

---

## 2. Frontend Architecture

### New File Structure

```
client/src/
  main.jsx                    # Entry point
  App.jsx                     # Router setup, auth provider, layout shell
  api.js                      # API client (existing, extended)

  components/
    layout/
      Sidebar.jsx             # Navigation sidebar (collapsible, 256px/52px)
      Layout.jsx              # Main layout wrapper (sidebar + content)
      Toast.jsx               # Toast notification system
    common/
      ConfirmModal.jsx         # Reusable confirm dialog
      Icons.jsx                # All SVG icon components
      Pagination.jsx           # Shared pagination component

  pages/
    LoginPage.jsx
    DashboardPage.jsx          # Overview hub (stats, alerts)
    ClientsPage.jsx            # Client CRUD + authorization management (extracted from Dashboard)
    EmployeesPage.jsx          # New: caregiver contact management
    TimesheetsListPage.jsx
    TimesheetFormPage.jsx
    SigningFormPage.jsx         # Public route (no auth)
    InsuranceTypesPage.jsx
    ServicesPage.jsx
    UsersPage.jsx
    PayrollPage.jsx
    scheduling/
      SchedulingPage.jsx
      ShiftFormModal.jsx
      ScheduleCard.jsx
      AuthSummaryBar.jsx
      ScheduleTimeGrid.jsx
      ScheduleOverviewTable.jsx
      ScheduleDelivery.jsx     # New: send/confirm schedule UI
      ScheduleConfirmPage.jsx  # Public: employee confirms receipt of schedule

  hooks/
    useAuth.jsx                # Auth context + hook (user, login, logout, isAdmin)
    useToast.jsx               # Toast context + hook

  utils/
    dates.js                   # fmtDate, daysClass, getWeekRange
    time.js                    # hhmm12, time formatting
    status.js                  # statusLabel, visitRowClass
```

### Routing

Replace hash-based routing with `react-router-dom` v6 (compatible with React 19). Use `createBrowserRouter` with route-based code splitting via `React.lazy()` and `Suspense` for improved load times. The `Suspense` fallback renders the layout shell (sidebar + empty content area) to avoid full-page flicker during chunk loading.

| Path | Page | Auth |
|------|------|------|
| `/login` | LoginPage | Public |
| `/sign/:token` | SigningFormPage | Public |
| `/schedule/confirm/:token` | ScheduleConfirmPage | Public |
| `/` or `/dashboard` | DashboardPage | Admin |
| `/clients` | ClientsPage | Admin |
| `/employees` | EmployeesPage | Admin |
| `/scheduling` | SchedulingPage | Admin |
| `/timesheets` | TimesheetsListPage | Authenticated |
| `/timesheets/new` | TimesheetFormPage | Authenticated |
| `/timesheets/:id` | TimesheetFormPage | Authenticated |
| `/payroll` | PayrollPage | Admin |
| `/payroll/runs/:id` | PayrollPage (detail view) | Admin |
| `/insurance-types` | InsuranceTypesPage | Admin |
| `/services` | ServicesPage | Admin |
| `/users` | UsersPage | Admin |

### Dev Server Note

Vite's default `appType: 'spa'` handles HTML5 history fallback automatically, so `/clients`, `/scheduling`, etc. will resolve correctly in development. The Express production server already has a wildcard catch-all serving `index.html`. No additional SPA fallback configuration is needed in either environment.

### Auth Context

`useAuth` hook provides:
- `user` — current user object or null
- `isAdmin` — boolean
- `login(email, password)` — authenticate and set user
- `logout()` — clear token and user
- `loading` — true during initial auth check

Wraps the app in `<AuthProvider>`. All pages consume via `useAuth()` instead of prop-drilling.

### Toast Context

`useToast` hook provides:
- `showToast(message, type)` — display notification
- Auto-dismiss after 3 seconds (existing behavior preserved)

---

## 3. Sidebar Navigation Order

1. Dashboard
2. Scheduling
3. Timesheets
4. Payroll
5. Clients
6. Employees
7. Insurance Types
8. Services
9. Users

Collapsible behavior preserved: 256px expanded, 52px collapsed, state in localStorage.

---

## 4. Data Model Changes

### New: Employee Model

```prisma
model Employee {
  id            Int                    @id @default(autoincrement())
  name          String
  phone         String                 @default("")  @map("phone")
  email         String                 @default("")  @map("email")
  active        Boolean                @default(true) @map("active")
  userId        Int?                   @unique @map("user_id")
  user          User?                  @relation(fields: [userId], references: [id], onDelete: SetNull)
  shifts        Shift[]
  notifications ScheduleNotification[]
  createdAt     DateTime               @default(now()) @map("created_at")
  updatedAt     DateTime               @updatedAt @map("updated_at")

  @@map("employees")
}
```

- Standalone model for all caregivers, separate from User (app auth)
- Optional `userId` link if the caregiver also has a login account
- Shifts link to Employee instead of User
- `employeeName` free-text field on Shift is removed; replaced by Employee relation
- Existing free-text employee names migrated into Employee records
- Employee-User linking is done via `PUT /api/employees/:id` with a `userId` field

### New: ScheduleNotification Model

```prisma
model ScheduleNotification {
  id                 Int       @id @default(autoincrement())
  employeeId         Int       @map("employee_id")
  employee           Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  weekStart          DateTime  @map("week_start")    // Date-only (stored as T00:00:00.000Z, represents Sunday of the week)
  method             String    @map("method")        // "sms" | "email"
  destination        String    @map("destination")   // phone number or email address
  status             String    @default("pending") @map("status") // "pending" | "sent" | "failed" | "confirmed"
  confirmationToken  String    @unique @default(uuid()) @map("confirmation_token")
  confirmedAt        DateTime? @map("confirmed_at")
  sentAt             DateTime? @map("sent_at")
  failureReason      String    @default("") @map("failure_reason")  // Twilio/email error message when status = "failed"
  createdAt          DateTime  @default(now()) @map("created_at")

  @@index([employeeId])
  @@index([weekStart])
  @@map("schedule_notifications")
}
```

**Note on status values:** Simplified to `pending | sent | failed | confirmed`. Granular delivery tracking (e.g., "delivered" vs. "sent") would require Twilio/SendGrid webhook endpoints which adds complexity without significant value for the initial build. `confirmed` is tracked reliably via the confirmation link click.

**Note on UUID generation:** `@default(uuid())` generates UUIDs at the Prisma level, not the database level. Direct SQL inserts would not get automatic UUIDs.

### Modified: Shift Model

```prisma
model Shift {
  id               Int       @id @default(autoincrement())
  clientId         Int       @map("client_id")
  client           Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  employeeId       Int       @map("employee_id")  // References Employee model
  employee         Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  serviceCode      String    @map("service_code")
  shiftDate        DateTime  @map("shift_date")   // Date-only (stored as T00:00:00.000Z)
  startTime        String    @map("start_time")   // HH:MM 24h
  endTime          String    @map("end_time")     // HH:MM 24h
  hours            Float
  units            Int       // hours * 4
  notes            String    @default("")
  status           String    @default("scheduled") // scheduled | completed | cancelled
  recurringGroupId String    @default("") @map("recurring_group_id")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@index([clientId])
  @@index([employeeId])
  @@index([shiftDate])
  @@map("shifts")
}
```

- `employeeId` now required (not nullable) — references Employee model
- `employeeName` field removed

### Modified: User Model

Add relation to Employee:

```prisma
model User {
  // ... existing fields ...
  employee Employee?
}
```

---

## 5. Scheduling Enhancements

### 5.1 Real-Time Weekly Authorization Validation

The `authorizedUnits` field on the Authorization model stores **weekly** authorized units per service code. Each Sun-Sat week resets to the full authorized amount.

**Validation logic:**
```
Remaining = authorizedUnits - Sum of scheduled units (same client + service code + same Sun-Sat week)
```

Validation only considers shifts within the authorization's active date range (`authorizationStartDate` to `authorizationEndDate`). Shifts outside the auth period are flagged as unauthorized.

**Payroll module impact:** The existing `applyAuthCap` function in `payrollService.js` currently treats `authorizedUnits` as a total-period cap across the entire payroll run (deducting a running balance across all visits). This function must be updated to group visits by Sun-Sat week before applying caps, so each week is independently capped at `authorizedUnits`. This change is part of this spec's scope and will be implemented during the migration.

**Recurring shift creation:** When creating recurring shifts with `repeatUntil`, each week's authorization is validated independently. If week 3 of 5 would exceed limits, the system warns but still allows creation with "Save Anyway."

**Three visual states in shift form and calendar:**

| State | Visual | Behavior |
|-------|--------|----------|
| Within limits | Green | "12 of 40 units remaining" |
| Would exceed | Red warning | "This shift uses 8 units but only 4 remain" + "Save Anyway" button |
| Already exceeded | Red banner | Flagged on calendar view for existing over-allocated shifts |

**AuthSummaryBar enhancements:**
- Color transitions: green (< 75%) → yellow (75-99%) → red (>= 100%)
- Warning icon when any service code is over-allocated
- Clickable to see which shifts consume units

### 5.2 Schedule Delivery

**Send flow:**
1. Admin views a week's schedule → clicks "Send Schedules"
2. System generates per-employee schedule (all shifts for the week)
3. Schedule includes: client name, address, phone, gate code, date, time, service type
4. Sends via SMS and/or email based on employee's contact info
5. Each notification includes a unique confirmation link
6. Employee clicks link → sees their schedule → clicks "Confirm"

**No-contact-info handling:** Employees without phone or email are excluded from the send list. The admin UI shows a warning listing employees with missing contact info, with a link to the Employees page to update them.

**Message formats:**

SMS (Twilio):
```
NV Best PCA - Your schedule for [week of Mar 17-23]:
[Mon 3/17] 8:00am-12:00pm - John Smith (PCS)
[Tue 3/18] 9:00am-1:00pm - Jane Doe (S5130)
...
Confirm receipt: [link]
```
If the schedule exceeds SMS character limits (160 chars), send as multiple segments (Twilio handles this automatically).

Email:
- HTML template with a formatted table of shifts
- Each row: day, date, time range, client name, address, phone, gate code, service type
- "Confirm Receipt" button linking to the confirmation page
- Plain-text fallback for email clients that don't render HTML

**Confirmation tracking:**
- Admin sees per-employee status: not sent | sent | failed | confirmed
- Timestamp of confirmation recorded

**Auto-notification triggers:**
- Caregiver swap → auto-notify both old and new employee
- Shift cancellation → auto-notify affected employee
- Minor time adjustments → admin manually triggers re-send

### 5.3 Employee Schedule View (Public Confirmation Page)

Similar to existing signing form pattern:
- Unique token URL: `/schedule/confirm/:token`
- Displays the employee's weekly schedule (read-only)
- Shows: client name, address, phone, gate code, date, time, service type
- "I confirm I have received this schedule" button
- No login required

---

## 6. API Endpoints

### New: Employee CRUD (Admin only)

```
GET    /api/employees              # List all (filter: ?active=true)
GET    /api/employees/:id
POST   /api/employees              # Create { name, phone, email }
PUT    /api/employees/:id          # Update { name, phone, email, userId }
DELETE /api/employees/:id
```

Employee-User linking: `PUT /api/employees/:id` accepts an optional `userId` field. Setting it links the employee to a User account. Setting it to `null` unlinks. When a User is deleted, the Employee record remains (`onDelete: SetNull`).

### New: Schedule Notifications (Admin only)

```
POST   /api/schedule-notifications/send    # { weekStart, employeeIds? }
GET    /api/schedule-notifications/status   # { weekStart } → per-employee status
```

### New: Schedule Confirmation (Public)

```
GET    /api/schedule/confirm/:token    # View schedule
PUT    /api/schedule/confirm/:token    # Confirm receipt
```

### New: Authorization Validation (Admin only)

```
GET    /api/shifts/auth-check          # ?clientId=1&serviceCode=PCS&weekStart=2026-03-15 → remaining units
```

### New: Dashboard Stats (Admin only)

```
GET    /api/dashboard/stats            # Aggregated counts: active clients, active employees,
                                       # today's shifts, week's hours/units, unconfirmed notifications,
                                       # expiring authorizations
```

### Modified: Existing Scheduling Endpoints

The following existing endpoints change due to the Employee model migration:

| Endpoint | Change |
|----------|--------|
| `GET /api/shifts/employee/:employeeId` | Now references Employee model (was User) |
| `GET /api/shifts/employee-by-name` | **Deprecated and removed** — all employees have IDs now |
| `POST /api/shifts` | `employeeId` required (references Employee), `employeeName` field removed |
| `PUT /api/shifts/:id` | Same: `employeeId` references Employee |
| `DELETE /api/shifts` (bulk delete) | **Retained** for admin use |

---

## 7. Pages Detail

### DashboardPage (Overview Hub)

Powered by a single `GET /api/dashboard/stats` call.

**Scheduling section:**
- Today's shifts count
- Unconfirmed schedule notifications count
- Authorization warnings (clients approaching/exceeding weekly limits)

**Authorization alerts:**
- Expiring authorizations (PCS=60 days, SDPC=30 days, default=30 days)
- Clients with no active authorization

**Quick stats:**
- Active clients count
- Active employees count
- This week's total scheduled hours/units

### ClientsPage (Extracted from Dashboard)

All existing client management functionality:
- Client list with search/filter
- Create/edit client modal
- Authorization management per client
- Bulk import from XLSX
- Bulk delete

### EmployeesPage (New)

- Employee list with search, filter by active status
- Create/edit employee (name, phone, email)
- Link/unlink to User account via dropdown (optional)
- Deactivate (soft delete via active=false)
- Show linked User account if exists
- Warning indicator for employees missing phone or email

---

## 8. External Service Dependencies

| Service | Purpose | Notes |
|---------|---------|-------|
| **Twilio** | SMS delivery | Requires account SID, auth token, phone number. Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **SendGrid or Nodemailer** | Email delivery | SendGrid for managed service, or Nodemailer with SMTP for self-hosted. Env vars: `EMAIL_SERVICE`, `EMAIL_FROM`, `SENDGRID_API_KEY` or SMTP config |

These are optional — scheduling works without them, but delivery features require at least one configured. If neither is configured, the "Send Schedules" button is hidden.

---

## 9. Migration Strategy

### Data Migration

Migration is performed in phases to minimize risk:

**Phase 1: Create Employee table and populate**
1. Create the `employees` table
2. Run a migration script that:
   - Creates an Employee record for each existing User with `role = 'pca'`, linking via `userId`
   - Collects all distinct `employeeName` values from existing Shifts where `employeeId IS NULL`
   - Creates an Employee record for each unique name (exact string match deduplication)
   - Admin reviews auto-created Employee records via the new Employees page before Phase 2

**Phase 2: Link shifts to Employee records**
1. Add `employee_id_new` column to shifts (nullable, references employees)
2. Populate `employee_id_new`:
   - For shifts with existing `employeeId` (User FK): find the Employee record linked to that User
   - For shifts with `employeeName` only: find the Employee record matching that name
3. Verify all shifts have `employee_id_new` populated
4. Drop old `employeeId` (User FK) and `employeeName` columns
5. Rename `employee_id_new` to `employee_id`, make non-nullable

**Phase 3: Cleanup**
1. Remove `getEmployeeScheduleByName` endpoint
2. Remove `employeeName` references from frontend

### Frontend Migration

1. Set up new file structure with React Router v6
2. Extract shared components (Sidebar, Icons, Modals, Toast)
3. Extract hooks (useAuth, useToast)
4. Extract utilities (dates, time, status)
5. Extract each page from App.jsx into its own file
6. Add `React.lazy()` code splitting for each page route
7. Verify each page works after extraction
8. Build new features (Employee page, schedule delivery, auth validation)

### CSS Strategy

CSS remains in a single `client/src/index.css` file for this phase. The existing CSS class naming conventions (`.sched-*`, `.payroll-*`, etc.) provide sufficient namespacing. CSS modules or per-page splitting can be considered in a future phase if the file becomes unwieldy.

---

## 10. PCA-Role Access

PCA-role users do not have access to the scheduling page within the app. They receive their schedules via SMS/email with a confirmation link (public page, no login required). This is intentional — PCAs are field workers who interact via their phones, not the admin app.

If PCA app access is needed in the future, it can be added as a read-only "My Schedule" view filtered to their linked Employee record.

---

## 11. What Is NOT In Scope

- Sandata integration (Sandata is only an import source for payroll)
- Task/accountability system (future module)
- Lead tracking (future module)
- Payroll automation enhancements (future module)
- Hiring/onboarding tracking (future module)
- Analytics or reporting beyond dashboard quick stats
- Twilio/SendGrid delivery webhooks (delivery status tracking beyond sent/failed/confirmed)
- Existing Jest server tests will be updated as needed for the Employee model migration

---

## 12. Testing Strategy

### Frontend Component Tests

Set up Vitest (already bundled with Vite) + React Testing Library for component testing:

- **Hooks:** `useAuth` (login/logout flow, token persistence, role detection), `useToast` (show/dismiss)
- **Layout:** Sidebar renders correct nav items, collapse/expand, active page highlighting
- **Pages:** Each extracted page renders without errors, displays expected elements
- **Scheduling-specific:**
  - `AuthSummaryBar` renders correct color states (green/yellow/red) based on unit thresholds
  - `ShiftFormModal` shows authorization warning when exceeding limits
  - `ScheduleDelivery` shows missing-contact warnings, correct send/confirm statuses
  - `ScheduleTimeGrid` renders shifts in correct day/time slots
- **ScheduleConfirmPage:** Public page renders schedule data, confirm button updates status

### Server Tests

- Update existing Jest tests for Employee model changes
- Add tests for new Employee CRUD endpoints
- Add tests for schedule notification send/confirm flow
- Add tests for `GET /api/dashboard/stats` aggregation
- Add tests for `GET /api/shifts/auth-check` validation logic
