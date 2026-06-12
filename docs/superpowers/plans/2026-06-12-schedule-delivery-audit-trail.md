# Schedule Delivery Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add open tracking, employee acknowledgement UI, bulk sending with custom messages, and an inline delivery dashboard to the existing scheduling notification system.

**Architecture:** Extends the existing `ScheduleNotification` model with three new fields (`openedAt`, `message`, `sentById`). Adds two new public endpoints for open tracking and notification lookup. Enhances the admin `ScheduleDelivery` component with checkboxes, bulk actions, and status columns. Adds an acknowledgement section to the public `ScheduleViewPage`.

**Tech Stack:** PostgreSQL + Prisma (migration), Express.js (API), React 19 (frontend), Jest (tests)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server/prisma/schema.prisma` | Add `openedAt`, `message`, `sentById` fields + User relation |
| `server/prisma/migrations/YYYYMMDD_add_schedule_notification_tracking/migration.sql` | SQL migration |
| `server/src/controllers/scheduleNotificationController.js` | New `recordOpen`, `getNotificationForView`; modify `sendSchedules`, `getNotificationStatus` |
| `server/src/services/notificationService.js` | Accept `message` param in formatters |
| `server/src/routes/api.js` | Register 2 new public routes |
| `server/src/controllers/__tests__/scheduleNotificationController.test.js` | Unit tests for new/modified endpoints |
| `client/src/api.js` | Add `recordScheduleOpen`, `getScheduleNotification` functions |
| `client/src/pages/scheduling/ScheduleViewPage.jsx` | Open tracking + acknowledgement section |
| `client/src/pages/scheduling/ScheduleDelivery.jsx` | Checkboxes, bulk send, status columns, send modal |

---

### Task 1: Database Migration

**Files:**
- Modify: `server/prisma/schema.prisma:111-131`

- [ ] **Step 1: Add fields to ScheduleNotification model in schema.prisma**

Open `server/prisma/schema.prisma` and replace the `ScheduleNotification` model (lines 111-131) with:

```prisma
model ScheduleNotification {
  id                Int       @id @default(autoincrement())
  employeeId        Int       @map("employee_id")
  weekStart         DateTime  @map("week_start")
  method            String    @map("method")
  destination       String    @map("destination")
  status            String    @default("pending") @map("status")
  confirmationToken String    @unique @default(uuid()) @map("confirmation_token")
  confirmedAt       DateTime? @map("confirmed_at")
  sentAt            DateTime? @map("sent_at")
  failureReason     String    @default("") @map("failure_reason")
  response          String    @default("") @map("response")
  responseNotes     String    @default("") @map("response_notes")
  respondedAt       DateTime? @map("responded_at")
  openedAt          DateTime? @map("opened_at")
  message           String    @default("") @map("message")
  sentById          Int?      @map("sent_by_id")
  createdAt         DateTime  @default(now()) @map("created_at")
  employee          Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  sentByUser        User?     @relation("ScheduleSentBy", fields: [sentById], references: [id])

  @@index([employeeId])
  @@index([weekStart])
  @@map("schedule_notifications")
}
```

- [ ] **Step 2: Add reverse relation on User model**

In the `User` model (around line 10-29), add the reverse relation field before the `@@map`:

```prisma
  sentScheduleNotifications ScheduleNotification[] @relation("ScheduleSentBy")
```

- [ ] **Step 3: Generate and apply migration**

Run:
```bash
cd server && npx prisma migrate dev --name add_schedule_notification_tracking
```

Expected: Migration creates `opened_at`, `message`, `sent_by_id` columns on `schedule_notifications` table. Prisma client regenerates.

- [ ] **Step 4: Verify migration applied**

Run:
```bash
cd server && npx prisma migrate status
```

Expected: All migrations applied, no pending.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add open tracking and message fields to ScheduleNotification"
```

---

### Task 2: Backend — Record Open Endpoint

**Files:**
- Modify: `server/src/controllers/scheduleNotificationController.js`
- Modify: `server/src/routes/api.js:170`
- Test: `server/src/controllers/__tests__/scheduleNotificationController.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/controllers/__tests__/scheduleNotificationController.test.js`:

```js
jest.mock('../../lib/prisma', () => ({
    employeeScheduleLink: { findUnique: jest.fn() },
    scheduleNotification: { findFirst: jest.fn(), update: jest.fn() },
}));

const prisma = require('../../lib/prisma');
const { recordOpen } = require('../scheduleNotificationController');

function mockReqRes(overrides = {}) {
    const req = { params: {}, query: {}, body: {}, ...overrides };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res };
}

describe('recordOpen', () => {
    beforeEach(() => jest.clearAllMocks());

    test('marks openedAt on most recent notification for employee+week', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue({ id: 10, openedAt: null });
        prisma.scheduleNotification.update.mockResolvedValue({ id: 10, openedAt: new Date() });

        const { req, res } = mockReqRes({ params: { token: 'abc-123' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(prisma.employeeScheduleLink.findUnique).toHaveBeenCalledWith({ where: { token: 'abc-123' } });
        expect(prisma.scheduleNotification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ employeeId: 5, openedAt: null }),
            orderBy: { createdAt: 'desc' },
        }));
        expect(prisma.scheduleNotification.update).toHaveBeenCalledWith({
            where: { id: 10 },
            data: { openedAt: expect.any(Date) },
        });
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns success even if no notification exists (no-op)', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'abc-123' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(prisma.scheduleNotification.update).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns 404 for invalid token', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'bad-token' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: FAIL — `recordOpen` is not exported from the controller.

- [ ] **Step 3: Implement recordOpen in controller**

Add to `server/src/controllers/scheduleNotificationController.js` before the `module.exports`:

```js
async function recordOpen(req, res) {
    const { token } = req.params;
    const { weekStart } = req.query;

    const link = await prisma.employeeScheduleLink.findUnique({ where: { token } });
    if (!link || !link.active) return res.status(404).json({ error: 'Invalid link' });

    const { weekStart: ws } = getWeekRange(weekStart || new Date().toISOString().slice(0, 10));

    const notification = await prisma.scheduleNotification.findFirst({
        where: {
            employeeId: link.employeeId,
            weekStart: new Date(ws),
            openedAt: null,
        },
        orderBy: { createdAt: 'desc' },
    });

    if (notification) {
        await prisma.scheduleNotification.update({
            where: { id: notification.id },
            data: { openedAt: new Date() },
        });
    }

    res.json({ success: true });
}
```

Update `module.exports` to include `recordOpen`:

```js
module.exports = { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule, respondToSchedule, getScheduleResponses, recordOpen };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Register route in api.js**

In `server/src/routes/api.js`, update the import from `scheduleNotificationController` (line 133):

```js
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule, respondToSchedule, getScheduleResponses, recordOpen } = require('../controllers/scheduleNotificationController');
```

Add the new public route after line 170 (after `router.get('/schedule/view/:token', getScheduleView);`):

```js
router.post('/schedule/view/:token/open', recordOpen);
```

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/scheduleNotificationController.js server/src/controllers/__tests__/scheduleNotificationController.test.js server/src/routes/api.js
git commit -m "feat: add recordOpen endpoint for schedule view tracking"
```

---

### Task 3: Backend — Get Notification For View Endpoint

**Files:**
- Modify: `server/src/controllers/scheduleNotificationController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/src/controllers/__tests__/scheduleNotificationController.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/controllers/__tests__/scheduleNotificationController.test.js`:

```js
const { getNotificationForView } = require('../scheduleNotificationController');

describe('getNotificationForView', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns most recent notification with confirmationToken', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue({
            id: 10,
            confirmationToken: 'conf-abc',
            message: 'Check weekend shifts',
            response: '',
            respondedAt: null,
            openedAt: null,
            sentAt: new Date('2026-06-01T09:00:00Z'),
        });

        const { req, res } = mockReqRes({ params: { token: 'link-token' }, query: { weekStart: '2026-06-01' } });
        await getNotificationForView(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            confirmationToken: 'conf-abc',
            message: 'Check weekend shifts',
            response: '',
        }));
    });

    test('returns null when no notification exists', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'link-token' }, query: { weekStart: '2026-06-01' } });
        await getNotificationForView(req, res);

        expect(res.json).toHaveBeenCalledWith({ notification: null });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: FAIL — `getNotificationForView` not exported.

- [ ] **Step 3: Implement getNotificationForView**

Add to `server/src/controllers/scheduleNotificationController.js` before `module.exports`:

```js
async function getNotificationForView(req, res) {
    const { token } = req.params;
    const { weekStart } = req.query;

    const link = await prisma.employeeScheduleLink.findUnique({ where: { token } });
    if (!link || !link.active) return res.status(404).json({ error: 'Invalid link' });

    const { weekStart: ws } = getWeekRange(weekStart || new Date().toISOString().slice(0, 10));

    const notification = await prisma.scheduleNotification.findFirst({
        where: {
            employeeId: link.employeeId,
            weekStart: new Date(ws),
            status: { not: 'failed' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
            confirmationToken: true,
            message: true,
            response: true,
            responseNotes: true,
            respondedAt: true,
            openedAt: true,
            sentAt: true,
        },
    });

    if (!notification) return res.json({ notification: null });
    res.json(notification);
}
```

Update `module.exports`:

```js
module.exports = { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule, respondToSchedule, getScheduleResponses, recordOpen, getNotificationForView };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: All tests PASS.

- [ ] **Step 5: Register route in api.js**

Update the import and add route after the `recordOpen` route:

```js
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule, respondToSchedule, getScheduleResponses, recordOpen, getNotificationForView } = require('../controllers/scheduleNotificationController');
```

```js
router.get('/schedule/view/:token/notification', getNotificationForView);
```

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/scheduleNotificationController.js server/src/controllers/__tests__/scheduleNotificationController.test.js server/src/routes/api.js
git commit -m "feat: add getNotificationForView endpoint for employee schedule page"
```

---

### Task 4: Backend — Modify sendSchedules for Message + SentBy

**Files:**
- Modify: `server/src/controllers/scheduleNotificationController.js:9-120`
- Modify: `server/src/services/notificationService.js`
- Test: `server/src/controllers/__tests__/scheduleNotificationController.test.js`

- [ ] **Step 1: Write the failing test**

Add to the test file, with additional mock setup. First, update the mock at the top to add `create`:

```js
// Update the existing mock at the top of the file:
jest.mock('../../lib/prisma', () => ({
    employeeScheduleLink: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    scheduleNotification: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    shift: { findMany: jest.fn() },
}));
```

Add mock for notificationService:

```js
jest.mock('../../services/notificationService', () => ({
    isSmsConfigured: jest.fn(() => false),
    isEmailConfigured: jest.fn(() => true),
    sendSms: jest.fn(),
    sendEmail: jest.fn(),
    formatScheduleSms: jest.fn(() => 'sms body'),
    formatScheduleEmailHtml: jest.fn(() => '<html>email</html>'),
}));

jest.mock('../../services/schedulingService', () => ({
    getWeekRange: jest.fn((d) => ({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })),
}));
```

Add tests:

```js
const { sendSchedules } = require('../scheduleNotificationController');
const notifService = require('../../services/notificationService');

describe('sendSchedules', () => {
    beforeEach(() => jest.clearAllMocks());

    test('stores message and sentById on notification records', async () => {
        prisma.shift.findMany.mockResolvedValue([{
            id: 1, employeeId: 5, employee: { id: 5, name: 'Alea', email: 'alea@test.com', phone: '' },
            client: { clientName: 'Client A' }, shiftDate: new Date('2026-06-02'), startTime: '09:00', endTime: '17:00', serviceCode: 'PCS',
        }]);
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, token: 'link-token', active: true });
        prisma.scheduleNotification.create.mockResolvedValue({ id: 20 });
        prisma.scheduleNotification.update.mockResolvedValue({ id: 20, status: 'sent' });
        notifService.isEmailConfigured.mockReturnValue(true);
        notifService.sendEmail.mockResolvedValue({});

        const { req, res } = mockReqRes({
            body: { weekStart: '2026-06-01', employeeIds: [5], message: 'Check shifts' },
            user: { id: 3 },
            protocol: 'http',
            get: () => 'localhost:4000',
        });
        await sendSchedules(req, res);

        expect(prisma.scheduleNotification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                message: 'Check shifts',
                sentById: 3,
            }),
        });
        expect(notifService.formatScheduleEmailHtml).toHaveBeenCalledWith(
            'Alea', expect.any(Array), expect.any(String), expect.any(String), 'Check shifts'
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: FAIL — `sendSchedules` doesn't pass `message`/`sentById` to create, and `formatScheduleEmailHtml` is called with 4 args not 5.

- [ ] **Step 3: Modify sendSchedules to store message and sentById**

In `server/src/controllers/scheduleNotificationController.js`, modify the `sendSchedules` function:

1. Extract `message` from request body (line ~10):
```js
const { weekStart, employeeIds, message } = req.body;
```

2. In both SMS and email notification create calls (around lines 66 and 92), add `message` and `sentById`:
```js
const notification = await prisma.scheduleNotification.create({
    data: {
        employeeId: empId,
        weekStart: new Date(ws),
        method: 'sms', // or 'email'
        destination: employee.phone, // or employee.email
        message: message || '',
        sentById: req.user?.id || null,
    },
});
```

3. Pass `message` to format functions:
```js
const body = formatScheduleSms(employee.name, empShifts, weekLabel, scheduleUrl, message);
```
```js
const html = formatScheduleEmailHtml(employee.name, empShifts, weekLabel, scheduleUrl, message);
```

- [ ] **Step 4: Update notificationService formatters to accept message param**

In `server/src/services/notificationService.js`:

**formatScheduleSms** (line 55) — add `message` param:
```js
function formatScheduleSms(employeeName, shifts, weekLabel, scheduleUrl, message) {
    let msg = `NV Best PCA - Schedule for ${weekLabel}:\n`;
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayAbbr[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        msg += `[${day} ${date}] ${hhmm12(shift.startTime)}-${hhmm12(shift.endTime)} - ${shift.client.clientName} (${shift.serviceCode})\n`;
    }
    if (message) msg += `\nNote from scheduler: ${message}\n`;
    msg += `\nView full schedule: ${scheduleUrl}`;
    return msg;
}
```

**formatScheduleEmailHtml** (line 68) — add `message` param and insert message block:
```js
function formatScheduleEmailHtml(employeeName, shifts, weekLabel, scheduleUrl, message) {
```

Insert the message block after the greeting `<p>` tag (after `Hi ${employeeName},</p>`) and before the `<table>`:

```js
    const messageBlock = message ? `
            <div style="background:#f0f7ff;border-left:3px solid #3b82f6;padding:12px 16px;margin:16px 0;border-radius:4px">
                <p style="margin:0;font-size:14px;color:#1e3a5f;font-weight:500">Message from your scheduler:</p>
                <p style="margin:8px 0 0;font-size:14px;color:#374151">${message}</p>
            </div>` : '';

    return `
        <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:0 auto;color:#09090b">
            <h2 style="margin:0 0 4px;font-size:20px;color:#09090b">Schedule for ${weekLabel}</h2>
            <p style="margin:0 0 16px;color:#71717a;font-size:14px">Hi ${employeeName},</p>
            ${messageBlock}
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;font-size:13px">
            ...
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/scheduleNotificationController.js server/src/services/notificationService.js server/src/controllers/__tests__/scheduleNotificationController.test.js
git commit -m "feat: sendSchedules stores message and sentById, passes message to formatters"
```

---

### Task 5: Backend — Enhance getNotificationStatus

**Files:**
- Modify: `server/src/controllers/scheduleNotificationController.js:122-135`

- [ ] **Step 1: Write the failing test**

Add to the test file:

```js
const { getNotificationStatus } = require('../scheduleNotificationController');

describe('getNotificationStatus', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns notifications grouped with sentByUser included', async () => {
        prisma.scheduleNotification.findMany.mockResolvedValue([
            { id: 1, employeeId: 5, sentAt: new Date(), openedAt: new Date(), response: 'accepted', employee: { id: 5, name: 'Alea' }, sentByUser: { name: 'Admin' } },
            { id: 2, employeeId: 5, sentAt: new Date('2026-05-25'), openedAt: null, response: '', employee: { id: 5, name: 'Alea' }, sentByUser: { name: 'Admin' } },
        ]);

        const { req, res } = mockReqRes({ query: { weekStart: '2026-06-01' } });
        await getNotificationStatus(req, res);

        expect(prisma.scheduleNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.objectContaining({
                sentByUser: expect.any(Object),
            }),
        }));
        expect(res.json).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: FAIL — current `getNotificationStatus` doesn't include `sentByUser`.

- [ ] **Step 3: Modify getNotificationStatus**

Replace the `getNotificationStatus` function in `server/src/controllers/scheduleNotificationController.js`:

```js
async function getNotificationStatus(req, res) {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const { weekStart: ws } = getWeekRange(weekStart);

    const notifications = await prisma.scheduleNotification.findMany({
        where: { weekStart: new Date(ws) },
        include: {
            employee: { select: { id: true, name: true } },
            sentByUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    res.json(notifications);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd server && npx jest --testPathPattern=scheduleNotificationController --verbose
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/scheduleNotificationController.js server/src/controllers/__tests__/scheduleNotificationController.test.js
git commit -m "feat: getNotificationStatus includes sentByUser and openedAt"
```

---

### Task 6: Frontend — API Functions

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add recordScheduleOpen function**

Add after the existing `getScheduleView` function (around line 492) in `client/src/api.js`:

```js
export function recordScheduleOpen(token, weekStart) {
    const qs = weekStart ? `?weekStart=${weekStart}` : '';
    fetch(`${BASE}/schedule/view/${token}/open${qs}`, { method: 'POST' }).catch(() => {});
}
```

- [ ] **Step 2: Add getScheduleNotification function**

Add right after `recordScheduleOpen`:

```js
export async function getScheduleNotification(token, weekStart) {
    const qs = weekStart ? `?weekStart=${weekStart}` : '';
    const res = await fetch(`${BASE}/schedule/view/${token}/notification${qs}`);
    if (!res.ok) return null;
    return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api.js
git commit -m "feat: add recordScheduleOpen and getScheduleNotification API functions"
```

---

### Task 7: Frontend — ScheduleViewPage Open Tracking + Acknowledgement

**Files:**
- Modify: `client/src/pages/scheduling/ScheduleViewPage.jsx`

- [ ] **Step 1: Add open tracking on page load**

In `ScheduleViewPage.jsx`, add after the existing `useEffect` that fetches schedule data (around line 78-85):

```jsx
useEffect(() => {
    if (!data || !token) return;
    api.recordScheduleOpen(token, weekStart);
}, [data, token, weekStart]);
```

Import `recordScheduleOpen` and `getScheduleNotification` and `respondToSchedule` — they're already available from `../../api` (already imported as `* as api`).

- [ ] **Step 2: Add notification state and fetch**

Add state hooks after the existing `useState` declarations (before any early returns):

```jsx
const [notification, setNotification] = useState(null);
const [responding, setResponding] = useState(false);
const [responseNotes, setResponseNotes] = useState('');
const [showResponseForm, setShowResponseForm] = useState(false);
```

Add a useEffect to fetch the notification:

```jsx
useEffect(() => {
    if (!token || !weekStart) return;
    api.getScheduleNotification(token, weekStart).then(n => {
        if (n && n.confirmationToken) setNotification(n);
        else setNotification(null);
    }).catch(() => setNotification(null));
}, [token, weekStart]);
```

- [ ] **Step 3: Add response handler**

Add handler function:

```jsx
const handleRespond = async (response) => {
    if (!notification?.confirmationToken) return;
    setResponding(true);
    try {
        await api.respondToSchedule(notification.confirmationToken, response, responseNotes);
        setNotification(prev => ({ ...prev, response, responseNotes, respondedAt: new Date().toISOString() }));
        setShowResponseForm(false);
        setResponseNotes('');
    } catch (err) {
        // silently fail — employee can retry
    } finally {
        setResponding(false);
    }
};
```

- [ ] **Step 4: Add acknowledgement UI section**

Add the acknowledgement section before the footer div (before `{/* Footer */}` comment, around line 309). Insert this JSX:

```jsx
{notification && (
    <div style={{ marginTop: 20, padding: 16, border: '1px solid hsl(var(--border))', borderRadius: 12, background: 'hsl(var(--card))' }}>
        {notification.response && !showResponseForm ? (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>
                        {notification.response === 'accepted' ? '✓' : notification.response === 'rejected' ? '✗' : '⚠'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: notification.response === 'accepted' ? '#166534' : notification.response === 'rejected' ? '#991b1b' : '#92400e' }}>
                        {notification.response === 'accepted' ? 'Schedule Accepted' : notification.response === 'rejected' ? 'Schedule Rejected' : 'Changes Requested'}
                    </span>
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                        — {new Date(notification.respondedAt).toLocaleString()}
                    </span>
                </div>
                <button className="btn btn--outline btn--sm" style={{ fontSize: 12 }} onClick={() => setShowResponseForm(true)}>Change Response</button>
            </div>
        ) : (
            <div>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>Schedule Acknowledgement</h3>
                {notification.message && (
                    <div style={{ background: '#f0f7ff', borderLeft: '3px solid #3b82f6', padding: '10px 14px', borderRadius: 4, marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#1e3a5f', fontWeight: 500 }}>Message from your scheduler:</p>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#374151' }}>{notification.message}</p>
                    </div>
                )}
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                    Please confirm you've reviewed your schedule:
                </p>
                <textarea
                    placeholder="Notes (optional)"
                    value={responseNotes}
                    onChange={e => setResponseNotes(e.target.value)}
                    style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid hsl(var(--border))', fontSize: 13, marginBottom: 12, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn--primary btn--sm" disabled={responding} onClick={() => handleRespond('accepted')}>
                        Accept Schedule
                    </button>
                    <button className="btn btn--outline btn--sm" disabled={responding} onClick={() => handleRespond('changes_requested')} style={{ borderColor: '#f59e0b', color: '#92400e' }}>
                        Request Changes
                    </button>
                    <button className="btn btn--outline btn--sm" disabled={responding} onClick={() => handleRespond('rejected')} style={{ borderColor: '#ef4444', color: '#991b1b' }}>
                        Reject
                    </button>
                </div>
            </div>
        )}
    </div>
)}
```

- [ ] **Step 5: Verify the page renders correctly**

Run the dev servers:
```bash
cd server && npm run dev &
cd client && npm run dev &
```

Open `http://localhost:5173/schedule/view/<any-valid-token>` in a browser. Verify:
1. Schedule loads as before
2. If a notification was sent for that week, the acknowledgement section appears
3. Accept/Reject buttons are functional

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/scheduling/ScheduleViewPage.jsx
git commit -m "feat: add open tracking and acknowledgement UI to ScheduleViewPage"
```

---

### Task 8: Frontend — ScheduleDelivery Enhanced Table + Bulk Send

**Files:**
- Modify: `client/src/pages/scheduling/ScheduleDelivery.jsx`

- [ ] **Step 1: Add state for checkboxes, notification status, and bulk modal**

Replace the existing state declarations at the top of the component with:

```jsx
const [expanded, setExpanded] = useState(true);
const [fullscreen, setFullscreen] = useState(false);
const [sendingId, setSendingId] = useState(null);
const [bulkSending, setBulkSending] = useState(false);
const [sentIds, setSentIds] = useState(new Set());
const [selectedIds, setSelectedIds] = useState(new Set());
const [showBulkModal, setShowBulkModal] = useState(false);
const [bulkMessage, setBulkMessage] = useState('');
const [notifStatus, setNotifStatus] = useState([]);
const [empSearch, setEmpSearch] = useState('');
const { showToast } = useToast();
```

Remove the old `confirmEmp`, `responses` state variables — they're being replaced by `notifStatus`.

- [ ] **Step 2: Replace response-fetching effect with notification status**

Replace the `useEffect` that fetches `getScheduleResponses` with:

```jsx
const loadStatus = useCallback(async () => {
    if (!weekStart) return;
    try {
        const data = await api.getNotificationStatus(weekStart);
        setNotifStatus(data);
    } catch {}
}, [weekStart]);

useEffect(() => { loadStatus(); }, [loadStatus]);
```

- [ ] **Step 3: Compute status-by-employee from notifications**

Replace the `responsesByEmp` useMemo with:

```jsx
const statusByEmp = useMemo(() => {
    const map = new Map();
    for (const n of notifStatus) {
        const empId = n.employee?.id || n.employeeId;
        if (!map.has(empId)) {
            map.set(empId, n);
        }
    }
    return map;
}, [notifStatus]);
```

(Notifications are already ordered by `createdAt desc` from the backend, so the first one per employee is the most recent.)

- [ ] **Step 4: Add checkbox handlers**

```jsx
const toggleSelect = (id) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
};

const toggleSelectAll = () => {
    const withContact = filteredEmployees.filter(e => e.email || e.phone);
    if (selectedIds.size === withContact.length) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(withContact.map(e => e.id)));
    }
};
```

- [ ] **Step 5: Add bulk send handler**

```jsx
const handleBulkSend = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkSending(true);
    try {
        const result = await api.sendScheduleNotifications({
            weekStart,
            employeeIds: ids,
            message: bulkMessage,
        });
        const sentCount = result.results?.filter(r => r.status === 'sent').length || 0;
        showToast(`Schedule sent to ${sentCount} employee${sentCount !== 1 ? 's' : ''}`);
        setSelectedIds(new Set());
        setShowBulkModal(false);
        setBulkMessage('');
        loadStatus();
    } catch (err) {
        showToast(err.message || 'Failed to send schedules', 'error');
    } finally {
        setBulkSending(false);
    }
};

const handleSendAll = () => {
    const withContact = filteredEmployees.filter(e => e.email || e.phone);
    setSelectedIds(new Set(withContact.map(e => e.id)));
    setShowBulkModal(true);
};
```

- [ ] **Step 6: Replace table header and body with enhanced columns**

Replace the `<thead>` with:

```jsx
<thead>
    <tr>
        <th scope="col" style={{ width: 36 }}>
            <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === filteredEmployees.filter(e => e.email || e.phone).length} onChange={toggleSelectAll} />
        </th>
        <th scope="col">Employee</th>
        <th scope="col">Contact</th>
        <th scope="col">Shifts</th>
        <th scope="col">Sent</th>
        <th scope="col">Opened</th>
        <th scope="col">Response</th>
        <th scope="col" style={{ width: 100 }}>Actions</th>
    </tr>
</thead>
```

Replace each `<tr>` in `<tbody>` with:

```jsx
{filteredEmployees.map(emp => {
    const hasContact = !!(emp.email || emp.phone);
    const isSending = sendingId === emp.id;
    const isSent = sentIds.has(emp.id);
    const status = statusByEmp.get(emp.id);
    return (
        <tr key={emp.id}>
            <td><input type="checkbox" checked={selectedIds.has(emp.id)} onChange={() => toggleSelect(emp.id)} disabled={!hasContact} /></td>
            <td style={{ fontWeight: 500 }}>{emp.name}</td>
            <td>
                {emp.email ? (
                    <span style={{ fontSize: 12 }} title={emp.email}>{emp.email.length > 20 ? emp.email.slice(0, 20) + '...' : emp.email}</span>
                ) : emp.phone ? (
                    <span style={{ fontSize: 12 }}>{emp.phone}</span>
                ) : (
                    <span style={{ fontSize: 12, color: 'hsl(var(--destructive))', fontStyle: 'italic' }}>No contact</span>
                )}
            </td>
            <td>
                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}>
                    {emp.shiftCount}
                </span>
            </td>
            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                {status?.sentAt ? new Date(status.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
            </td>
            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                {status?.openedAt ? new Date(status.openedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
            </td>
            <td>
                {status?.response ? (() => {
                    const colors = { accepted: { bg: '#dcfce7', color: '#166534', label: 'Accepted' }, rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' }, changes_requested: { bg: '#fef3c7', color: '#92400e', label: 'Changes Req.' } };
                    const c = colors[status.response] || { bg: '#f3f4f6', color: '#374151', label: status.response };
                    return <span title={status.respondedAt ? new Date(status.respondedAt).toLocaleString() : ''} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
                })() : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
            </td>
            <td>
                <button
                    className="btn btn--outline btn--sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => { setSelectedIds(new Set([emp.id])); setShowBulkModal(true); }}
                    disabled={!hasContact || isSending}
                >
                    {isSending ? 'Sending...' : isSent ? 'Sent!' : status?.sentAt ? 'Resend' : 'Send'}
                </button>
            </td>
        </tr>
    );
})}
```

- [ ] **Step 7: Add toolbar with bulk actions above the table**

Replace the existing paragraph + search input row with:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
    <button className="btn btn--outline btn--sm" style={{ fontSize: 11 }} onClick={toggleSelectAll}>
        {selectedIds.size > 0 ? 'Deselect All' : 'Select All'}
    </button>
    <button className="btn btn--primary btn--sm" style={{ fontSize: 11 }} disabled={selectedIds.size === 0} onClick={() => setShowBulkModal(true)}>
        Send Selected ({selectedIds.size})
    </button>
    <button className="btn btn--outline btn--sm" style={{ fontSize: 11 }} onClick={handleSendAll}>
        Send All
    </button>
    <div style={{ flex: 1 }} />
    <input
        type="text"
        className="context-bar__search"
        placeholder="Search employee..."
        value={empSearch}
        onChange={e => setEmpSearch(e.target.value)}
        style={{ width: 200, margin: 0 }}
    />
</div>
```

- [ ] **Step 8: Replace the confirmation modal with the bulk send modal**

Remove the old `confirmEmp` modal. Replace with:

```jsx
{showBulkModal && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Send Schedule to {selectedIds.size} employee{selectedIds.size !== 1 ? 's' : ''}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                Week of {weekStart}
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Message (optional):</label>
            <textarea
                value={bulkMessage}
                onChange={e => setBulkMessage(e.target.value)}
                placeholder="e.g. Please review your weekend shifts carefully."
                style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 13, marginBottom: 12, resize: 'vertical' }}
            />
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, maxHeight: 120, overflowY: 'auto' }}>
                <strong>Recipients:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {employees.filter(e => selectedIds.has(e.id)).map(e => (
                        <li key={e.id}>{e.name} ({e.email ? 'email' : 'SMS'})</li>
                    ))}
                </ul>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn--outline btn--sm" onClick={() => { setShowBulkModal(false); setBulkMessage(''); }} disabled={bulkSending}>Cancel</button>
                <button className="btn btn--primary btn--sm" onClick={handleBulkSend} disabled={bulkSending}>
                    {bulkSending ? 'Sending...' : 'Send Schedules'}
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 9: Remove dead code**

Remove the `getResponseBadge` function and the old `responsesByEmp` useMemo since they're replaced by `statusByEmp`. Remove `confirmEmp` state and related handlers.

- [ ] **Step 10: Test in browser**

Open `http://localhost:5173/scheduling` in a browser. Navigate to the ScheduleDelivery panel. Verify:
1. Checkboxes appear on each employee row
2. Select All / Send Selected / Send All buttons work
3. Clicking "Send Selected" opens modal with message textarea and recipient list
4. After sending, Sent/Opened/Response columns update
5. Individual "Send" / "Resend" buttons work

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/scheduling/ScheduleDelivery.jsx
git commit -m "feat: enhanced ScheduleDelivery with bulk send, status columns, and message modal"
```

---

### Task 9: Integration Testing + Cleanup

**Files:**
- All modified files (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 2: Full flow manual test**

1. Open admin UI → Scheduling → Send Schedule panel
2. Select 2+ employees → "Send Selected" → type a message → confirm
3. Verify "Sent" column updates with timestamp
4. Open one employee's schedule link (from employee-schedule-links list or the email)
5. Verify the acknowledgement section shows with the admin message
6. Click "Accept Schedule"
7. Return to admin UI → verify "Opened" and "Response" columns show timestamps/badges
8. Test "Resend" on an employee who already responded
9. Verify the schedule view page shows fresh state after resend

- [ ] **Step 3: Test edge cases**

1. Open schedule link for a week with no notification sent → acknowledgement section should NOT appear
2. Employee changes response via "Change Response" button → verify it updates
3. Employee with no email/phone → checkbox disabled, send button disabled

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A && git commit -m "chore: integration test cleanup"
```

---

## Summary

| Task | Description | Estimated Time |
|------|-------------|---------------|
| 1 | Database migration (3 new fields) | 3 min |
| 2 | recordOpen endpoint | 5 min |
| 3 | getNotificationForView endpoint | 4 min |
| 4 | Modify sendSchedules (message + sentBy) | 5 min |
| 5 | Enhance getNotificationStatus | 3 min |
| 6 | Frontend API functions | 2 min |
| 7 | ScheduleViewPage (open tracking + acknowledgement) | 8 min |
| 8 | ScheduleDelivery (bulk send + status columns) | 12 min |
| 9 | Integration testing | 5 min |
