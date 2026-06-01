# Timesheet Compliance Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically identify overdue timesheets, email caregivers on Sunday morning, and show overdue counts on the admin dashboard.

**Architecture:** Computed "overdue" label derived from `status === 'draft'` + week has passed. A `node-cron` job runs Sunday 6 AM UTC to send one-time email reminders via Brevo. A new `TimesheetReminder` table tracks what's been sent.

**Tech Stack:** Node.js, Prisma ORM, node-cron, Brevo (sib-api-v3-sdk), React

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/prisma/schema.prisma` | Modify | Add `TimesheetReminder` model + relation on `Timesheet` |
| `server/src/lib/timesheetUtils.js` | Create | `isOverdue(timesheet)` helper |
| `server/src/jobs/timesheetReminders.js` | Create | Cron job logic: query overdue, send emails, log |
| `server/src/index.js` | Modify | Initialize cron after server starts |
| `server/src/controllers/timesheetController.js` | Modify | Enrich list response with `isOverdue` |
| `server/src/controllers/dashboardController.js` | Modify | Add `overdueTimesheets` to stats response |
| `client/src/pages/DashboardPage.jsx` | Modify | Render overdue alert in Needs Attention |
| `client/src/pages/TimesheetsListPage.jsx` | Modify | Add overdue badge + filter option |
| `client/src/index.css` | Modify | Add `.ts-badge--overdue` style |
| `server/package.json` | Modify | Add `node-cron` dependency |

---

### Task 1: Add node-cron dependency

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install node-cron**

```bash
cd server && npm install node-cron
```

- [ ] **Step 2: Verify installation**

```bash
cd server && node -e "require('node-cron'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: add node-cron dependency"
```

---

### Task 2: Create TimesheetReminder migration and model

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add TimesheetReminder model to schema**

Add at the end of `server/prisma/schema.prisma`:

```prisma
model TimesheetReminder {
  id          Int       @id @default(autoincrement())
  timesheetId Int       @map("timesheet_id")
  employeeId  Int?      @map("employee_id")
  sentAt      DateTime  @default(now()) @map("sent_at")
  channel     String    @default("email")
  status      String    @default("sent")

  timesheet   Timesheet @relation(fields: [timesheetId], references: [id], onDelete: Cascade)

  @@map("timesheet_reminders")
}
```

Add relation to the existing `Timesheet` model — add this line inside the Timesheet model block:

```prisma
  reminders         TimesheetReminder[]
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd server && npx prisma migrate dev --name add_timesheet_reminders
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify by checking generated client**

```bash
cd server && node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log(typeof p.timesheetReminder.findMany)"
```

Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add TimesheetReminder model for tracking sent reminders"
```

---

### Task 3: Create isOverdue utility function

**Files:**
- Create: `server/src/lib/timesheetUtils.js`
- Create: `server/tests/timesheetUtils.test.js`

- [ ] **Step 1: Write the test**

Create `server/tests/timesheetUtils.test.js`:

```javascript
const { isOverdue } = require('../src/lib/timesheetUtils');

describe('isOverdue', () => {
    it('returns true for draft timesheet whose week has passed', () => {
        const ts = { status: 'draft', weekStart: new Date('2026-05-18T00:00:00Z') };
        // Saturday of that week is May 24. If today is May 25+, it's overdue.
        jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:00:00Z'));
        expect(isOverdue(ts)).toBe(true);
        jest.useRealTimers();
    });

    it('returns false for draft timesheet whose week has not ended', () => {
        const ts = { status: 'draft', weekStart: new Date('2026-05-25T00:00:00Z') };
        // Saturday of that week is May 31. If today is May 28, not overdue yet.
        jest.useFakeTimers().setSystemTime(new Date('2026-05-28T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });

    it('returns false for submitted timesheet even if week passed', () => {
        const ts = { status: 'submitted', weekStart: new Date('2026-05-18T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });

    it('returns false for accepted timesheet', () => {
        const ts = { status: 'accepted', weekStart: new Date('2026-05-18T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-06-01T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest tests/timesheetUtils.test.js --verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/timesheetUtils.js`:

```javascript
function isOverdue(timesheet) {
    if (timesheet.status !== 'draft') return false;
    const weekStart = new Date(timesheet.weekStart);
    const saturday = new Date(weekStart);
    saturday.setUTCDate(saturday.getUTCDate() + 6);
    saturday.setUTCHours(23, 59, 59, 999);
    return new Date() > saturday;
}

module.exports = { isOverdue };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx jest tests/timesheetUtils.test.js --verbose
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/timesheetUtils.js server/tests/timesheetUtils.test.js
git commit -m "feat: add isOverdue utility for computed overdue label"
```

---

### Task 4: Create the cron job for Sunday reminders

**Files:**
- Create: `server/src/jobs/timesheetReminders.js`

- [ ] **Step 1: Create the reminder job**

Create `server/src/jobs/timesheetReminders.js`:

```javascript
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');
const { isOverdue } = require('../lib/timesheetUtils');

async function sendOverdueReminders() {
    if (!isEmailConfigured()) {
        console.log('[TimesheetReminders] Email not configured, skipping.');
        return { sent: 0, skipped: 0 };
    }

    const overdueTimesheets = await prisma.timesheet.findMany({
        where: {
            status: 'draft',
            archivedAt: null,
            reminders: { none: {} },
        },
        include: {
            client: true,
        },
    });

    const actuallyOverdue = overdueTimesheets.filter(isOverdue);

    let sent = 0;
    let skipped = 0;

    for (const ts of actuallyOverdue) {
        const permanentLink = await prisma.permanentLink.findFirst({
            where: { clientId: ts.clientId, pcaName: ts.pcaName },
        });

        const employee = await prisma.employee.findFirst({
            where: { name: ts.pcaName },
            include: { user: true },
        });

        const email = employee?.user?.email || employee?.email;
        if (!email) {
            console.log(`[TimesheetReminders] No email for PCA "${ts.pcaName}", skipping timesheet ${ts.id}`);
            skipped++;
            continue;
        }

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const weekRange = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

        const formLink = permanentLink
            ? `${process.env.APP_URL || 'https://nvbestpca.com'}/pca-form/${permanentLink.token}`
            : '';

        const subject = `Timesheet Reminder: Week of ${weekRange} not submitted`;
        const html = `
            <p>Hi ${ts.pcaName},</p>
            <p>Your timesheet for <strong>${ts.client.clientName}</strong> for the week of <strong>${weekRange}</strong> has not been submitted.</p>
            <p>Please submit it as soon as possible to avoid payroll delays.</p>
            ${formLink ? `<p><a href="${formLink}">Click here to open your timesheet</a></p>` : ''}
            <p>Thank you,<br>NV Best PCA</p>
        `;

        try {
            await sendEmail(email, subject, html);
            await prisma.timesheetReminder.create({
                data: {
                    timesheetId: ts.id,
                    employeeId: employee?.id || null,
                    channel: 'email',
                    status: 'sent',
                },
            });
            sent++;
            console.log(`[TimesheetReminders] Sent reminder for timesheet ${ts.id} to ${email}`);
        } catch (err) {
            console.error(`[TimesheetReminders] Failed to send to ${email}:`, err.message);
            await prisma.timesheetReminder.create({
                data: {
                    timesheetId: ts.id,
                    employeeId: employee?.id || null,
                    channel: 'email',
                    status: 'failed',
                },
            });
            skipped++;
        }
    }

    console.log(`[TimesheetReminders] Done. Sent: ${sent}, Skipped: ${skipped}`);
    return { sent, skipped };
}

module.exports = { sendOverdueReminders };
```

- [ ] **Step 2: Verify file loads without error**

```bash
cd server && node -e "require('./src/jobs/timesheetReminders'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add server/src/jobs/timesheetReminders.js
git commit -m "feat: add timesheet reminder cron job logic"
```

---

### Task 5: Initialize cron in server startup

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Add cron initialization**

Replace the contents of `server/src/index.js` with:

```javascript
require('dotenv').config();
const app = require('./app');
const cron = require('node-cron');
const { sendOverdueReminders } = require('./src/jobs/timesheetReminders');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 Auth Tracking API running on http://localhost:${PORT}`);

    // Sunday 6:00 AM UTC — send overdue timesheet reminders
    cron.schedule('0 6 * * 0', async () => {
        console.log('[Cron] Running overdue timesheet reminders...');
        try {
            await sendOverdueReminders();
        } catch (err) {
            console.error('[Cron] Reminder job failed:', err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: overdue timesheet reminders (Sunday 6:00 AM UTC)');
});
```

- [ ] **Step 2: Verify server starts**

```bash
cd server && timeout 3 node src/index.js 2>&1 || true
```

Expected: Output includes both "Auth Tracking API running" and "Scheduled: overdue timesheet reminders".

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat: initialize timesheet reminder cron job on server start"
```

---

### Task 6: Enrich timesheets list endpoint with isOverdue

**Files:**
- Modify: `server/src/controllers/timesheetController.js`

- [ ] **Step 1: Add isOverdue to list response**

At the top of `timesheetController.js`, add the import:

```javascript
const { isOverdue } = require('../lib/timesheetUtils');
```

In the `listTimesheets` function, after fetching timesheets and before returning the response, map over results to add the `isOverdue` field. Find where the response is sent (typically `res.json(timesheets)`) and change it to:

```javascript
const enriched = timesheets.map(ts => ({ ...ts, isOverdue: isOverdue(ts) }));
res.json(enriched);
```

- [ ] **Step 2: Test the endpoint**

```bash
cd server && curl -s http://localhost:4000/api/timesheets -H "Authorization: Bearer <token>" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const arr=JSON.parse(d);console.log('hasOverdueField:', 'isOverdue' in (arr[0]||{}))"
```

Expected: `hasOverdueField: true`

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/timesheetController.js
git commit -m "feat: add isOverdue field to timesheets list response"
```

---

### Task 7: Add overdue timesheets to dashboard stats

**Files:**
- Modify: `server/src/controllers/dashboardController.js`

- [ ] **Step 1: Add overdue query to getDashboardStats**

Import at the top:

```javascript
const { isOverdue } = require('../lib/timesheetUtils');
```

Inside the `getDashboardStats` function, add a query alongside the existing ones:

```javascript
const overdueRaw = await prisma.timesheet.findMany({
    where: { status: 'draft', archivedAt: null },
    select: { id: true, pcaName: true, weekStart: true, client: { select: { clientName: true } } },
});
const overdueTimesheets = overdueRaw.filter(isOverdue).map(ts => ({
    timesheetId: ts.id,
    clientName: ts.client.clientName,
    pcaName: ts.pcaName,
    weekStart: ts.weekStart,
}));
```

Add to the response object:

```javascript
overdueTimesheets: { count: overdueTimesheets.length, items: overdueTimesheets },
```

- [ ] **Step 2: Commit**

```bash
git add server/src/controllers/dashboardController.js
git commit -m "feat: include overdue timesheets in dashboard stats"
```

---

### Task 8: Render overdue alert on dashboard UI

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Add overdue timesheets to attentionItems**

In `DashboardPage.jsx`, find where `attentionItems` is built (around line 38). Add after the existing items:

```javascript
if (stats.overdueTimesheets?.count > 0) {
    attentionItems.push({
        icon: Icons.clock,
        label: `${stats.overdueTimesheets.count} timesheet${stats.overdueTimesheets.count > 1 ? 's' : ''} overdue`,
        severity: 'destructive',
        action: () => navigate('/timesheets?status=overdue'),
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: show overdue timesheets in dashboard Needs Attention"
```

---

### Task 9: Add overdue badge and filter to timesheets list

**Files:**
- Modify: `client/src/pages/TimesheetsListPage.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Add "Overdue" option to the status filter dropdown**

In `TimesheetsListPage.jsx`, find the status filter `<select>` (around line 307) and add:

```jsx
<option value="overdue">Overdue</option>
```

- [ ] **Step 2: Update filtering logic to handle "overdue"**

Find the client-side filter logic that filters by `statusFilter`. Add handling for the "overdue" value:

```javascript
if (statusFilter === 'overdue') {
    filtered = filtered.filter(ts => ts.isOverdue);
} else if (statusFilter) {
    filtered = filtered.filter(ts => ts.status === statusFilter);
}
```

- [ ] **Step 3: Update status badge rendering**

Find the status badge rendering (around line 411 where `<span className={`ts-badge ts-badge--${ts.status}`}>` is). Replace with:

```jsx
<span className={`ts-badge ${ts.isOverdue ? 'ts-badge--overdue' : `ts-badge--${ts.status}`}`}>
    {ts.isOverdue ? 'Overdue' : ts.status}
</span>
```

- [ ] **Step 4: Add overdue badge CSS**

In `client/src/index.css`, find the existing `.ts-badge--draft` style and add nearby:

```css
.ts-badge--overdue {
  background: hsl(0 80% 95%);
  color: hsl(0 72% 40%);
  font-weight: 600;
}
```

- [ ] **Step 5: Add overdue count to summary cards (optional enhancement)**

In the summary cards section, add an overdue count card:

```jsx
<div className="ts-summary-card">
    <div className="ts-summary-card__icon ts-summary-card__icon--overdue">{Icons.alertCircle}</div>
    <div className="ts-summary-card__content">
        <span className="ts-summary-card__label">Overdue</span>
        <span className="ts-summary-card__value">{timesheets.filter(ts => ts.isOverdue).length}</span>
    </div>
</div>
```

Add CSS for the icon color:

```css
.ts-summary-card__icon--overdue {
  background: hsl(0 80% 95%);
  color: hsl(0 72% 40%);
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TimesheetsListPage.jsx client/src/index.css
git commit -m "feat: add overdue badge and filter to timesheets list"
```

---

### Task 10: Add admin endpoint to manually trigger reminders

**Files:**
- Modify: `server/src/routes/api.js`
- Modify: `server/src/controllers/timesheetController.js`

- [ ] **Step 1: Add controller function**

In `timesheetController.js`, add:

```javascript
async function sendTimesheetReminders(req, res) {
    const { sendOverdueReminders } = require('../jobs/timesheetReminders');
    try {
        const result = await sendOverdueReminders();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
```

Export it alongside the other exports.

- [ ] **Step 2: Add route**

In `server/src/routes/api.js`, add alongside timesheet routes:

```javascript
router.post('/timesheets/send-reminders', requireRole('admin'), sendTimesheetReminders);
```

Place this BEFORE the `router.get('/timesheets/:id', ...)` route to avoid route parameter conflicts.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/api.js server/src/controllers/timesheetController.js
git commit -m "feat: add admin endpoint to manually trigger overdue reminders"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Computed "Overdue" label → Task 3 (utility), Task 6 (backend enrichment), Task 9 (frontend badge)
- ✅ node-cron Sunday 6 AM → Task 4 (logic), Task 5 (initialization)
- ✅ TimesheetReminder table → Task 2
- ✅ Dashboard Needs Attention → Task 7 (backend), Task 8 (frontend)
- ✅ Timesheets list enhancement → Task 9
- ✅ Manual trigger endpoint → Task 10 (bonus for testing/admin use)

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `isOverdue(timesheet)` takes an object with `status` (string) and `weekStart` (Date/string) — consistent across Task 3, 6, and 7. `sendOverdueReminders()` returns `{ sent, skipped }` — consistent in Task 4 and 10.
