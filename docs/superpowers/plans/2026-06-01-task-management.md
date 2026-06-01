# Task Management & Workflow Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a task management system where admins create/assign tasks with urgency levels, and a cron engine auto-creates tasks from authorization expiry, overdue timesheets, and credential expiry events.

**Architecture:** Lightweight cron-based trigger engine (hourly scan). Tasks are a CRUD resource with status workflow (`open` → `in_progress` → `completed` / `cancelled`). WorkflowTrigger records store admin-configurable thresholds. Email reminders sent daily for approaching due dates.

**Tech Stack:** Express.js, Prisma ORM, PostgreSQL, node-cron, Brevo email (existing), React 19 + Vite frontend.

---

## File Structure

```
server/
  prisma/schema.prisma              — Add Task, WorkflowTrigger, TaskReminder models + User relations
  prisma/seed.js                    — Add default workflow trigger seeding
  src/controllers/taskController.js — CRUD + summary + bulk-update endpoints
  src/controllers/workflowTriggerController.js — List + patch triggers
  src/services/taskService.js       — Business logic: dedup check, title generation, trigger evaluation
  src/jobs/taskTriggers.js          — Hourly cron: evaluate triggers → create tasks
  src/jobs/taskReminders.js         — Daily cron: send email reminders for approaching due dates
  src/routes/api.js                 — Register new routes
  src/index.js                      — Register new cron jobs
  src/services/__tests__/taskService.test.js — Unit tests for service logic

client/
  src/api.js                        — Add task + workflow-trigger API functions
  src/pages/TasksPage.jsx           — Full tasks list page with filters, table, inline detail
  src/components/tasks/TaskModal.jsx — Create/edit task modal
  src/components/tasks/TasksWidget.jsx — Dashboard summary widget
  src/components/layout/Sidebar.jsx — Add Tasks nav item with badge
  src/App.jsx                       — Add /tasks route
```

---

### Task 1: Database Schema — Prisma Models

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add Task model to schema.prisma**

Add after the last model in the file:

```prisma
model Task {
  id               Int       @id @default(autoincrement())
  title            String
  description      String    @default("") @map("description")
  notes            String    @default("") @map("notes")
  status           String    @default("open") @map("status")
  urgency          String    @default("medium") @map("urgency")
  dueDate          DateTime? @map("due_date")
  assignedToUserId Int?      @map("assigned_to_user_id")
  assignedToRole   String?   @map("assigned_to_role")
  entityType       String?   @map("entity_type")
  entityId         Int?      @map("entity_id")
  triggerId        Int?      @map("trigger_id")
  completedAt      DateTime? @map("completed_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  assignedToUser User?            @relation("TaskAssignee", fields: [assignedToUserId], references: [id])
  trigger        WorkflowTrigger? @relation(fields: [triggerId], references: [id])
  reminders      TaskReminder[]

  @@index([status])
  @@index([assignedToUserId])
  @@index([triggerId, entityType, entityId])
  @@map("tasks")
}

model WorkflowTrigger {
  id             Int      @id @default(autoincrement())
  name           String
  type           String
  enabled        Boolean  @default(true)
  thresholdDays  Int      @map("threshold_days")
  urgency        String   @default("medium")
  assignToRole   String?  @map("assign_to_role")
  assignToUserId Int?     @map("assign_to_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  tasks        Task[]
  assignToUser User? @relation("TriggerAssignee", fields: [assignToUserId], references: [id])

  @@map("workflow_triggers")
}

model TaskReminder {
  id      Int      @id @default(autoincrement())
  taskId  Int      @map("task_id")
  sentAt  DateTime @default(now()) @map("sent_at")
  channel String
  status  String

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@map("task_reminders")
}
```

- [ ] **Step 2: Add relations to User model**

In the existing `User` model, add these two relation fields before the closing `}`:

```prisma
  assignedTasks   Task[]            @relation("TaskAssignee")
  triggerDefaults WorkflowTrigger[] @relation("TriggerAssignee")
```

- [ ] **Step 3: Run the migration**

Run: `cd server && npx prisma migrate dev --name add_task_management`

Expected: Migration created and applied successfully. New tables `tasks`, `workflow_triggers`, `task_reminders` created.

- [ ] **Step 4: Verify schema**

Run: `cd server && npx prisma db pull --print | grep -A 2 "tasks\|workflow_triggers\|task_reminders"`

Expected: All three tables appear in output.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(tasks): add Task, WorkflowTrigger, TaskReminder schema"
```

---

### Task 2: Seed Default Workflow Triggers

**Files:**
- Modify: `server/prisma/seed.js`

- [ ] **Step 1: Add workflow trigger seeding to seed.js**

Add this block after the insurance types seeding (before `main()` closing):

```javascript
    // Seed default workflow triggers
    const defaultTriggers = [
        { name: 'Authorization Expiry Warning', type: 'auth_expiry', thresholdDays: 30, urgency: 'high' },
        { name: 'Overdue Timesheet Follow-up', type: 'timesheet_overdue', thresholdDays: 1, urgency: 'medium' },
        { name: 'Credential Expiry Warning', type: 'credential_expiry', thresholdDays: 14, urgency: 'high' },
    ];
    for (const trigger of defaultTriggers) {
        const existing = await prisma.workflowTrigger.findFirst({ where: { type: trigger.type } });
        if (!existing) {
            await prisma.workflowTrigger.create({ data: trigger });
        }
    }
    console.log('✅ Workflow triggers seeded');
```

- [ ] **Step 2: Run the seed**

Run: `cd server && npm run db:seed`

Expected: Output includes "✅ Workflow triggers seeded"

- [ ] **Step 3: Verify triggers exist**

Run: `cd server && npx prisma studio` (or use: `node -e "const p=require('./src/lib/prisma');p.workflowTrigger.findMany().then(r=>{console.log(r);p.\$disconnect()})"`)

Expected: 3 trigger records in database.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.js
git commit -m "feat(tasks): seed default workflow triggers"
```

---

### Task 3: Task Service — Business Logic

**Files:**
- Create: `server/src/services/taskService.js`
- Create: `server/src/services/__tests__/taskService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/__tests__/taskService.test.js`:

```javascript
const { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS } = require('../taskService');

describe('generateTaskTitle', () => {
    test('auth_expiry generates title with client and service', () => {
        const result = generateTaskTitle('auth_expiry', {
            clientName: 'John Smith',
            serviceCode: 'PCS',
        });
        expect(result).toBe('Authorization expiring: John Smith - PCS');
    });

    test('timesheet_overdue generates title with PCA and client', () => {
        const result = generateTaskTitle('timesheet_overdue', {
            pcaName: 'Jane Doe',
            clientName: 'Bob Wilson',
        });
        expect(result).toBe('Overdue timesheet: Jane Doe - Bob Wilson');
    });

    test('credential_expiry generates title with employee and credential', () => {
        const result = generateTaskTitle('credential_expiry', {
            employeeName: 'Jane Doe',
            credentialType: 'CPR Certification',
        });
        expect(result).toBe('Credential expiring: Jane Doe - CPR Certification');
    });

    test('unknown type returns generic title', () => {
        const result = generateTaskTitle('unknown', { name: 'test' });
        expect(result).toBe('Task: unknown');
    });
});

describe('shouldCreateTask', () => {
    test('returns true when no existing task matches', () => {
        const existingTasks = [];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });

    test('returns false when open task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'open' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(false);
    });

    test('returns false when in_progress task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'in_progress' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(false);
    });

    test('returns true when only completed task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'completed' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });

    test('returns true when task exists for different entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 99, status: 'open' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });
});

describe('CREDENTIAL_FIELDS', () => {
    test('contains expected employee date fields', () => {
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'idExpDate', label: 'ID' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'tbDueDate', label: 'TB Test' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'cprDueDate', label: 'CPR Certification' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'trainingDueDate', label: 'Training' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'backgroundCheckDueDate', label: 'Background Check' });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest --testPathPattern=taskService --verbose`

Expected: All tests FAIL with "Cannot find module '../taskService'"

- [ ] **Step 3: Implement the task service**

Create `server/src/services/taskService.js`:

```javascript
const CREDENTIAL_FIELDS = [
    { field: 'idExpDate', label: 'ID' },
    { field: 'tbDueDate', label: 'TB Test' },
    { field: 'cprDueDate', label: 'CPR Certification' },
    { field: 'trainingDueDate', label: 'Training' },
    { field: 'backgroundCheckDueDate', label: 'Background Check' },
];

function generateTaskTitle(triggerType, context) {
    switch (triggerType) {
        case 'auth_expiry':
            return `Authorization expiring: ${context.clientName} - ${context.serviceCode}`;
        case 'timesheet_overdue':
            return `Overdue timesheet: ${context.pcaName} - ${context.clientName}`;
        case 'credential_expiry':
            return `Credential expiring: ${context.employeeName} - ${context.credentialType}`;
        default:
            return `Task: ${triggerType}`;
    }
}

function shouldCreateTask(existingTasks, triggerId, entityType, entityId) {
    return !existingTasks.some(
        (t) =>
            t.triggerId === triggerId &&
            t.entityType === entityType &&
            t.entityId === entityId &&
            (t.status === 'open' || t.status === 'in_progress')
    );
}

module.exports = { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest --testPathPattern=taskService --verbose`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskService.js server/src/services/__tests__/taskService.test.js
git commit -m "feat(tasks): add task service with title generation and dedup logic"
```

---

### Task 4: Task Controller — CRUD Endpoints

**Files:**
- Create: `server/src/controllers/taskController.js`

- [ ] **Step 1: Create taskController.js**

Create `server/src/controllers/taskController.js`:

```javascript
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

async function listTasks(req, res, next) {
    try {
        const { status, urgency, assignedToUserId, assignedToRole, entityType, entityId, dueBefore, dueAfter, page = 1 } = req.query;
        const limit = 25;
        const skip = (Number(page) - 1) * limit;

        const where = {};
        if (status) where.status = status;
        if (urgency) where.urgency = urgency;
        if (assignedToUserId) where.assignedToUserId = Number(assignedToUserId);
        if (assignedToRole) where.assignedToRole = assignedToRole;
        if (entityType) where.entityType = entityType;
        if (entityId) where.entityId = Number(entityId);
        if (dueBefore || dueAfter) {
            where.dueDate = {};
            if (dueBefore) where.dueDate.lte = new Date(dueBefore);
            if (dueAfter) where.dueDate.gte = new Date(dueAfter);
        }

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
                orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
                skip,
                take: limit,
            }),
            prisma.task.count({ where }),
        ]);

        res.json({ tasks, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const task = await prisma.task.findUnique({
            where: { id: Number(req.params.id) },
            include: {
                assignedToUser: { select: { id: true, name: true, email: true, role: true } },
                trigger: true,
            },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function createTask(req, res, next) {
    try {
        const { title, description, notes, urgency, dueDate, assignedToUserId, assignedToRole, entityType, entityId } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const data = {
            title,
            description: description || '',
            notes: notes || '',
            urgency: urgency || 'medium',
            assignedToRole: assignedToRole || null,
            entityType: entityType || null,
            entityId: entityId ? Number(entityId) : null,
        };
        if (dueDate) data.dueDate = new Date(dueDate);
        if (assignedToUserId) data.assignedToUserId = Number(assignedToUserId);

        const task = await prisma.task.create({
            data,
            include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
        });

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes: [],
            metadata: {},
        });

        res.status(201).json(task);
    } catch (err) {
        next(err);
    }
}

async function updateTask(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        const { title, description, notes, status, urgency, dueDate, assignedToUserId, assignedToRole } = req.body;
        const data = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (notes !== undefined) data.notes = notes;
        if (urgency !== undefined) data.urgency = urgency;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (assignedToUserId !== undefined) data.assignedToUserId = assignedToUserId ? Number(assignedToUserId) : null;
        if (assignedToRole !== undefined) data.assignedToRole = assignedToRole || null;

        if (status !== undefined) {
            data.status = status;
            if (status === 'completed' && existing.status !== 'completed') {
                data.completedAt = new Date();
            }
            if (status !== 'completed') {
                data.completedAt = null;
            }
        }

        const task = await prisma.task.update({
            where: { id },
            data,
            include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
        });

        const changes = audit.diffFields(existing, task, ['title', 'status', 'urgency', 'assignedToUserId', 'assignedToRole', 'notes']);
        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: status === 'completed' ? 'COMPLETE' : status === 'cancelled' ? 'CANCEL' : 'UPDATE',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes,
            metadata: {},
        });

        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function deleteTask(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        const task = await prisma.task.update({
            where: { id },
            data: { status: 'cancelled' },
        });

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CANCEL',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes: [{ field: 'status', oldValue: existing.status, newValue: 'cancelled' }],
            metadata: {},
        });

        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function bulkUpdateTasks(req, res, next) {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || !status) {
            return res.status(400).json({ error: 'ids (array) and status are required' });
        }

        const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const data = { status };
        if (status === 'completed') data.completedAt = new Date();
        if (status !== 'completed') data.completedAt = null;

        await prisma.task.updateMany({
            where: { id: { in: ids.map(Number) } },
            data,
        });

        for (const id of ids) {
            audit.logAction({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: status === 'completed' ? 'COMPLETE' : status === 'cancelled' ? 'CANCEL' : 'UPDATE',
                entityType: 'Task',
                entityId: Number(id),
                entityName: '',
                changes: [{ field: 'status', oldValue: '', newValue: status }],
                metadata: { bulk: true },
            });
        }

        res.json({ updated: ids.length });
    } catch (err) {
        next(err);
    }
}

async function getTaskSummary(req, res, next) {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const [overdue, dueToday, dueThisWeek, totalOpen, byUrgency] = await Promise.all([
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { lt: todayStart } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { gte: todayStart, lt: todayEnd } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { gte: todayStart, lt: weekEnd } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] } },
            }),
            prisma.task.groupBy({
                by: ['urgency'],
                where: { status: { in: ['open', 'in_progress'] } },
                _count: true,
            }),
        ]);

        const urgencyMap = {};
        for (const row of byUrgency) {
            urgencyMap[row.urgency] = row._count;
        }

        res.json({ overdue, dueToday, dueThisWeek, totalOpen, byUrgency: urgencyMap });
    } catch (err) {
        next(err);
    }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, bulkUpdateTasks, getTaskSummary };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/controllers/taskController.js
git commit -m "feat(tasks): add task controller with CRUD, bulk-update, and summary"
```

---

### Task 5: Workflow Trigger Controller

**Files:**
- Create: `server/src/controllers/workflowTriggerController.js`

- [ ] **Step 1: Create workflowTriggerController.js**

Create `server/src/controllers/workflowTriggerController.js`:

```javascript
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

async function listWorkflowTriggers(req, res, next) {
    try {
        const triggers = await prisma.workflowTrigger.findMany({
            include: { assignToUser: { select: { id: true, name: true, email: true } } },
            orderBy: { id: 'asc' },
        });
        res.json(triggers);
    } catch (err) {
        next(err);
    }
}

async function updateWorkflowTrigger(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.workflowTrigger.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Trigger not found' });

        const { enabled, thresholdDays, urgency, assignToRole, assignToUserId } = req.body;
        const data = {};
        if (enabled !== undefined) data.enabled = enabled;
        if (thresholdDays !== undefined) data.thresholdDays = Number(thresholdDays);
        if (urgency !== undefined) data.urgency = urgency;
        if (assignToRole !== undefined) data.assignToRole = assignToRole || null;
        if (assignToUserId !== undefined) data.assignToUserId = assignToUserId ? Number(assignToUserId) : null;

        const trigger = await prisma.workflowTrigger.update({
            where: { id },
            data,
            include: { assignToUser: { select: { id: true, name: true, email: true } } },
        });

        const changes = audit.diffFields(existing, trigger, ['enabled', 'thresholdDays', 'urgency', 'assignToRole', 'assignToUserId']);
        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE',
            entityType: 'WorkflowTrigger',
            entityId: trigger.id,
            entityName: trigger.name,
            changes,
            metadata: {},
        });

        res.json(trigger);
    } catch (err) {
        next(err);
    }
}

module.exports = { listWorkflowTriggers, updateWorkflowTrigger };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/controllers/workflowTriggerController.js
git commit -m "feat(tasks): add workflow trigger controller"
```

---

### Task 6: Register API Routes

**Files:**
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Add imports at the top of api.js**

After the existing controller imports (near line 143, before `const { authenticate, requireRole }`), add:

```javascript
const { listTasks, getTask, createTask, updateTask, deleteTask, bulkUpdateTasks, getTaskSummary } = require('../controllers/taskController');
const { listWorkflowTriggers, updateWorkflowTrigger } = require('../controllers/workflowTriggerController');
```

- [ ] **Step 2: Add routes**

After the audit log routes (near line 352, before `module.exports = router;`), add:

```javascript
// Tasks (admin only)
router.get('/tasks/summary', requireRole('admin'), getTaskSummary);
router.get('/tasks', requireRole('admin'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin'), getTask);
router.post('/tasks', requireRole('admin'), createTask);
router.patch('/tasks/:id', requireRole('admin'), updateTask);
router.delete('/tasks/:id', requireRole('admin'), deleteTask);

// Workflow Triggers (admin only)
router.get('/workflow-triggers', requireRole('admin'), listWorkflowTriggers);
router.patch('/workflow-triggers/:id', requireRole('admin'), updateWorkflowTrigger);
```

Note: `/tasks/summary` and `/tasks/bulk-update` must come BEFORE `/tasks/:id` to avoid the `:id` param capturing "summary" or "bulk-update".

- [ ] **Step 3: Verify server starts without errors**

Run: `cd server && node -e "require('./src/routes/api');" && echo "OK"`

Expected: "OK" (no import errors)

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/api.js
git commit -m "feat(tasks): register task and workflow trigger routes"
```

---

### Task 7: Task Trigger Cron Job

**Files:**
- Create: `server/src/jobs/taskTriggers.js`

- [ ] **Step 1: Create taskTriggers.js**

Create `server/src/jobs/taskTriggers.js`:

```javascript
const prisma = require('../lib/prisma');
const { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS } = require('../services/taskService');
const { isOverdue } = require('../lib/timesheetUtils');
const audit = require('../services/auditService');

async function evaluateAuthExpiry(trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const authorizations = await prisma.authorization.findMany({
        where: {
            authorizationEndDate: { gt: now, lte: thresholdDate },
            archivedAt: null,
        },
        include: { client: true },
    });

    const tasksToCreate = [];
    for (const auth of authorizations) {
        if (!shouldCreateTask(existingTasks, trigger.id, 'Authorization', auth.id)) continue;
        tasksToCreate.push({
            title: generateTaskTitle('auth_expiry', {
                clientName: auth.client.clientName,
                serviceCode: auth.serviceCode,
            }),
            urgency: trigger.urgency,
            dueDate: auth.authorizationEndDate,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Authorization',
            entityId: auth.id,
            triggerId: trigger.id,
        });
    }
    return tasksToCreate;
}

async function evaluateTimesheetOverdue(trigger, existingTasks) {
    const overdueTimesheets = await prisma.timesheet.findMany({
        where: {
            status: 'draft',
            archivedAt: null,
        },
        include: { client: true },
    });

    const actuallyOverdue = overdueTimesheets.filter(isOverdue);

    const tasksToCreate = [];
    for (const ts of actuallyOverdue) {
        if (!shouldCreateTask(existingTasks, trigger.id, 'Timesheet', ts.id)) continue;
        tasksToCreate.push({
            title: generateTaskTitle('timesheet_overdue', {
                pcaName: ts.pcaName,
                clientName: ts.client.clientName,
            }),
            urgency: trigger.urgency,
            dueDate: null,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Timesheet',
            entityId: ts.id,
            triggerId: trigger.id,
        });
    }
    return tasksToCreate;
}

async function evaluateCredentialExpiry(trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const employees = await prisma.employee.findMany({
        where: { archivedAt: null, status: 'active' },
    });

    const tasksToCreate = [];

    for (const emp of employees) {
        for (const { field, label } of CREDENTIAL_FIELDS) {
            const expiryDate = emp[field];
            if (!expiryDate) continue;
            if (expiryDate <= now || expiryDate > thresholdDate) continue;

            const dedupEntityId = emp.id * 100 + CREDENTIAL_FIELDS.findIndex((f) => f.field === field);
            if (!shouldCreateTask(existingTasks, trigger.id, 'Employee', dedupEntityId)) continue;

            tasksToCreate.push({
                title: generateTaskTitle('credential_expiry', {
                    employeeName: emp.name,
                    credentialType: label,
                }),
                urgency: trigger.urgency,
                dueDate: expiryDate,
                assignedToUserId: trigger.assignToUserId,
                assignedToRole: trigger.assignToRole,
                entityType: 'Employee',
                entityId: dedupEntityId,
                triggerId: trigger.id,
            });
        }
    }

    // Also check EmployeeCertification records
    const certifications = await prisma.employeeCertification.findMany({
        where: {
            expirationDate: { gt: now, lte: thresholdDate },
            status: 'active',
        },
        include: { employee: true },
    });

    for (const cert of certifications) {
        if (!cert.employee || cert.employee.archivedAt) continue;
        const dedupEntityId = cert.employee.id * 100 + 50 + cert.id;
        if (!shouldCreateTask(existingTasks, trigger.id, 'Employee', dedupEntityId)) continue;

        tasksToCreate.push({
            title: generateTaskTitle('credential_expiry', {
                employeeName: cert.employee.name,
                credentialType: cert.certType,
            }),
            urgency: trigger.urgency,
            dueDate: cert.expirationDate,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Employee',
            entityId: dedupEntityId,
            triggerId: trigger.id,
        });
    }

    return tasksToCreate;
}

async function runTaskTriggers() {
    const triggers = await prisma.workflowTrigger.findMany({ where: { enabled: true } });
    if (triggers.length === 0) {
        console.log('[TaskTriggers] No enabled triggers, skipping.');
        return { created: 0 };
    }

    const existingTasks = await prisma.task.findMany({
        where: { status: { in: ['open', 'in_progress'] } },
        select: { triggerId: true, entityType: true, entityId: true, status: true },
    });

    let created = 0;

    for (const trigger of triggers) {
        let tasksToCreate = [];
        try {
            switch (trigger.type) {
                case 'auth_expiry':
                    tasksToCreate = await evaluateAuthExpiry(trigger, existingTasks);
                    break;
                case 'timesheet_overdue':
                    tasksToCreate = await evaluateTimesheetOverdue(trigger, existingTasks);
                    break;
                case 'credential_expiry':
                    tasksToCreate = await evaluateCredentialExpiry(trigger, existingTasks);
                    break;
                default:
                    console.log(`[TaskTriggers] Unknown trigger type: ${trigger.type}`);
            }
        } catch (err) {
            console.error(`[TaskTriggers] Error evaluating trigger ${trigger.name}:`, err.message);
            continue;
        }

        for (const taskData of tasksToCreate) {
            try {
                const task = await prisma.task.create({ data: taskData });
                audit.logAction({
                    userId: 0,
                    userName: 'System',
                    userRole: 'system',
                    action: 'CREATE',
                    entityType: 'Task',
                    entityId: task.id,
                    entityName: task.title,
                    changes: [],
                    metadata: { trigger: trigger.type, source: 'system' },
                });
                created++;
            } catch (err) {
                console.error(`[TaskTriggers] Failed to create task "${taskData.title}":`, err.message);
            }
        }
    }

    console.log(`[TaskTriggers] Done. Created: ${created}`);
    return { created };
}

module.exports = { runTaskTriggers };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/jobs/taskTriggers.js
git commit -m "feat(tasks): add task trigger cron job with auth, timesheet, credential evaluation"
```

---

### Task 8: Task Reminder Cron Job

**Files:**
- Create: `server/src/jobs/taskReminders.js`

- [ ] **Step 1: Create taskReminders.js**

Create `server/src/jobs/taskReminders.js`:

```javascript
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');

async function sendTaskReminders() {
    if (!isEmailConfigured()) {
        console.log('[TaskReminders] Email not configured, skipping.');
        return { sent: 0, skipped: 0 };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowEnd = new Date(todayStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

    const todayStr = todayStart.toISOString().split('T')[0];

    const tasks = await prisma.task.findMany({
        where: {
            status: { in: ['open', 'in_progress'] },
            dueDate: { gte: todayStart, lt: tomorrowEnd },
        },
        include: {
            assignedToUser: { select: { id: true, name: true, email: true } },
            reminders: {
                where: { sentAt: { gte: todayStart } },
            },
        },
    });

    let sent = 0;
    let skipped = 0;

    for (const task of tasks) {
        if (task.reminders.length > 0) {
            skipped++;
            continue;
        }

        let recipients = [];
        if (task.assignedToUser?.email) {
            recipients.push(task.assignedToUser.email);
        } else if (task.assignedToRole) {
            const users = await prisma.user.findMany({
                where: { role: task.assignedToRole, active: true, archivedAt: null },
                select: { email: true },
            });
            recipients = users.map((u) => u.email).filter(Boolean);
        }

        if (recipients.length === 0) {
            skipped++;
            continue;
        }

        const urgencyLabel = task.urgency.charAt(0).toUpperCase() + task.urgency.slice(1);
        const dueLabel = task.dueDate.toISOString().split('T')[0] === todayStr ? 'today' : 'tomorrow';
        const appUrl = process.env.APP_URL || 'https://nvbestpca.com';

        const subject = `Task Reminder: "${task.title}" is due ${dueLabel}`;
        const html = `
            <p>You have a task due <strong>${dueLabel}</strong>:</p>
            <p><strong>${task.title}</strong></p>
            <p>Urgency: ${urgencyLabel}<br>Due: ${task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            ${task.description ? `<p>${task.description}</p>` : ''}
            <p><a href="${appUrl}/tasks">View Tasks</a></p>
            <p>— NV Best PCA</p>
        `;

        for (const email of recipients) {
            try {
                await sendEmail(email, subject, html);
                await prisma.taskReminder.create({
                    data: { taskId: task.id, channel: 'email', status: 'sent' },
                });
                sent++;
            } catch (err) {
                console.error(`[TaskReminders] Failed to send to ${email}:`, err.message);
                await prisma.taskReminder.create({
                    data: { taskId: task.id, channel: 'email', status: 'failed' },
                });
                skipped++;
            }
        }
    }

    console.log(`[TaskReminders] Done. Sent: ${sent}, Skipped: ${skipped}`);
    return { sent, skipped };
}

module.exports = { sendTaskReminders };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/jobs/taskReminders.js
git commit -m "feat(tasks): add daily task reminder email job"
```

---

### Task 9: Register Cron Jobs

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Add imports and cron schedules to index.js**

Add the import at the top (after the existing `sendOverdueReminders` require):

```javascript
const { runTaskTriggers } = require('./jobs/taskTriggers');
const { sendTaskReminders } = require('./jobs/taskReminders');
```

Inside the `app.listen` callback, after the existing cron schedule, add:

```javascript
    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Running task triggers...');
        try {
            await runTaskTriggers();
        } catch (err) {
            console.error('[Cron] Task triggers job failed:', err);
        }
    }, { timezone: 'UTC' });

    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running task reminders...');
        try {
            await sendTaskReminders();
        } catch (err) {
            console.error('[Cron] Task reminders job failed:', err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: task triggers (hourly)');
    console.log('[Cron] Scheduled: task reminders (daily 8:00 AM UTC)');
```

- [ ] **Step 2: Verify server starts**

Run: `cd server && timeout 3 node src/index.js 2>&1 || true`

Expected: Output includes "Scheduled: task triggers" and "Scheduled: task reminders" (server starts, then times out).

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat(tasks): register hourly trigger and daily reminder cron jobs"
```

---

### Task 10: Frontend API Client Functions

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add task and workflow trigger API functions**

Append to the end of `client/src/api.js` (before the closing of the file):

```javascript
// ── Tasks ──
export const listTasks = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/tasks${qs ? '?' + qs : ''}`);
};

export const getTask = (id) => request(`/tasks/${id}`);

export const getTaskSummary = () => request('/tasks/summary');

export const createTask = (data) =>
    request('/tasks', { method: 'POST', body: JSON.stringify(data) });

export const updateTask = (id, data) =>
    request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteTask = (id) =>
    request(`/tasks/${id}`, { method: 'DELETE' });

export const bulkUpdateTasks = (ids, status) =>
    request('/tasks/bulk-update', { method: 'PATCH', body: JSON.stringify({ ids, status }) });

// ── Workflow Triggers ──
export const listWorkflowTriggers = () => request('/workflow-triggers');

export const updateWorkflowTrigger = (id, data) =>
    request(`/workflow-triggers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat(tasks): add frontend API functions for tasks and triggers"
```

---

### Task 11: Tasks Page — Frontend

**Files:**
- Create: `client/src/pages/TasksPage.jsx`

- [ ] **Step 1: Create TasksPage.jsx**

Create `client/src/pages/TasksPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { listTasks, updateTask, deleteTask, bulkUpdateTasks, listUsers } from '../api';
import { useToast } from '../hooks/useToast';
import TaskModal from '../components/tasks/TaskModal';
import Icons from '../components/common/Icons';
import Pagination from '../components/common/Pagination';

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'completed', 'cancelled'];
const URGENCY_OPTIONS = ['all', 'low', 'medium', 'high'];

const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const URGENCY_COLORS = { low: '#71717a', medium: '#ca8a04', high: '#dc2626' };

export default function TasksPage() {
    const { showToast } = useToast();
    const [tasks, setTasks] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'open', urgency: 'all', assignedToUserId: '' });
    const [selectedIds, setSelectedIds] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [users, setUsers] = useState([]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page };
            if (filters.status !== 'all') params.status = filters.status;
            if (filters.urgency !== 'all') params.urgency = filters.urgency;
            if (filters.assignedToUserId) params.assignedToUserId = filters.assignedToUserId;
            const data = await listTasks(params);
            setTasks(data.tasks);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filters, showToast]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useEffect(() => {
        listUsers().then((data) => setUsers(Array.isArray(data) ? data : data.users || [])).catch(() => {});
    }, []);

    useEffect(() => { setPage(1); }, [filters]);

    const handleStatusChange = async (task, newStatus) => {
        try {
            const updated = await updateTask(task.id, { status: newStatus });
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            showToast(`Task marked as ${STATUS_LABELS[newStatus]}`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDelete = async (task) => {
        try {
            await deleteTask(task.id);
            setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'cancelled' } : t)));
            showToast('Task cancelled');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleBulkAction = async (status) => {
        if (selectedIds.length === 0) return;
        try {
            await bulkUpdateTasks(selectedIds, status);
            showToast(`${selectedIds.length} tasks updated`);
            setSelectedIds([]);
            fetchTasks();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === tasks.length) setSelectedIds([]);
        else setSelectedIds(tasks.map((t) => t.id));
    };

    const handleSaved = () => {
        setModalOpen(false);
        setEditingTask(null);
        fetchTasks();
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const isOverdue = (task) => task.dueDate && new Date(task.dueDate) < new Date() && ['open', 'in_progress'].includes(task.status);

    return (
        <div className="page">
            <div className="page__header">
                <h1>Tasks</h1>
                <button className="btn btn--primary" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
                    {Icons.plus} New Task
                </button>
            </div>

            <div className="filters-row">
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : STATUS_LABELS[s]}</option>)}
                </select>
                <select value={filters.urgency} onChange={(e) => setFilters((f) => ({ ...f, urgency: e.target.value }))}>
                    {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u === 'all' ? 'All Urgency' : u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                </select>
                <select value={filters.assignedToUserId} onChange={(e) => setFilters((f) => ({ ...f, assignedToUserId: e.target.value }))}>
                    <option value="">All Assignees</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>

            {selectedIds.length > 0 && (
                <div className="bulk-actions">
                    <span>{selectedIds.length} selected</span>
                    <button className="btn btn--sm" onClick={() => handleBulkAction('completed')}>Mark Complete</button>
                    <button className="btn btn--sm btn--danger" onClick={() => handleBulkAction('cancelled')}>Cancel</button>
                </div>
            )}

            {loading ? (
                <div className="loading-state">Loading...</div>
            ) : tasks.length === 0 ? (
                <div className="empty-state">No tasks found</div>
            ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" checked={selectedIds.length === tasks.length && tasks.length > 0} onChange={toggleSelectAll} /></th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Urgency</th>
                            <th>Assigned To</th>
                            <th>Due Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((task) => (
                            <tr key={task.id} className={isOverdue(task) ? 'row--overdue' : ''}>
                                <td><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelect(task.id)} /></td>
                                <td>
                                    <button className="link-btn" onClick={() => { setEditingTask(task); setModalOpen(true); }}>
                                        {task.title}
                                    </button>
                                </td>
                                <td><span className={`badge badge--${task.status}`}>{STATUS_LABELS[task.status]}</span></td>
                                <td><span className="urgency-dot" style={{ color: URGENCY_COLORS[task.urgency] }}>{task.urgency}</span></td>
                                <td>{task.assignedToUser?.name || task.assignedToRole || '—'}</td>
                                <td className={isOverdue(task) ? 'text--danger' : ''}>{fmtDate(task.dueDate)}</td>
                                <td>
                                    {task.status === 'open' && (
                                        <button className="btn btn--xs" onClick={() => handleStatusChange(task, 'in_progress')}>Start</button>
                                    )}
                                    {(task.status === 'open' || task.status === 'in_progress') && (
                                        <>
                                            <button className="btn btn--xs btn--success" onClick={() => handleStatusChange(task, 'completed')}>Done</button>
                                            <button className="btn btn--xs btn--danger" onClick={() => handleDelete(task)}>Cancel</button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} />

            {modalOpen && (
                <TaskModal
                    task={editingTask}
                    users={users}
                    onClose={() => { setModalOpen(false); setEditingTask(null); }}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TasksPage.jsx
git commit -m "feat(tasks): add Tasks page with filters, table, bulk actions"
```

---

### Task 12: Task Modal Component

**Files:**
- Create: `client/src/components/tasks/TaskModal.jsx`

- [ ] **Step 1: Create TaskModal.jsx**

Create `client/src/components/tasks/TaskModal.jsx`:

```jsx
import { useState } from 'react';
import { createTask, updateTask } from '../../api';
import { useToast } from '../../hooks/useToast';
import Modal from '../common/Modal';

export default function TaskModal({ task, users, onClose, onSaved }) {
    const { showToast } = useToast();
    const isEdit = !!task;

    const [form, setForm] = useState({
        title: task?.title || '',
        description: task?.description || '',
        notes: task?.notes || '',
        urgency: task?.urgency || 'medium',
        dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        assignedToUserId: task?.assignedToUserId || '',
        assignedToRole: task?.assignedToRole || '',
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (field, value) => {
        setForm((f) => ({ ...f, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }
        setSaving(true);
        try {
            const data = {
                title: form.title.trim(),
                description: form.description.trim(),
                notes: form.notes.trim(),
                urgency: form.urgency,
                dueDate: form.dueDate || null,
                assignedToUserId: form.assignedToUserId ? Number(form.assignedToUserId) : null,
                assignedToRole: form.assignedToRole || null,
            };
            if (isEdit) {
                await updateTask(task.id, data);
                showToast('Task updated');
            } else {
                await createTask(data);
                showToast('Task created');
            }
            onSaved();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={isEdit ? 'Edit Task' : 'New Task'} onClose={onClose}>
            <form onSubmit={handleSubmit} className="modal-form">
                <label className="form-field">
                    <span>Title *</span>
                    <input type="text" value={form.title} onChange={(e) => handleChange('title', e.target.value)} autoFocus />
                </label>

                <label className="form-field">
                    <span>Description</span>
                    <textarea rows={2} value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
                </label>

                <div className="form-row">
                    <label className="form-field">
                        <span>Urgency</span>
                        <select value={form.urgency} onChange={(e) => handleChange('urgency', e.target.value)}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </label>

                    <label className="form-field">
                        <span>Due Date</span>
                        <input type="date" value={form.dueDate} onChange={(e) => handleChange('dueDate', e.target.value)} />
                    </label>
                </div>

                <div className="form-row">
                    <label className="form-field">
                        <span>Assign to User</span>
                        <select value={form.assignedToUserId} onChange={(e) => handleChange('assignedToUserId', e.target.value)}>
                            <option value="">— None —</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </label>

                    <label className="form-field">
                        <span>Or Assign to Role</span>
                        <select value={form.assignedToRole} onChange={(e) => handleChange('assignedToRole', e.target.value)}>
                            <option value="">— None —</option>
                            <option value="admin">Admin</option>
                            <option value="pca">PCA</option>
                        </select>
                    </label>
                </div>

                <label className="form-field">
                    <span>Notes</span>
                    <textarea rows={2} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
                </label>

                <div className="modal-actions">
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                        {saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p client/src/components/tasks
git add client/src/components/tasks/TaskModal.jsx
git commit -m "feat(tasks): add TaskModal component for create/edit"
```

---

### Task 13: Dashboard Tasks Widget

**Files:**
- Create: `client/src/components/tasks/TasksWidget.jsx`

- [ ] **Step 1: Create TasksWidget.jsx**

Create `client/src/components/tasks/TasksWidget.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTaskSummary } from '../../api';
import Icons from '../common/Icons';

export default function TasksWidget() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        getTaskSummary().then(setSummary).catch(() => {});
    }, []);

    if (!summary || summary.totalOpen === 0) return null;

    return (
        <div className="dashboard-card tasks-widget">
            <div className="dashboard-card__header">
                <h3>{Icons.checkSquare} Tasks</h3>
                <button className="link-btn" onClick={() => navigate('/tasks')}>View All</button>
            </div>
            <div className="tasks-widget__counts">
                {summary.overdue > 0 && (
                    <button className="tasks-widget__count tasks-widget__count--danger" onClick={() => navigate('/tasks?status=open&overdue=true')}>
                        <span className="tasks-widget__number">{summary.overdue}</span>
                        <span className="tasks-widget__label">Overdue</span>
                    </button>
                )}
                {summary.dueToday > 0 && (
                    <button className="tasks-widget__count tasks-widget__count--warning" onClick={() => navigate('/tasks?status=open')}>
                        <span className="tasks-widget__number">{summary.dueToday}</span>
                        <span className="tasks-widget__label">Due Today</span>
                    </button>
                )}
                <button className="tasks-widget__count" onClick={() => navigate('/tasks')}>
                    <span className="tasks-widget__number">{summary.totalOpen}</span>
                    <span className="tasks-widget__label">Total Open</span>
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/tasks/TasksWidget.jsx
git commit -m "feat(tasks): add dashboard TasksWidget component"
```

---

### Task 14: Sidebar + Routing Integration

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`
- Modify: `client/src/App.jsx` (or wherever routes are defined)

- [ ] **Step 1: Add /tasks to PATH_TO_PAGE in Sidebar.jsx**

In `client/src/components/layout/Sidebar.jsx`, add to the `PATH_TO_PAGE` object:

```javascript
    '/tasks': 'tasks',
```

- [ ] **Step 2: Add Tasks nav item to the sidebar**

In the sidebar nav list (after the Scheduling button, around line 91-95), add:

```jsx
                    <button className={`sidebar__nav-item ${activePage === 'tasks' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/tasks')} title="Tasks">
                        {Icons.checkSquare} Tasks
                    </button>
```

- [ ] **Step 3: Add route in App.jsx**

Find the route definitions in `client/src/App.jsx` and add:

```jsx
import TasksPage from './pages/TasksPage';
```

And in the routes section:

```jsx
<Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
```

- [ ] **Step 4: Add TasksWidget to DashboardPage**

In `client/src/pages/DashboardPage.jsx`, import and render the widget in the "Needs Attention" section:

```jsx
import TasksWidget from '../components/tasks/TasksWidget';
```

Add `<TasksWidget />` in the dashboard layout where other attention cards are rendered.

- [ ] **Step 5: Verify the app compiles**

Run: `cd client && npm run build`

Expected: Build succeeds without errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/layout/Sidebar.jsx client/src/App.jsx client/src/pages/DashboardPage.jsx
git commit -m "feat(tasks): integrate tasks into sidebar, routing, and dashboard"
```

---

### Task 15: Workflow Triggers Settings UI

**Files:**
- Modify: page where admin system configuration lives (likely `client/src/pages/` — check for admin settings page)

- [ ] **Step 1: Identify where to add the workflow triggers UI**

Check if there's an existing admin/settings page. If not, add a "Workflow Triggers" section to the Tasks page as a secondary tab, or create a simple section at the bottom. The spec says "New section in Admin & System Configuration page."

Look for an existing admin settings page. If none exists, add a "Settings" tab/section to TasksPage that shows the workflow triggers configuration.

Add this component inline or as a separate file. Here's the implementation as a section within TasksPage:

In `client/src/pages/TasksPage.jsx`, add a state for showing triggers and a triggers section:

Add import:
```jsx
import { listWorkflowTriggers, updateWorkflowTrigger, listUsers } from '../api';
```

Add a `[showSettings, setShowSettings]` state and a `[triggers, setTriggers]` state, and render a triggers config table when `showSettings` is true:

```jsx
// Add near top of component:
const [showSettings, setShowSettings] = useState(false);
const [triggers, setTriggers] = useState([]);

// Add in useEffect or callback:
useEffect(() => {
    if (showSettings) {
        listWorkflowTriggers().then(setTriggers).catch(() => {});
    }
}, [showSettings]);

const handleTriggerUpdate = async (id, field, value) => {
    try {
        const updated = await updateWorkflowTrigger(id, { [field]: value });
        setTriggers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
        showToast(err.message, 'error');
    }
};
```

Add a "Settings" button in the page header and render the triggers table:

```jsx
{showSettings && (
    <div className="settings-section">
        <h2>Workflow Triggers</h2>
        <table className="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Enabled</th>
                    <th>Threshold</th>
                    <th>Urgency</th>
                    <th>Assign To</th>
                </tr>
            </thead>
            <tbody>
                {triggers.map((trigger) => (
                    <tr key={trigger.id}>
                        <td>{trigger.name}</td>
                        <td>{trigger.type}</td>
                        <td>
                            <input type="checkbox" checked={trigger.enabled} onChange={(e) => handleTriggerUpdate(trigger.id, 'enabled', e.target.checked)} />
                        </td>
                        <td>
                            <input type="number" className="input--sm" value={trigger.thresholdDays} onChange={(e) => handleTriggerUpdate(trigger.id, 'thresholdDays', Number(e.target.value))} style={{ width: '60px' }} /> days
                        </td>
                        <td>
                            <select value={trigger.urgency} onChange={(e) => handleTriggerUpdate(trigger.id, 'urgency', e.target.value)}>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </td>
                        <td>
                            <select value={trigger.assignToUserId || ''} onChange={(e) => handleTriggerUpdate(trigger.id, 'assignToUserId', e.target.value ? Number(e.target.value) : null)}>
                                <option value="">Role: {trigger.assignToRole || 'None'}</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TasksPage.jsx
git commit -m "feat(tasks): add workflow triggers settings UI to Tasks page"
```

---

### Task 16: Add checkSquare Icon

**Files:**
- Modify: `client/src/components/common/Icons.jsx`

- [ ] **Step 1: Add checkSquare icon**

In `client/src/components/common/Icons.jsx`, add a `checkSquare` export (if it doesn't already exist). Find the pattern used by other icons and add:

```jsx
checkSquare: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2 2h11"></path>
    </svg>
),
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/common/Icons.jsx
git commit -m "feat(tasks): add checkSquare icon"
```

---

### Task 17: CSS Styles for Tasks

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add task-specific styles**

Append to `client/src/index.css`:

```css
/* ── Tasks ── */
.row--overdue { background: hsl(0 80% 97%) !important; }
.text--danger { color: hsl(0 72% 51%); font-weight: 500; }

.urgency-dot { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }

.tasks-widget__counts { display: flex; gap: 1rem; margin-top: 0.5rem; }
.tasks-widget__count {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid hsl(240 5.9% 90%);
    background: none; cursor: pointer; transition: background 0.15s;
}
.tasks-widget__count:hover { background: hsl(240 4.8% 95.9%); }
.tasks-widget__count--danger { border-color: hsl(0 72% 85%); }
.tasks-widget__count--danger .tasks-widget__number { color: hsl(0 72% 51%); }
.tasks-widget__count--warning { border-color: hsl(48 96% 75%); }
.tasks-widget__count--warning .tasks-widget__number { color: hsl(48 96% 40%); }
.tasks-widget__number { font-size: 1.5rem; font-weight: 700; line-height: 1; }
.tasks-widget__label { font-size: 0.75rem; color: hsl(240 3.8% 46.1%); margin-top: 0.25rem; }

.bulk-actions { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; }
.bulk-actions span { font-size: 0.875rem; color: hsl(240 3.8% 46.1%); }

.settings-section { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid hsl(240 5.9% 90%); }
.settings-section h2 { font-size: 1.125rem; margin-bottom: 1rem; }

.btn--xs { font-size: 0.7rem; padding: 0.2rem 0.5rem; }
.btn--success { background: hsl(142 71% 45%); color: white; }
.btn--success:hover { background: hsl(142 71% 38%); }

.input--sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; border: 1px solid hsl(240 5.9% 90%); border-radius: 4px; }

.link-btn { background: none; border: none; color: hsl(221 83% 53%); cursor: pointer; text-align: left; padding: 0; font-size: inherit; }
.link-btn:hover { text-decoration: underline; }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "feat(tasks): add task-specific CSS styles"
```

---

### Task 18: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the backend tests**

Run: `cd server && npm test`

Expected: All existing tests pass + new taskService tests pass.

- [ ] **Step 2: Start the server and verify endpoints**

Run: `cd server && npm run dev &`

Then test the API:

```bash
# Login to get token
TOKEN=$(curl -s http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@nvbestpca.com","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# List tasks (should be empty)
curl -s http://localhost:4000/api/tasks -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"

# Create a task
curl -s -X POST http://localhost:4000/api/tasks -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"Test task","urgency":"high","dueDate":"2026-06-05"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"

# Get task summary
curl -s http://localhost:4000/api/tasks/summary -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"

# List workflow triggers
curl -s http://localhost:4000/api/workflow-triggers -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"
```

Expected: All requests return valid JSON responses. Task created successfully. Summary shows 1 open task. Triggers list shows 3 default triggers.

- [ ] **Step 3: Build and verify frontend**

Run: `cd client && npm run build`

Expected: Build succeeds. Open `http://localhost:4000` in browser, navigate to Tasks page via sidebar, verify the page renders.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(tasks): address any issues found during verification"
```

---

## Summary

| Task | What it produces |
|------|-----------------|
| 1 | Prisma schema + migration |
| 2 | Seed data for triggers |
| 3 | Task service (pure logic + tests) |
| 4 | Task controller (CRUD + summary) |
| 5 | Workflow trigger controller |
| 6 | API routes registered |
| 7 | Hourly trigger cron job |
| 8 | Daily reminder cron job |
| 9 | Cron registration in index.js |
| 10 | Frontend API client functions |
| 11 | Tasks page (list + filters) |
| 12 | Task modal (create/edit) |
| 13 | Dashboard widget |
| 14 | Sidebar + routing + dashboard integration |
| 15 | Workflow triggers settings UI |
| 16 | checkSquare icon |
| 17 | CSS styles |
| 18 | End-to-end verification |
