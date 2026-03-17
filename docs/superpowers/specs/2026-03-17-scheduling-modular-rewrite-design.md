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

  hooks/
    useAuth.jsx                # Auth context + hook (user, login, logout, isAdmin)
    useToast.jsx               # Toast context + hook

  utils/
    dates.js                   # fmtDate, daysClass, getWeekRange
    time.js                    # hhmm12, time formatting
    status.js                  # statusLabel, visitRowClass
```

### Routing

Replace hash-based routing with `react-router-dom`:

| Path | Page | Auth |
|------|------|------|
| `/login` | LoginPage | Public |
| `/sign/:token` | SigningFormPage | Public |
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
  id        Int      @id @default(autoincrement())
  name      String
  phone     String   @default("")
  email     String   @default("")
  active    Boolean  @default(true)
  userId    Int?     @unique
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  shifts    Shift[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("employees")
}
```

- Standalone model for all caregivers, separate from User (app auth)
- Optional `userId` link if the caregiver also has a login account
- Shifts link to Employee instead of User
- `employeeName` free-text field on Shift is removed; replaced by Employee relation
- Existing free-text employee names migrated into Employee records

### New: ScheduleNotification Model

```prisma
model ScheduleNotification {
  id                 Int       @id @default(autoincrement())
  employeeId         Int
  employee           Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  weekStart          DateTime
  method             String    // "sms" | "email"
  destination        String    // phone number or email address
  status             String    @default("pending") // "pending" | "sent" | "delivered" | "failed"
  confirmationToken  String    @unique @default(uuid())
  confirmedAt        DateTime?
  sentAt             DateTime?
  createdAt          DateTime  @default(now())

  @@map("schedule_notifications")
}
```

### Modified: Shift Model

```prisma
model Shift {
  id               Int       @id @default(autoincrement())
  clientId         Int
  client           Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  employeeId       Int       // Now references Employee, not User
  employee         Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  serviceCode      String
  shiftDate        DateTime
  startTime        String    // HH:MM 24h
  endTime          String    // HH:MM 24h
  hours            Float
  units            Int       // hours * 4
  notes            String    @default("")
  status           String    @default("scheduled") // scheduled | completed | cancelled
  recurringGroupId String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

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

Authorization units are **weekly** (Sun-Sat). Each week resets to the full authorized amount.

**Validation logic:**
```
Remaining = Weekly Authorized Units - Sum of Scheduled Units (same client + service code + same Sun-Sat week)
```

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
4. Sends via SMS (Twilio) and/or email based on employee's contact info
5. Each notification includes a unique confirmation link
6. Employee clicks link → sees their schedule → clicks "Confirm"

**Confirmation tracking:**
- Admin sees per-employee status: not sent | sent | delivered | confirmed
- Timestamp of confirmation recorded

**Auto-notification triggers:**
- Caregiver swap → auto-notify both old and new employee
- Shift cancellation → auto-notify affected employee
- Minor time adjustments → admin manually triggers re-send

### 5.3 Employee Schedule View (Public Confirmation Page)

Similar to existing signing form pattern:
- Unique token URL: `/schedule/confirm/:token`
- Displays the employee's weekly schedule (read-only)
- "I confirm I have received this schedule" button
- No login required

---

## 6. New API Endpoints

### Employee CRUD (Admin only)

```
GET    /api/employees              # List all (filter: ?active=true)
GET    /api/employees/:id
POST   /api/employees              # Create { name, phone, email }
PUT    /api/employees/:id          # Update
DELETE /api/employees/:id
```

### Schedule Notifications (Admin only)

```
POST   /api/schedule-notifications/send    # { weekStart, employeeIds? }
GET    /api/schedule-notifications/status   # { weekStart } → per-employee status
```

### Schedule Confirmation (Public)

```
GET    /api/schedule/confirm/:token    # View schedule
PUT    /api/schedule/confirm/:token    # Confirm receipt
```

### Authorization Validation

```
GET    /api/shifts/auth-check          # { clientId, serviceCode, weekStart } → remaining units
```

---

## 7. Pages Detail

### DashboardPage (Overview Hub)

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
- Create/edit employee (name, phone, email, link to User account)
- Deactivate (soft delete via active=false)
- Show linked User account if exists

---

## 8. External Service Dependencies

| Service | Purpose | Notes |
|---------|---------|-------|
| **Twilio** | SMS delivery | Requires account SID, auth token, phone number. Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **SendGrid or Nodemailer** | Email delivery | SendGrid for managed service, or Nodemailer with SMTP for self-hosted. Env vars: `EMAIL_SERVICE`, `EMAIL_FROM`, `SENDGRID_API_KEY` or SMTP config |

These are optional — scheduling works without them, but delivery features require at least one configured.

---

## 9. Migration Strategy

### Data Migration

1. Create Employee records from:
   - Existing User records with role=pca
   - Distinct `employeeName` values from existing Shifts
2. Update Shift.employeeId to reference Employee model
3. Remove `employeeName` column from Shift

### Frontend Migration

1. Set up new file structure with React Router
2. Extract each page from App.jsx into its own file
3. Extract shared components (Sidebar, Icons, Modals, Toast)
4. Extract hooks (useAuth, useToast)
5. Extract utilities (dates, time, status)
6. Verify each page works after extraction
7. Build new features (Employee page, schedule delivery, auth validation)

---

## 10. What Is NOT In Scope

- Sandata integration (Sandata is only an import source for payroll)
- Task/accountability system (future module)
- Lead tracking (future module)
- Payroll automation enhancements (future module)
- Hiring/onboarding tracking (future module)
- Analytics or reporting beyond dashboard quick stats
