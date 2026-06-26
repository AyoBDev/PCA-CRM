# Admin Notifications for Employee-App Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface employee-app events (cert uploads, time-off, availability changes, profile edits) to admins via Dashboard attention items, sidebar count badge, and per-event toasts.

**Architecture:** New backend endpoints return current pending-event counts + a list of unseen events; new admin client hook polls every 60s and drives Dashboard chips, sidebar pill, and toast dispatch. A new `AdminEventSeen` table tracks per-admin toast suppression and clears profile-change chips.

**Tech Stack:**
- Backend: Express, Prisma (PostgreSQL), Jest with `jest.mock('../../lib/prisma')` and `jest.mock('../../services/auditService')` patterns
- Admin frontend: React 19 + Vite, Vitest + React Testing Library (already configured in `client/`)
- Employee app: existing Vitest setup from previous branch
- Auth: existing `requireRole('admin','user')` + `requirePermission('employees')` middleware

## Global Constraints

- All admin endpoints require `requireRole('admin','user')` AND `requirePermission('employees')`.
- `AdminEventSeen` rows are keyed `(userId, eventKey)`; `eventKey` formats: `cert-pending:{certId}`, `time-off-pending:{requestId}`, `availability-pending:{requestId}`, `profile-change:{auditLogId}`.
- Chip clearing rules per spec:
  - cert/time-off/availability — chip count derived from row counts where `status === 'pending'`
  - profile-change — chip count is qualifying AuditLog rows MINUS rows the admin has marked seen for this `userId`
- Toast suppression: a `recentEvents` entry is only returned for events the admin has NOT yet marked seen.
- Profile-change qualification: `AuditLog.entityType === 'Employee'` AND `action === 'UPDATE'` AND `userRole === 'pca'` AND the auditing user's `userId` equals the audited Employee's `userId` (i.e., the employee edited themselves).
- TDD: every backend endpoint and every frontend hook/page change starts with a failing test.
- Use Vitest for frontend tests (admin + employee-app), Jest for backend.
- Commit messages: never include `Co-Authored-By` or AI attribution.
- Server tests use the existing `jest.mock` pattern, not supertest with a live DB.
- `Promise.allSettled` for parallel fetches; one failing slice never crashes the others.

---

## File Structure

### New files

```
server/
  prisma/migrations/20260626120000_admin_event_seen/
    migration.sql                                       # AdminEventSeen table
  src/controllers/
    adminEmployeeAttentionController.js                 # GET + POST endpoints
  src/controllers/__tests__/
    adminEmployeeAttentionController.test.js            # Jest tests

client/
  src/hooks/
    useEmployeeAttention.jsx                            # provider + hook
  src/__tests__/
    useEmployeeAttention.test.jsx                       # Vitest tests

employee-app/
  src/pages/__tests__/
    AvailabilityPage.test.jsx                           # Vitest test for payload fix
```

### Modified files

```
server/
  prisma/schema.prisma                                  # add AdminEventSeen model + User.seenAttentionEvents relation
  src/routes/api.js                                     # register 2 new routes

client/
  src/api.js                                            # add getEmployeeAttention, markAttentionSeen
  src/main.jsx                                          # wrap children with EmployeeAttentionProvider
  src/pages/DashboardPage.jsx                           # consume counts in attention list
  src/pages/EmployeeDetailPage.jsx                      # URL hash → initial tab
  src/components/layout/Sidebar.jsx                     # nav pill on Employees button
  src/App.jsx                                           # wire toast effect (or new wrapper component)

employee-app/
  src/pages/AvailabilityPage.jsx                        # fix payload key
```

---

## Task 1: Prisma migration — `AdminEventSeen` table

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260626120000_admin_event_seen/migration.sql`

**Interfaces:**
- Produces: `prisma.adminEventSeen` model with `(userId, eventKey, seenAt)` and unique compound `(userId, eventKey)`.
- Produces: `User.seenAttentionEvents AdminEventSeen[]` back-relation.

- [ ] **Step 1: Add the model to `schema.prisma`**

Append after the existing `User` model block (before `model PasswordResetToken`):

```prisma
model AdminEventSeen {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  eventKey  String   @map("event_key")
  seenAt    DateTime @default(now()) @map("seen_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, eventKey])
  @@index([userId])
  @@map("admin_event_seen")
}
```

Inside the existing `User` model block, add this relation line beside the other relation fields (anywhere in the relation section):

```prisma
  seenAttentionEvents       AdminEventSeen[]
```

- [ ] **Step 2: Generate migration**

```bash
cd server && npx prisma migrate dev --name admin_event_seen --create-only
```

This creates `prisma/migrations/<timestamp>_admin_event_seen/migration.sql` without applying it. Rename the timestamp prefix to `20260626120000` if it differs (so it sorts deterministically).

- [ ] **Step 3: Verify migration SQL**

The migration file should look like:

```sql
-- CreateTable
CREATE TABLE "admin_event_seen" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_key" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_event_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_event_seen_user_id_idx" ON "admin_event_seen"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_event_seen_user_id_event_key_key" ON "admin_event_seen"("user_id", "event_key");

-- AddForeignKey
ALTER TABLE "admin_event_seen" ADD CONSTRAINT "admin_event_seen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

If any of these clauses are missing or named differently, fix the schema and regenerate.

- [ ] **Step 4: Apply locally**

```bash
cd server && npx prisma migrate dev
```

Expected: "Database in sync with schema."

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260626120000_admin_event_seen
git commit -m "feat(server): add AdminEventSeen table for admin notification tracking"
```

---

## Task 2: Backend — `getEmployeeAttention` endpoint

**Files:**
- Create: `server/src/controllers/adminEmployeeAttentionController.js`
- Create: `server/src/controllers/__tests__/adminEmployeeAttentionController.test.js`

**Interfaces:**
- Consumes: `prisma.adminEventSeen`, `prisma.employeeCertification`, `prisma.timeOffRequest`, `prisma.availabilityRequest`, `prisma.auditLog`, `prisma.employee` (for the userId join on profile-changes).
- Produces: `getEmployeeAttention(req, res)` returning:
  ```js
  {
    counts: {
      certsPendingReview: number,
      timeOffPending: number,
      availabilityPending: number,
      profileChangesUnseen: number,
    },
    recentEvents: [
      { eventKey: string, type: string, employeeId: number, employeeName: string, subject: string, createdAt: string }
    ]
  }
  ```

- [ ] **Step 1: Write failing test**

Create `server/src/controllers/__tests__/adminEmployeeAttentionController.test.js`:

```js
jest.mock('../../lib/prisma', () => ({
  employeeCertification: { count: jest.fn(), findMany: jest.fn() },
  timeOffRequest: { count: jest.fn(), findMany: jest.fn() },
  availabilityRequest: { count: jest.fn(), findMany: jest.fn() },
  auditLog: { findMany: jest.fn() },
  adminEventSeen: { findMany: jest.fn(), upsert: jest.fn() },
  employee: { findMany: jest.fn() },
}));
const prisma = require('../../lib/prisma');
const { getEmployeeAttention } = require('../adminEmployeeAttentionController');

function mockReqRes(user = { id: 11, name: 'Admin', role: 'admin' }) {
  const req = { user };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('getEmployeeAttention', () => {
  test('returns zeroed counts when nothing pending', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      counts: { certsPendingReview: 0, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 },
      recentEvents: [],
    }));
  });

  test('returns nonzero counts for each event type', async () => {
    prisma.employeeCertification.count.mockResolvedValue(3);
    prisma.timeOffRequest.count.mockResolvedValue(1);
    prisma.availabilityRequest.count.mockResolvedValue(2);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane Doe', createdAt: new Date('2026-06-26') },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      { id: 7, userId: 50, name: 'Jane Doe' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts).toEqual({ certsPendingReview: 3, timeOffPending: 1, availabilityPending: 2, profileChangesUnseen: 1 });
  });

  test('profile-change qualification requires userRole=pca AND auditUser.id === employee.userId', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      // qualifying: pca user editing themselves
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      // non-qualifying: admin editing employee 7
      { id: 101, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 11, userRole: 'admin', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      // non-qualifying: pca but not the employee's own user
      { id: 102, entityId: 8, entityType: 'Employee', action: 'UPDATE', userId: 99, userRole: 'pca', entityName: 'Bob', createdAt: new Date('2026-06-26') },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      { id: 7, userId: 50, name: 'Jane Doe' },
      { id: 8, userId: 60, name: 'Bob Smith' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.profileChangesUnseen).toBe(1);
  });

  test('subtracts already-seen profile-change rows for this admin', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      { id: 101, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-25') },
    ]);
    prisma.employee.findMany.mockResolvedValue([{ id: 7, userId: 50, name: 'Jane Doe' }]);
    prisma.adminEventSeen.findMany.mockResolvedValue([
      { id: 1, userId: 11, eventKey: 'profile-change:100' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.profileChangesUnseen).toBe(1); // 2 qualifying minus 1 seen
  });

  test('recentEvents excludes events this admin has marked seen', async () => {
    prisma.employeeCertification.count.mockResolvedValue(1);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([
      { id: 1, userId: 11, eventKey: 'cert-pending:42' },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 42, certType: 'CPR', employeeId: 7, updatedAt: new Date(), employee: { name: 'Jane' } },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.certsPendingReview).toBe(1);
    expect(out.recentEvents.find(e => e.eventKey === 'cert-pending:42')).toBeUndefined();
  });

  test('recentEvents includes unseen items with employee context', async () => {
    prisma.employeeCertification.count.mockResolvedValue(1);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 42, certType: 'CPR', employeeId: 7, updatedAt: new Date('2026-06-26'), employee: { name: 'Jane Doe' } },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.recentEvents).toHaveLength(1);
    expect(out.recentEvents[0]).toMatchObject({
      eventKey: 'cert-pending:42', type: 'cert-pending', employeeId: 7, employeeName: 'Jane Doe', subject: 'CPR',
    });
  });

  test('caps recentEvents at 10 items', async () => {
    prisma.employeeCertification.count.mockResolvedValue(15);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    const fakeCerts = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1, certType: 'CPR', employeeId: 7, updatedAt: new Date(2026, 5, 26 - i), employee: { name: 'Jane' },
    }));
    prisma.employeeCertification.findMany.mockResolvedValue(fakeCerts);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.recentEvents).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd server && npx jest --testPathPatterns=adminEmployeeAttentionController -v
```

Expected: "Cannot find module '../adminEmployeeAttentionController'".

- [ ] **Step 3: Implement controller**

Create `server/src/controllers/adminEmployeeAttentionController.js`:

```js
const prisma = require('../lib/prisma');

async function getEmployeeAttention(req, res) {
  const adminUserId = req.user.id;

  const [
    certsPendingReview,
    timeOffPending,
    availabilityPending,
    seenRows,
    auditLogs,
    employees,
    pendingCerts,
    pendingTimeOff,
    pendingAvailability,
  ] = await Promise.all([
    prisma.employeeCertification.count({ where: { status: 'pending' } }),
    prisma.timeOffRequest.count({ where: { status: 'pending' } }),
    prisma.availabilityRequest.count({ where: { status: 'pending' } }),
    prisma.adminEventSeen.findMany({ where: { userId: adminUserId } }),
    prisma.auditLog.findMany({
      where: { entityType: 'Employee', action: 'UPDATE', userRole: 'pca' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.employee.findMany({ select: { id: true, userId: true, name: true } }),
    prisma.employeeCertification.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.timeOffRequest.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.availabilityRequest.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const seen = new Set(seenRows.map(r => r.eventKey));
  const empByUserId = new Map();
  for (const e of employees) {
    if (e.userId != null) empByUserId.set(e.userId, e);
  }
  const empById = new Map(employees.map(e => [e.id, e]));

  // Filter audit logs: only those where the auditing user is the same person as the audited employee's user
  const qualifyingProfileChanges = auditLogs.filter(a => {
    const auditedEmployee = empById.get(a.entityId);
    return auditedEmployee && auditedEmployee.userId === a.userId;
  });
  const profileChangesUnseen = qualifyingProfileChanges.filter(a => !seen.has(`profile-change:${a.id}`)).length;

  const events = [];

  for (const c of pendingCerts) {
    const k = `cert-pending:${c.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'cert-pending',
      employeeId: c.employeeId,
      employeeName: c.employee?.name || '',
      subject: c.certType,
      createdAt: c.updatedAt.toISOString(),
    });
  }
  for (const t of pendingTimeOff) {
    const k = `time-off-pending:${t.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'time-off-pending',
      employeeId: t.employeeId,
      employeeName: t.employee?.name || '',
      subject: t.reason,
      createdAt: t.createdAt.toISOString(),
    });
  }
  for (const a of pendingAvailability) {
    const k = `availability-pending:${a.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'availability-pending',
      employeeId: a.employeeId,
      employeeName: a.employee?.name || '',
      subject: 'schedule change',
      createdAt: a.createdAt.toISOString(),
    });
  }
  for (const a of qualifyingProfileChanges) {
    const k = `profile-change:${a.id}`;
    if (seen.has(k)) continue;
    const emp = empById.get(a.entityId);
    events.push({
      eventKey: k,
      type: 'profile-change',
      employeeId: a.entityId,
      employeeName: a.entityName || emp?.name || '',
      subject: 'profile updated',
      createdAt: a.createdAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    counts: {
      certsPendingReview,
      timeOffPending,
      availabilityPending,
      profileChangesUnseen,
    },
    recentEvents: events.slice(0, 10),
  });
}

module.exports = { getEmployeeAttention };
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd server && npx jest --testPathPatterns=adminEmployeeAttentionController -v
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/adminEmployeeAttentionController.js server/src/controllers/__tests__/adminEmployeeAttentionController.test.js
git commit -m "feat(server): add getEmployeeAttention controller"
```

---

## Task 3: Backend — `markAttentionSeen` endpoint

**Files:**
- Modify: `server/src/controllers/adminEmployeeAttentionController.js`
- Modify: `server/src/controllers/__tests__/adminEmployeeAttentionController.test.js`

**Interfaces:**
- Consumes: `prisma.adminEventSeen.upsert`.
- Produces: `markAttentionSeen(req, res)` accepting `{ eventKey: string }` OR `{ eventKeys: string[] }`, returning `{ success: true, count: number }`. Idempotent.

- [ ] **Step 1: Append failing tests to the existing test file**

After the existing `describe('getEmployeeAttention', ...)` block, append:

```js
const { markAttentionSeen } = require('../adminEmployeeAttentionController');

describe('markAttentionSeen', () => {
  test('returns 400 when no keys provided', async () => {
    const req = { user: { id: 11 }, body: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await markAttentionSeen(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('upserts a single eventKey', async () => {
    prisma.adminEventSeen.upsert.mockResolvedValue({ id: 1 });
    const req = { user: { id: 11 }, body: { eventKey: 'cert-pending:42' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await markAttentionSeen(req, res);

    expect(prisma.adminEventSeen.upsert).toHaveBeenCalledWith({
      where: { userId_eventKey: { userId: 11, eventKey: 'cert-pending:42' } },
      create: { userId: 11, eventKey: 'cert-pending:42' },
      update: {},
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, count: 1 });
  });

  test('upserts multiple eventKeys from an array', async () => {
    prisma.adminEventSeen.upsert.mockResolvedValue({ id: 1 });
    const req = { user: { id: 11 }, body: { eventKeys: ['cert-pending:42', 'profile-change:100'] } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await markAttentionSeen(req, res);

    expect(prisma.adminEventSeen.upsert).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ success: true, count: 2 });
  });
});
```

The require statement at top needs updating — change the existing import:
```js
const { getEmployeeAttention } = require('../adminEmployeeAttentionController');
```
to:
```js
const { getEmployeeAttention, markAttentionSeen } = require('../adminEmployeeAttentionController');
```

Remove the redundant `const { markAttentionSeen } = require(...)` line shown in the snippet above (it was just there for clarity; consolidate into the top import).

- [ ] **Step 2: Run, expect FAIL**

```bash
cd server && npx jest --testPathPatterns=adminEmployeeAttentionController -v
```

Expected: 3 new tests fail because `markAttentionSeen` is not exported.

- [ ] **Step 3: Implement `markAttentionSeen` in the controller**

Append to `server/src/controllers/adminEmployeeAttentionController.js` before `module.exports`:

```js
async function markAttentionSeen(req, res) {
  const userId = req.user.id;
  const keys = Array.isArray(req.body?.eventKeys)
    ? req.body.eventKeys
    : (req.body?.eventKey ? [req.body.eventKey] : []);
  if (keys.length === 0) return res.status(400).json({ error: 'eventKey or eventKeys required' });

  for (const eventKey of keys) {
    await prisma.adminEventSeen.upsert({
      where: { userId_eventKey: { userId, eventKey } },
      create: { userId, eventKey },
      update: {},
    });
  }
  res.json({ success: true, count: keys.length });
}
```

Update the `module.exports` line to:
```js
module.exports = { getEmployeeAttention, markAttentionSeen };
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd server && npx jest --testPathPatterns=adminEmployeeAttentionController -v
```

Expected: 9 tests pass (6 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/adminEmployeeAttentionController.js server/src/controllers/__tests__/adminEmployeeAttentionController.test.js
git commit -m "feat(server): add markAttentionSeen controller"
```

---

## Task 4: Backend — register the routes

**Files:**
- Modify: `server/src/routes/api.js`

**Interfaces:**
- Consumes: `getEmployeeAttention` and `markAttentionSeen` from Task 3.
- Produces: `GET /api/admin/employee-attention` and `POST /api/admin/employee-attention/mark-seen` accessible at runtime.

- [ ] **Step 1: Add the import**

Near the existing controller imports in `server/src/routes/api.js`, add:

```js
const { getEmployeeAttention, markAttentionSeen } = require('../controllers/adminEmployeeAttentionController');
```

- [ ] **Step 2: Register the routes**

Find the section of admin routes (look for other `requireRole('admin', 'user'), requirePermission('employees')` lines around the employees routes). After those lines, add:

```js
router.get('/admin/employee-attention',
  requireRole('admin', 'user'), requirePermission('employees'),
  getEmployeeAttention);
router.post('/admin/employee-attention/mark-seen',
  requireRole('admin', 'user'), requirePermission('employees'),
  markAttentionSeen);
```

- [ ] **Step 3: Run the full server suite**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: 9 new attention tests pass. The 3 pre-existing failing suites (pcaFormController, permissionGroupController, onboardingController) still fail with their original failures and no new failures appear.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/api.js
git commit -m "feat(server): register /api/admin/employee-attention routes"
```

---

## Task 5: Admin client — `api.js` helpers

**Files:**
- Modify: `client/src/api.js`

**Interfaces:**
- Produces:
  - `api.getEmployeeAttention()` returning `Promise<{ counts, recentEvents }>`.
  - `api.markAttentionSeen(eventKeyOrKeys)` accepting a string or array, returning `Promise<{ success, count }>`.

- [ ] **Step 1: Add the methods**

In `client/src/api.js`, find a logical spot near other employee-related helpers and add:

```js
export const getEmployeeAttention = () => request('/admin/employee-attention');
export const markAttentionSeen = (keys) => {
    const body = Array.isArray(keys) ? { eventKeys: keys } : { eventKey: keys };
    return request('/admin/employee-attention/mark-seen', { method: 'POST', body: JSON.stringify(body) });
};
```

If `api.js` uses a different export pattern (e.g., a default object), match it. The two new entries must be reachable as `api.getEmployeeAttention()` and `api.markAttentionSeen(...)`.

- [ ] **Step 2: Verify no syntax error**

```bash
cd client && npm test -- api 2>&1 | tail -5
```

If `api.test.jsx` doesn't exist, just run the full Vitest suite to confirm no import breakage:

```bash
cd client && npm test 2>&1 | tail -5
```

Expected: existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/api.js
git commit -m "feat(client): add getEmployeeAttention and markAttentionSeen API methods"
```

---

## Task 6: Admin client — `useEmployeeAttention` hook + provider

**Files:**
- Create: `client/src/hooks/useEmployeeAttention.jsx`
- Create: `client/src/__tests__/useEmployeeAttention.test.jsx`

**Interfaces:**
- Produces: `<EmployeeAttentionProvider>` wrapping any subtree, polling every 60s while visible.
- Produces: `useEmployeeAttention()` returning `{ counts, totalCount, recentEvents, markSeen, refresh, loading }`.
- Consumes: `api.getEmployeeAttention`, `api.markAttentionSeen` from Task 5.

- [ ] **Step 1: Failing tests**

Create `client/src/__tests__/useEmployeeAttention.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { EmployeeAttentionProvider, useEmployeeAttention } from '../hooks/useEmployeeAttention';

vi.mock('../api', () => ({
  getEmployeeAttention: vi.fn(),
  markAttentionSeen: vi.fn(),
}));
import * as api from '../api';

function Probe() {
  const n = useEmployeeAttention();
  if (n.loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="total">{n.totalCount}</span>
      <span data-testid="certs">{n.counts.certsPendingReview}</span>
      <span data-testid="events-len">{n.recentEvents.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEmployeeAttention', () => {
  it('exposes counts and totalCount from the API', async () => {
    api.getEmployeeAttention.mockResolvedValue({
      counts: { certsPendingReview: 3, timeOffPending: 1, availabilityPending: 0, profileChangesUnseen: 2 },
      recentEvents: [{ eventKey: 'cert-pending:1', type: 'cert-pending' }],
    });
    render(<EmployeeAttentionProvider><Probe /></EmployeeAttentionProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('6'));
    expect(screen.getByTestId('certs').textContent).toBe('3');
    expect(screen.getByTestId('events-len').textContent).toBe('1');
  });

  it('handles fetch failure with zeroed counts and empty events', async () => {
    api.getEmployeeAttention.mockRejectedValue(new Error('boom'));
    render(<EmployeeAttentionProvider><Probe /></EmployeeAttentionProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('0'));
    expect(screen.getByTestId('events-len').textContent).toBe('0');
  });

  it('markSeen calls the API and triggers a refresh', async () => {
    api.getEmployeeAttention.mockResolvedValue({
      counts: { certsPendingReview: 1, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 },
      recentEvents: [],
    });
    api.markAttentionSeen.mockResolvedValue({ success: true, count: 1 });

    let captured;
    function Capture() { captured = useEmployeeAttention(); return null; }
    render(<EmployeeAttentionProvider><Capture /></EmployeeAttentionProvider>);

    await waitFor(() => expect(api.getEmployeeAttention).toHaveBeenCalledTimes(1));

    await act(async () => { await captured.markSeen('cert-pending:42'); });

    expect(api.markAttentionSeen).toHaveBeenCalledWith('cert-pending:42');
    expect(api.getEmployeeAttention).toHaveBeenCalledTimes(2);
  });

  it('throws when used outside the provider', () => {
    function Bad() { useEmployeeAttention(); return null; }
    expect(() => render(<Bad />)).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd client && npm test -- useEmployeeAttention
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `client/src/hooks/useEmployeeAttention.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../api';

const Ctx = createContext(null);

const ZERO_COUNTS = { certsPendingReview: 0, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 };

export function EmployeeAttentionProvider({ children }) {
  const [counts, setCounts] = useState(ZERO_COUNTS);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api.getEmployeeAttention();
      setCounts(data?.counts || ZERO_COUNTS);
      setRecentEvents(Array.isArray(data?.recentEvents) ? data.recentEvents : []);
    } catch (_) {
      setCounts(ZERO_COUNTS);
      setRecentEvents([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const markSeen = useCallback(async (keys) => {
    try { await api.markAttentionSeen(keys); } catch (_) { /* silent; will retry */ }
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    function tick() { if (document.visibilityState === 'visible') refresh(); }
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const totalCount =
    (counts.certsPendingReview || 0) +
    (counts.timeOffPending || 0) +
    (counts.availabilityPending || 0) +
    (counts.profileChangesUnseen || 0);

  const value = { counts, totalCount, recentEvents, markSeen, refresh, loading };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEmployeeAttention() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEmployeeAttention must be used inside <EmployeeAttentionProvider>');
  return v;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd client && npm test -- useEmployeeAttention
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useEmployeeAttention.jsx client/src/__tests__/useEmployeeAttention.test.jsx
git commit -m "feat(client): add useEmployeeAttention hook with provider and poll"
```

---

## Task 7: Wire `EmployeeAttentionProvider` into `main.jsx`

**Files:**
- Modify: `client/src/main.jsx`

**Interfaces:**
- Consumes: `EmployeeAttentionProvider` from Task 6.
- Produces: All pages now have employee-attention context. Wraps inside `AuthProvider` (so we have user context if ever needed) but outside `ToastProvider` so the toast effect can use both.

- [ ] **Step 1: Update main.jsx**

Edit `client/src/main.jsx` from:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <App />
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
```

to:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { EmployeeAttentionProvider } from './hooks/useEmployeeAttention';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <EmployeeAttentionProvider>
                        <App />
                    </EmployeeAttentionProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
```

- [ ] **Step 2: Run full Vitest suite**

```bash
cd client && npm test
```

Expected: all existing tests pass; useEmployeeAttention test still passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/main.jsx
git commit -m "feat(client): wire EmployeeAttentionProvider into the app tree"
```

---

## Task 8: Sidebar count pill on Employees button

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: `useEmployeeAttention().totalCount`.
- Produces: A `<span class="sidebar__nav-pill">{N}</span>` rendered inside the Employees button when `totalCount > 0`.

- [ ] **Step 1: Add the import + read**

At the top of `client/src/components/layout/Sidebar.jsx`, add:

```jsx
import { useEmployeeAttention } from '../../hooks/useEmployeeAttention';
```

Inside the Sidebar component body (before any conditional return), add:

```jsx
const { totalCount: employeeAttentionTotal } = useEmployeeAttention();
```

- [ ] **Step 2: Update the Employees button**

Find the Employees button (around line 127). Change it from:

```jsx
<button className={`sidebar__nav-item ${activePage === 'employees' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/employees')} title="Employees">
    {Icons.user} Employees
</button>
```

to:

```jsx
<button className={`sidebar__nav-item ${activePage === 'employees' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/employees')} title="Employees">
    {Icons.user} Employees
    {employeeAttentionTotal > 0 && (
        <span className="sidebar__nav-pill">
            {employeeAttentionTotal > 99 ? '99+' : employeeAttentionTotal}
        </span>
    )}
</button>
```

- [ ] **Step 3: Verify build runs (manual smoke or no-test-breakage)**

```bash
cd client && npm test
```

Expected: all tests still pass (no Sidebar tests exist; we don't add one — the wiring is one line and verified by visual smoke + Task 6's tests covering the count math).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/Sidebar.jsx
git commit -m "feat(client): show employee-attention count pill on sidebar Employees link"
```

---

## Task 9: EmployeeDetailPage — honor URL hash for initial tab

**Files:**
- Modify: `client/src/pages/EmployeeDetailPage.jsx`

**Interfaces:**
- Produces: Loading `/employees/42#certs` opens the Certifications tab, `#availability` opens Availability, `#profile` opens Profile. Default remains 'profile' when no hash.

- [ ] **Step 1: Update imports**

In `client/src/pages/EmployeeDetailPage.jsx`, change line 2 from:

```jsx
import { useParams, useNavigate } from 'react-router-dom';
```

to:

```jsx
import { useParams, useNavigate, useLocation } from 'react-router-dom';
```

- [ ] **Step 2: Replace the activeTab initialization**

Find line ~326:

```jsx
const [activeTab, setActiveTab] = useState('profile');
```

Replace with:

```jsx
const location = useLocation();
const initialTab = useMemo(() => {
    const map = {
        '#certs': 'certifications',
        '#certifications': 'certifications',
        '#availability': 'availability',
        '#profile': 'profile',
        '#timesheets': 'timesheets',
        '#schedule': 'schedule',
    };
    return map[location.hash] || 'profile';
}, [location.hash]);
const [activeTab, setActiveTab] = useState(initialTab);
useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
```

`useMemo` is already in the imports on line 1 of the file (`import { useState, useEffect, useCallback, useMemo } from 'react';`).

- [ ] **Step 3: Run Vitest**

```bash
cd client && npm test
```

Expected: existing tests pass; no new ones added (the hash routing is exercised manually post-merge).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EmployeeDetailPage.jsx
git commit -m "feat(client): honor URL hash for initial tab on EmployeeDetailPage"
```

---

## Task 10: DashboardPage — add four attention items

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `useEmployeeAttention().counts` and `recentEvents`.
- Produces: Up to four new entries in the existing `attentionItems` array on the Dashboard, each navigating to the first matching employee's relevant tab.

- [ ] **Step 1: Add the import + read**

At the top of `client/src/pages/DashboardPage.jsx`, add:

```jsx
import { useEmployeeAttention } from '../hooks/useEmployeeAttention';
```

Inside the `DashboardPage` component (before the conditional returns and before the existing `attentionItems` array build), add:

```jsx
const { counts: employeeAttentionCounts, recentEvents: employeeAttentionEvents } = useEmployeeAttention();
```

- [ ] **Step 2: Append four attention items**

After the existing `attentionItems.push(...)` lines and before the section that renders them, add:

```jsx
const firstOfType = (type) => employeeAttentionEvents.find(e => e.type === type);

if (employeeAttentionCounts.certsPendingReview > 0) {
    const e = firstOfType('cert-pending');
    attentionItems.push({
        icon: Icons.alertCircle,
        label: `${employeeAttentionCounts.certsPendingReview} certification${employeeAttentionCounts.certsPendingReview > 1 ? 's' : ''} awaiting review`,
        severity: 'warning',
        action: () => navigate(e ? `/employees/${e.employeeId}#certs` : '/employees'),
    });
}
if (employeeAttentionCounts.timeOffPending > 0) {
    const e = firstOfType('time-off-pending');
    attentionItems.push({
        icon: Icons.alertCircle,
        label: `${employeeAttentionCounts.timeOffPending} time-off request${employeeAttentionCounts.timeOffPending > 1 ? 's' : ''} pending`,
        severity: 'warning',
        action: () => navigate(e ? `/employees/${e.employeeId}#availability` : '/employees'),
    });
}
if (employeeAttentionCounts.availabilityPending > 0) {
    const e = firstOfType('availability-pending');
    attentionItems.push({
        icon: Icons.alertCircle,
        label: `${employeeAttentionCounts.availabilityPending} availability change${employeeAttentionCounts.availabilityPending > 1 ? 's' : ''} pending`,
        severity: 'warning',
        action: () => navigate(e ? `/employees/${e.employeeId}#availability` : '/employees'),
    });
}
if (employeeAttentionCounts.profileChangesUnseen > 0) {
    const e = firstOfType('profile-change');
    attentionItems.push({
        icon: Icons.alertCircle,
        label: `${employeeAttentionCounts.profileChangesUnseen} profile change${employeeAttentionCounts.profileChangesUnseen > 1 ? 's' : ''} to review`,
        severity: 'warning',
        action: () => navigate(e ? `/employees/${e.employeeId}#profile` : '/employees'),
    });
}
```

If `Icons.alertCircle` doesn't exist, use the closest available icon (`Icons.alertTriangle` works too — confirm from the existing imports near the top of the file). Match what's already in use in `attentionItems`.

- [ ] **Step 3: Run Vitest**

```bash
cd client && npm test
```

Expected: existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat(client): surface employee attention items on Dashboard"
```

---

## Task 11: Toast effect for new attention events

**Files:**
- Create: `client/src/components/AttentionToastWatcher.jsx`
- Modify: `client/src/App.jsx`
- Create: `client/src/__tests__/AttentionToastWatcher.test.jsx`

**Interfaces:**
- Consumes: `useEmployeeAttention()`, `useToast().showToast`.
- Produces: A self-rendering `<AttentionToastWatcher />` component (returns `null`) that dispatches one toast per new event the admin hasn't yet seen, then calls `markSeen([keys])` after a short delay.

- [ ] **Step 1: Failing test**

Create `client/src/__tests__/AttentionToastWatcher.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AttentionToastWatcher from '../components/AttentionToastWatcher';

const showToast = vi.fn();
const markSeen = vi.fn().mockResolvedValue();

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('../hooks/useEmployeeAttention', () => ({
  useEmployeeAttention: vi.fn(),
}));
import { useEmployeeAttention } from '../hooks/useEmployeeAttention';

describe('AttentionToastWatcher', () => {
  it('renders nothing visible', () => {
    useEmployeeAttention.mockReturnValue({ recentEvents: [], markSeen });
    const { container } = render(<AttentionToastWatcher />);
    expect(container.firstChild).toBeNull();
  });

  it('dispatches a toast for each new recent event on mount', async () => {
    useEmployeeAttention.mockReturnValue({
      recentEvents: [
        { eventKey: 'cert-pending:1', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' },
        { eventKey: 'time-off-pending:5', type: 'time-off-pending', employeeName: 'Bob', subject: 'vacation' },
      ],
      markSeen,
    });
    render(<AttentionToastWatcher />);
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(2));
    expect(showToast.mock.calls[0][0]).toMatch(/Jane/);
    expect(showToast.mock.calls[1][0]).toMatch(/Bob/);
  });

  it('does not re-toast events already shown in this session', async () => {
    showToast.mockClear();
    useEmployeeAttention.mockReturnValue({
      recentEvents: [{ eventKey: 'cert-pending:1', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' }],
      markSeen,
    });
    const { rerender } = render(<AttentionToastWatcher />);
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));

    // Re-render with the same event — should NOT toast again.
    rerender(<AttentionToastWatcher />);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('calls markSeen with the eventKeys after dispatching toasts', async () => {
    markSeen.mockClear();
    useEmployeeAttention.mockReturnValue({
      recentEvents: [
        { eventKey: 'cert-pending:99', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' },
      ],
      markSeen,
    });
    render(<AttentionToastWatcher />);
    await waitFor(() => expect(markSeen).toHaveBeenCalled());
    expect(markSeen.mock.calls[0][0]).toEqual(['cert-pending:99']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd client && npm test -- AttentionToastWatcher
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `client/src/components/AttentionToastWatcher.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { useEmployeeAttention } from '../hooks/useEmployeeAttention';

function labelFor(event) {
    const who = event.employeeName || 'Employee';
    switch (event.type) {
        case 'cert-pending': return `New cert from ${who}: ${event.subject}`;
        case 'time-off-pending': return `Time-off request from ${who}`;
        case 'availability-pending': return `Schedule change request from ${who}`;
        case 'profile-change': return `${who} updated their profile`;
        default: return `Update from ${who}`;
    }
}

export default function AttentionToastWatcher() {
    const { recentEvents, markSeen } = useEmployeeAttention();
    const { showToast } = useToast();
    const seen = useRef(new Set());

    useEffect(() => {
        if (!Array.isArray(recentEvents) || recentEvents.length === 0) return;
        const fresh = recentEvents.filter(e => !seen.current.has(e.eventKey));
        if (fresh.length === 0) return;
        for (const e of fresh) {
            seen.current.add(e.eventKey);
            showToast(labelFor(e), 'info');
        }
        markSeen(fresh.map(e => e.eventKey));
    }, [recentEvents, showToast, markSeen]);

    return null;
}
```

- [ ] **Step 4: Mount the watcher inside `App.jsx`**

Open `client/src/App.jsx` and inside the top-level returned JSX (anywhere — it renders nothing) add:

```jsx
import AttentionToastWatcher from './components/AttentionToastWatcher';
```

And place `<AttentionToastWatcher />` inside the main rendered tree (right after the `<Routes>` block, or at the top of the layout return — it returns null, so position only affects effect mounting).

- [ ] **Step 5: Run Vitest**

```bash
cd client && npm test -- AttentionToastWatcher
```

Expected: 4 tests pass. Then run the full suite:

```bash
cd client && npm test
```

Expected: all suites green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AttentionToastWatcher.jsx client/src/__tests__/AttentionToastWatcher.test.jsx client/src/App.jsx
git commit -m "feat(client): dispatch toast for new admin attention events"
```

---

## Task 12: Employee-app fix — AvailabilityPage payload key

**Files:**
- Modify: `employee-app/src/pages/AvailabilityPage.jsx`
- Create: `employee-app/src/pages/__tests__/AvailabilityPage.test.jsx`

**Interfaces:**
- Produces: `AvailabilityPage` Save button calls `api.submitAvailabilityRequest({ requestedChanges: form })` (not `{ schedule: form }`).

- [ ] **Step 1: Failing test**

Create `employee-app/src/pages/__tests__/AvailabilityPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AvailabilityPage from '../AvailabilityPage';

vi.mock('../../api', () => ({
  api: {
    getAvailability: vi.fn(),
    getTimeOffRequests: vi.fn(),
    submitAvailabilityRequest: vi.fn(),
    submitTimeOff: vi.fn(),
  },
}));
import { api } from '../../api';

beforeEach(() => {
  vi.clearAllMocks();
  api.getAvailability.mockResolvedValue({
    schedule: { Sun: { on: false, in: '', out: '' }, Mon: { on: false, in: '', out: '' }, Tue: { on: false, in: '', out: '' }, Wed: { on: false, in: '', out: '' }, Thu: { on: false, in: '', out: '' }, Fri: { on: false, in: '', out: '' }, Sat: { on: false, in: '', out: '' } },
  });
  api.getTimeOffRequests.mockResolvedValue([]);
  api.submitAvailabilityRequest.mockResolvedValue({ id: 1 });
});

describe('AvailabilityPage save', () => {
  it("calls submitAvailabilityRequest with { requestedChanges: <form> } (not { schedule: ... })", async () => {
    render(<MemoryRouter><AvailabilityPage /></MemoryRouter>);
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalled());

    // Toggle Monday on by clicking its checkbox
    const monCheckbox = screen.getAllByRole('checkbox')[1]; // Sun=0, Mon=1
    fireEvent.click(monCheckbox);

    const saveBtn = screen.getByRole('button', { name: /save|request/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(api.submitAvailabilityRequest).toHaveBeenCalled());

    const callArg = api.submitAvailabilityRequest.mock.calls[0][0];
    expect(callArg).toHaveProperty('requestedChanges');
    expect(callArg).not.toHaveProperty('schedule');
    expect(callArg.requestedChanges).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd employee-app && npm test -- AvailabilityPage
```

Expected: assertion `expect(callArg).toHaveProperty('requestedChanges')` fails because current code sends `{ schedule: form }`.

- [ ] **Step 3: Fix the payload key**

In `employee-app/src/pages/AvailabilityPage.jsx`, find the call (around line 49):

```js
await api.submitAvailabilityRequest({ schedule: form });
```

Change to:

```js
await api.submitAvailabilityRequest({ requestedChanges: form });
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd employee-app && npm test -- AvailabilityPage
```

Expected: 1 new test passes. Then run the full employee-app suite:

```bash
cd employee-app && npm test
```

Expected: 74/74 tests pass (73 from previous branch + 1 new).

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/pages/AvailabilityPage.jsx employee-app/src/pages/__tests__/AvailabilityPage.test.jsx
git commit -m "fix(employee-app): send {requestedChanges} not {schedule} for availability submit"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full admin client suite**

```bash
cd client && npm test
```

Expected: all suites green including new `useEmployeeAttention` and `AttentionToastWatcher` tests.

- [ ] **Step 2: Run the full employee-app suite**

```bash
cd employee-app && npm test
```

Expected: 74/74 green and pristine.

- [ ] **Step 3: Run the full server suite**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: all new attention tests pass. 3 pre-existing failing suites (pcaFormController, permissionGroupController, onboardingController) still fail with the same set of pre-existing test failures and no new ones.

- [ ] **Step 4: Manual smoke checklist**

Run both `cd server && npm run dev` and `cd client && npm run dev`. Log in as admin. Open the employee-app on a phone viewport. Verify:

- [ ] Employee uploads a CPR cert. Within 60s the admin Dashboard chip "1 certification awaiting review" appears, sidebar Employees pill shows `1`.
- [ ] Click the Dashboard chip → lands at `/employees/:id` on Certifications tab.
- [ ] Admin approves the cert (or the cert leaves `status='pending'`). Within 60s the chip and pill clear.
- [ ] Employee submits a time-off request → Dashboard chip "1 time-off request pending". Click → `#availability` tab.
- [ ] Employee saves a new weekly availability (Save weekly schedule). Server should accept (no longer 400s). Dashboard chip "1 availability change pending" appears.
- [ ] Employee edits their phone number on Edit Profile. Dashboard chip "1 profile change to review" appears with the toast.
- [ ] On a fresh admin browser tab, a recent unseen event triggers a toast. Reloading does NOT re-toast the same event.

- [ ] **Step 5: No commit**

This task is verification only.

---

## Self-Review Notes

Reviewed against the spec. Coverage check:

- Spec's 4 event types: cert pending (Task 2), time-off pending (Task 2), availability pending (Task 2), profile change (Task 2 + Task 4 routes).
- Spec's 3 admin surfaces: Dashboard (Task 10), sidebar pill (Task 8), toast (Task 11).
- Routing rule: chip→employee tab via URL hash (Task 9 makes the hash routing work; Task 10 builds the URLs using `firstOfType` event).
- Clearing rule: state-driven for cert/time-off/availability (no explicit row in `AdminEventSeen` needed for chip clearing — derived from `status === 'pending'`); `profile-change` uses `AdminEventSeen` (subtraction in `getEmployeeAttention`).
- Toast rule: once per (event, admin) — implemented via in-memory `Set` ref in Task 11 AND persistent `markSeen` call so reloads don't re-toast.
- `AdminEventSeen` table: Task 1.
- New endpoints: Tasks 2-4.
- `useEmployeeAttention` hook: Task 6.
- Sidebar pill: Task 8.
- `EmployeeDetailPage` hash routing: Task 9.
- AvailabilityPage payload fix: Task 12.
- TDD applied: every Task 2/3/6/11/12 has a failing test first. Tasks 1/4/5/7/8/9/10 are mechanical wiring covered by upstream/downstream tests.

Type/signature consistency:
- `getEmployeeAttention` response shape `{ counts, recentEvents }` defined in Task 2; consumed verbatim in Task 6 and Task 10.
- `markSeen(keys)` accepts string or array (Task 6); called with array `[eventKey]` in Task 11.
- `eventKey` formats: `cert-pending:{id}`, `time-off-pending:{id}`, `availability-pending:{id}`, `profile-change:{id}` — used consistently in Task 2 (server), Task 6 (test mocks), Task 11 (consumer).

No placeholders. All steps include the exact code, commands, and expected outputs.
