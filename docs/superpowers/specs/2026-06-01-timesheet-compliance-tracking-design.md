# Timesheet Compliance Tracking

## Goal

Automatically identify overdue timesheets after the payroll deadline (Saturday night), notify caregivers via email on Sunday morning, and surface overdue counts in the admin dashboard's Needs Attention section.

## Background

The payroll week runs Sunday–Saturday. Caregivers submit timesheets via the PCA form, which already enforces both PCA and client signatures before submission. The problem: many timesheets remain in `draft` status past the Saturday deadline, requiring manual follow-up and delaying payroll processing.

## Scope

- Computed "Overdue" label for draft timesheets past their week
- Automatic email reminder via node-cron every Sunday at 6:00 AM
- Dashboard Needs Attention alert showing overdue timesheet count
- Reminder delivery logging to avoid duplicate sends

**Out of scope**: Missing signature tracking (already enforced by PCA form validation), SMS reminders, multi-stage reminder escalation.

## Design

### 1. Overdue Label (Computed — No Schema Change)

A timesheet is "overdue" when:
- `status === 'draft'`
- Current date is past Saturday of the timesheet's week (`weekStart` + 6 days < today)

This logic is computed at query time — no new database status. The label appears as a red "Overdue" badge wherever timesheet status is displayed (timesheets list, dashboard alerts).

**Implementation locations:**
- Backend: helper function `isOverdue(timesheet)` in a shared util or inline in controllers
- Frontend: derive from `status` + `weekStart` when rendering status badges
- Timesheets list endpoint: include an `isOverdue` boolean in the response for convenience

### 2. Automatic Sunday Morning Reminder (node-cron)

**Trigger:** `node-cron` job scheduled at `0 6 * * 0` (6:00 AM every Sunday, server time).

**Logic:**
1. Find all timesheets where `status = 'draft'` and the week has ended (Saturday of that week < today)
2. Join against `TimesheetReminder` to exclude timesheets that already received a reminder
3. For each, resolve the employee via `Timesheet → PermanentLink → Employee → User`
4. Skip if no User account or no email on the User record
5. Send email via Brevo using `notificationService.sendEmail()`
6. Log the reminder in the `TimesheetReminder` table (one reminder per timesheet, ever)

**Email content:**
- Subject: "Timesheet Reminder: Week of [date range] not submitted"
- Body: "Hi [PCA name], your timesheet for [client name] for the week of [start]–[end] has not been submitted. Please submit it as soon as possible to avoid payroll delays. [Link to PCA form]"

### 3. TimesheetReminder Table (New Model)

```prisma
model TimesheetReminder {
  id          Int      @id @default(autoincrement())
  timesheetId Int      @map("timesheet_id")
  employeeId  Int?     @map("employee_id")
  sentAt      DateTime @default(now()) @map("sent_at")
  channel     String   @default("email")
  status      String   @default("sent")
  
  timesheet   Timesheet @relation(fields: [timesheetId], references: [id], onDelete: Cascade)
  
  @@map("timesheet_reminders")
}
```

Purpose: prevent duplicate reminders for the same timesheet and provide an audit trail of what was sent.

### 4. Dashboard Needs Attention Integration

The existing `GET /api/dashboard/stats` endpoint already returns alert data. Add:

```json
{
  "overdueTimesheets": {
    "count": 5,
    "items": [
      {
        "timesheetId": 42,
        "clientName": "John Doe",
        "pcaName": "Jane Smith",
        "weekStart": "2026-05-25"
      }
    ]
  }
}
```

Frontend: render in the Needs Attention section as:
- Icon + "X timesheets overdue" (red text)
- Expandable or click-through to the timesheets list filtered by overdue

### 5. Timesheets List Page Enhancement

Add an "Overdue" filter tab or badge to the existing status filters on `TimesheetsListPage.jsx`. Overdue timesheets show a red "Overdue" badge instead of the normal gray "Draft" badge.

## Technical Notes

- `node-cron` is added as a dependency to the server package
- The cron job is initialized in `server/src/index.js` after the server starts
- The cron logic lives in a new file: `server/src/jobs/timesheetReminders.js`
- Uses existing `notificationService.sendEmail()` — no new email infrastructure needed
- The cron runs in the same process as the server (Railway single-service deployment)
- If the server restarts mid-week, no harm — the job only fires Sunday 6 AM and checks for already-sent reminders

## Edge Cases

- **Employee has no User account or email**: Skip silently, log a warning
- **Multiple timesheets for same PCA (multiple clients)**: Send one email per overdue timesheet
- **Timesheet created after Sunday reminder**: Won't be caught until next Sunday — acceptable since it means the PCA started late
- **Server timezone**: Use UTC; 6:00 AM UTC is reasonable for US-based operations (adjust via env var `REMINDER_HOUR` if needed)
- **Draft timesheet from weeks ago**: Still shows as overdue in the UI. Gets exactly one reminder email (the first Sunday after the cron runs and finds it unreminded). No repeated emails.
