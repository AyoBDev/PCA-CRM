# Task Management & Workflow Automation — Design Spec

## Overview

A module that enables admins to create and assign tasks with due dates and urgency levels, plus a cron-based trigger engine that auto-creates tasks from system events (authorization expiry, overdue timesheets, credential expiry). Includes admin-configurable trigger thresholds, email reminders, and in-app notifications.

## Decisions

- **Task creation:** Admins only (+ system auto-generation)
- **Assignment:** To a specific user OR to a role (shared queue)
- **Urgency:** Three-tier — low / medium / high
- **Triggers:** Authorization expiry, timesheet overdue, credential expiry
- **Trigger config:** Admin-configurable via Settings UI (toggle, threshold days, urgency, default assignee)
- **Reminders:** In-app badges + email (daily at 8 AM for tasks due today/tomorrow)
- **Architecture:** Lightweight cron-based (hourly trigger evaluation), no event bus
- **Notes:** Single notes field per task (no comment thread)

## Data Model

### Task

```prisma
model Task {
  id              Int       @id @default(autoincrement())
  title           String
  description     String?
  notes           String?
  status          String    @default("open") // open, in_progress, completed, cancelled
  urgency         String    @default("medium") // low, medium, high
  dueDate         DateTime?
  assignedToUserId Int?
  assignedToRole  String?   // admin, pca
  entityType      String?   // Authorization, Timesheet, Employee
  entityId        Int?
  triggerId       Int?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  assignedToUser  User?     @relation(fields: [assignedToUserId], references: [id])
  trigger         WorkflowTrigger? @relation(fields: [triggerId], references: [id])

  reminders       TaskReminder[]

  @@map("tasks")
}
```

### WorkflowTrigger

```prisma
model WorkflowTrigger {
  id              Int       @id @default(autoincrement())
  name            String    // Display name, e.g. "Authorization Expiry Warning"
  type            String    // auth_expiry, timesheet_overdue, credential_expiry
  enabled         Boolean   @default(true)
  thresholdDays   Int       // Days before event to fire
  urgency         String    @default("medium") // Urgency assigned to created tasks
  assignToRole    String?   // Default role assignment
  assignToUserId  Int?      // Default user assignment
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tasks           Task[]
  assignToUser    User?     @relation(fields: [assignToUserId], references: [id])

  @@map("workflow_triggers")
}
```

### TaskReminder

```prisma
model TaskReminder {
  id        Int       @id @default(autoincrement())
  taskId    Int
  sentAt    DateTime  @default(now())
  channel   String    // email
  status    String    // sent, failed

  task      Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@map("task_reminders")
}
```

### Deduplication

Before creating a task from a trigger, query for existing task where:
- `triggerId` matches
- `entityType` + `entityId` match
- `status` is `open` or `in_progress`

If found, skip creation.

## API Endpoints

### Task CRUD

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/tasks` | admin | List with filters: status, urgency, assignedToUserId, assignedToRole, dueDate range, entityType, entityId |
| GET | `/api/tasks/:id` | admin | Single task with assignedToUser and trigger info |
| POST | `/api/tasks` | admin | Create task manually |
| PATCH | `/api/tasks/:id` | admin | Update status, assignee, notes, urgency, due date |
| DELETE | `/api/tasks/:id` | admin | Set status to cancelled |
| PATCH | `/api/tasks/bulk-update` | admin | Bulk status change |

### Task Summary (Dashboard)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/tasks/summary` | admin | Returns: overdue count, due today, due this week, open total, by urgency breakdown |

### Workflow Triggers

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/workflow-triggers` | admin | List all triggers |
| PATCH | `/api/workflow-triggers/:id` | admin | Update: enabled, thresholdDays, urgency, assignToRole, assignToUserId |

## Cron Jobs

### Task Trigger Job — hourly (`0 * * * *`)

Located at `server/src/jobs/taskTriggers.js`.

1. Fetch all enabled `WorkflowTrigger` records
2. For each trigger type, evaluate:

**`auth_expiry`:**
- Find authorizations where `endDate` minus `thresholdDays` <= now AND `endDate` > now
- Exclude if open task already exists for that auth+trigger

**`timesheet_overdue`:**
- Find timesheets with status `draft` where the week's Saturday 23:59:59 has passed
- Exclude if open task already exists for that timesheet+trigger

**`credential_expiry`:**
- Check Employee date fields: `idExpDate`, `tbDueDate`, `cprDueDate`, `trainingDueDate`, `backgroundCheckDueDate`
- Check `EmployeeCertification` records with `expirationDate`
- Find where expiry date minus `thresholdDays` <= now AND expiry date > now AND employee is active
- Exclude if open task already exists for that employee+trigger+specific credential type
- Creates one task per expiring credential (not one per employee)

3. Create tasks with:
   - Title: auto-generated from template (e.g., "Authorization expiring: {clientName} - {serviceCode}")
   - Urgency: from trigger config
   - Assignment: from trigger config (user or role)
   - Due date: the expiry/deadline date
   - Entity link: `entityType` + `entityId`
   - Trigger link: `triggerId`

### Task Reminder Job — daily at 8 AM (`0 8 * * *`)

Located at `server/src/jobs/taskReminders.js`.

1. Find tasks where `status` is `open` or `in_progress` AND `dueDate` is today or tomorrow
2. Exclude tasks that already have a `TaskReminder` record for today
3. Resolve email recipient: `assignedToUser.email` or all users with `assignedToRole`
4. Send email via `notificationService.sendEmail()`
5. Record `TaskReminder` with status `sent` or `failed`

## Frontend

### Tasks Page (`/tasks`)

New sidebar item with badge showing open task count for current user.

**Layout:**
- Header: "Tasks" + "New Task" button
- Filter row: Status dropdown, Urgency dropdown, Assignee dropdown, Due date range
- Table: Title, Status (badge), Urgency (colored badge: gray/yellow/red), Assigned to, Due date, Entity link, Created date
- Row click: Inline detail panel with notes field, status buttons, entity link
- Bulk actions: checkbox select + "Mark Complete" / "Cancel"
- Pagination: 25 per page

### Dashboard Widget

New card in the "Needs Attention" area of DashboardPage:
- Overdue count (red), Due today (yellow), Total open
- Each count clickable → navigates to Tasks page with filter applied

### Create/Edit Task Modal

Fields:
- Title (required)
- Description (optional textarea)
- Urgency (dropdown: low/medium/high)
- Due date (date picker)
- Assign to user (searchable dropdown) OR Assign to role (dropdown)
- Notes (textarea)
- Link to entity (optional: searchable client/authorization/employee picker)

### Settings — Workflow Triggers

New section in Admin & System Configuration page:
- Table: Name, Type, Enabled (toggle), Threshold (editable number input + "days" label), Urgency (dropdown), Default assignee (dropdown)
- Inline editing, auto-save on change

### Entity Integration

- Client detail page / Authorization section: "Related Tasks" list if open tasks exist for that entity
- Employee detail page: same pattern

## Notifications & Audit

### Email

- Uses existing `notificationService.sendEmail()` (Brevo)
- Template: plain text with task title, urgency, due date, link to Tasks page
- Sent to assigned user or all users in assigned role

### In-App

- Sidebar "Tasks" item: red badge with count of open tasks assigned to current user (or their role)
- Login toast: "You have X overdue tasks" if any exist

### Audit Logging

All task mutations logged via `audit.logAction()`:
- Actions: CREATE, UPDATE, CANCEL, COMPLETE
- `entityType: 'Task'`
- Auto-created tasks include metadata: `{ trigger: triggerType, source: 'system' }`

## Seed Data

Default workflow triggers seeded on first deploy:

| Name | Type | Threshold | Urgency | Enabled |
|------|------|-----------|---------|---------|
| Authorization Expiry Warning | auth_expiry | 30 | high | true |
| Overdue Timesheet Follow-up | timesheet_overdue | 1 | medium | true |
| Credential Expiry Warning | credential_expiry | 14 | high | true |

## File Structure

```
server/src/
  controllers/taskController.js
  controllers/workflowTriggerController.js
  services/taskService.js
  jobs/taskTriggers.js
  jobs/taskReminders.js

client/src/
  pages/TasksPage.jsx
  components/tasks/TaskModal.jsx
  components/tasks/TaskDetailPanel.jsx
  components/dashboard/TasksWidget.jsx
```

## Out of Scope (Future)

- Comment threads on tasks
- Real-time event triggers (inline controller hooks)
- PCA-created tasks
- Task templates
- Recurring tasks
- SMS reminders
