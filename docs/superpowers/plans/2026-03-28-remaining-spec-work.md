# Remaining Spec Work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining items from the Master Sheet & Scheduling Redesign spec — shift model fields, PATCH clients endpoint, scheduling calendar grid flip, shift form enhancements, notification updates, and Master Sheet redesign with DrawerPanel.

**Architecture:** Backend-first approach. Add shift schema fields and PATCH endpoint first (Tasks 1-2), then update the scheduling calendar grid and form (Tasks 3-5), then redesign the Master Sheet with DrawerPanel (Tasks 6-8), then wire up notifications (Task 9).

**Tech Stack:** Express.js + Prisma + SQLite (backend), React 19 + Vite (frontend), CSS (no framework)

**Spec:** `docs/superpowers/specs/2026-03-28-master-sheet-scheduling-redesign.md`

---

## File Structure

### Backend changes
- **Modify:** `server/prisma/schema.prisma` — add `accountNumber`, `sandataClientId` to Shift model
- **Create:** `server/prisma/migrations/20260328100000_add_shift_account_fields/migration.sql`
- **Modify:** `server/src/controllers/schedulingController.js` — accept new fields in create/update
- **Modify:** `server/src/controllers/clientController.js` — add `patchClient` function
- **Modify:** `server/src/routes/api.js` — add PATCH route for clients
- **Modify:** `server/src/services/notificationService.js` — update SMS/email templates

### Frontend changes
- **Modify:** `client/src/api.js` — add `patchClient` function, update `createShift`/`updateShift`
- **Rewrite:** `client/src/pages/SchedulingPage.jsx` — replace ScheduleTimeGrid with ScheduleWeekGrid, update ShiftFormModal
- **Modify:** `client/src/index.css` — replace `.sched-tg` styles with `.sched-wg` styles, add `.drawer-panel` styles
- **Rewrite:** `client/src/pages/ClientsPage.jsx` — compact 6-column table + DrawerPanel

---

### Task 1: Add accountNumber and sandataClientId to Shift schema

**Files:**
- Modify: `server/prisma/schema.prisma:238-260`
- Create: `server/prisma/migrations/20260328100000_add_shift_account_fields/migration.sql`

- [ ] **Step 1: Add fields to Shift model in schema.prisma**

In `server/prisma/schema.prisma`, add two fields to the Shift model after `recurringGroupId` (line 250):

```prisma
  accountNumber    String    @default("") @map("account_number")
  sandataClientId  String    @default("") @map("sandata_client_id")
```

- [ ] **Step 2: Create the migration SQL**

Create `server/prisma/migrations/20260328100000_add_shift_account_fields/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "shifts" ADD COLUMN "account_number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "shifts" ADD COLUMN "sandata_client_id" TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 3: Verify migration applies**

Run: `cd server && npx prisma migrate dev --name add_shift_account_fields`
Expected: Migration applies cleanly, Prisma client regenerated.

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd server && npm test`
Expected: All 27 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260328100000_add_shift_account_fields/
git commit -m "feat: add accountNumber and sandataClientId to Shift model"
```

---

### Task 2: Add PATCH /api/clients/:id endpoint and update shift controllers

**Files:**
- Modify: `server/src/controllers/clientController.js:58-83`
- Modify: `server/src/routes/api.js`
- Modify: `server/src/controllers/schedulingController.js:142-293`
- Modify: `client/src/api.js`

- [ ] **Step 1: Add patchClient to clientController.js**

Add this function after the existing `updateClient` function in `server/src/controllers/clientController.js`:

```javascript
async function patchClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { address, phone, gateCode, notes } = req.body;
        const data = {};
        if (address !== undefined) data.address = address;
        if (phone !== undefined) data.phone = phone;
        if (gateCode !== undefined) data.gateCode = gateCode;
        if (notes !== undefined) data.notes = notes;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const client = await prisma.client.update({
            where: { id },
            data,
            include: { authorizations: true },
        });
        res.json(client);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
        next(err);
    }
}
```

Update the `module.exports` to include `patchClient`.

- [ ] **Step 2: Add PATCH route in api.js**

In `server/src/routes/api.js`, add after the existing `router.put('/clients/:id', ...)` line:

```javascript
router.patch('/clients/:id', requireRole('admin'), clientController.patchClient);
```

- [ ] **Step 3: Add accountNumber validation and acceptance in schedulingController.js**

At the top of `server/src/controllers/schedulingController.js` (after the require statements), add:

```javascript
const VALID_ACCOUNT_NUMBERS = ['71040', '71119', '71120', '71635'];
```

In the `createShift` function, after destructuring `req.body` (line 144), add `accountNumber` and `sandataClientId` to the destructured fields. Add validation:

```javascript
const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes, repeatUntil, force, accountNumber, sandataClientId } = req.body;
```

Add validation after the required fields check:

```javascript
if (accountNumber && !VALID_ACCOUNT_NUMBERS.includes(accountNumber)) {
    return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNT_NUMBERS.join(', ')}` });
}
```

Add to `baseData` object:

```javascript
accountNumber: accountNumber || '',
sandataClientId: sandataClientId || '',
```

In the `updateShift` function, add `accountNumber` and `sandataClientId` to destructuring and to the `data` object building:

```javascript
const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes, status, force, accountNumber, sandataClientId } = req.body;
```

```javascript
if (accountNumber !== undefined) {
    if (accountNumber && !VALID_ACCOUNT_NUMBERS.includes(accountNumber)) {
        return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNT_NUMBERS.join(', ')}` });
    }
    data.accountNumber = accountNumber;
}
if (sandataClientId !== undefined) data.sandataClientId = sandataClientId;
```

- [ ] **Step 4: Add patchClient to frontend api.js**

In `client/src/api.js`, add after the `updateClient` export:

```javascript
export const patchClient = (id, data) =>
    request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
```

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: All tests pass (no behavioral change to existing tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/clientController.js server/src/routes/api.js server/src/controllers/schedulingController.js client/src/api.js
git commit -m "feat: add PATCH /api/clients/:id, accept accountNumber/sandataClientId on shifts"
```

---

### Task 3: Replace ScheduleTimeGrid with ScheduleWeekGrid

This is the core calendar rewrite. Replace the current `ScheduleTimeGrid` component (lines 321-449 of SchedulingPage.jsx) with a new `ScheduleWeekGrid` that has days as columns and hours as rows.

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx:321-449` (replace ScheduleTimeGrid)
- Modify: `client/src/index.css:2262-2426` (replace `.sched-tg` styles with `.sched-wg` styles)

- [ ] **Step 1: Replace ScheduleTimeGrid with ScheduleWeekGrid in SchedulingPage.jsx**

Replace the entire `ScheduleTimeGrid` function (lines 321-449) with:

```jsx
const GRID_START_HOUR = 4;
const GRID_END_HOUR = 24; // midnight
const HOUR_HEIGHT = 60;
const GUTTER_WIDTH = 60;

function ScheduleWeekGrid({ shifts, weekStart, onAddShift, onEditShift, viewMode, overlapIds }) {
    const days = [];
    const ws = new Date(weekStart + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days.push(d);
    }
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayStr = toLocalDateStr(new Date());
    const hours = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) hours.push(h);
    const totalHeight = hours.length * HOUR_HEIGHT;

    const fmtHour = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

    // Group shifts by date string
    const shiftsByDate = {};
    for (const s of shifts) {
        const d = toLocalDateStr(s.shiftDate);
        if (!shiftsByDate[d]) shiftsByDate[d] = [];
        shiftsByDate[d].push(s);
    }

    // Compute overlap columns for a set of shifts in one day
    const computeColumns = (dayShifts) => {
        const toMin = (t) => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
        const sorted = [...dayShifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
        const columns = []; // array of { shift, col, totalCols }
        const active = []; // currently overlapping groups

        for (const s of sorted) {
            let sStart = toMin(s.startTime);
            let sEnd = toMin(s.endTime);
            if (sEnd <= sStart) sEnd += 24 * 60;

            // Find which column this shift fits in
            let col = 0;
            const usedCols = new Set();
            for (const a of active) {
                let aEnd = toMin(a.shift.endTime);
                if (aEnd <= toMin(a.shift.startTime)) aEnd += 24 * 60;
                if (sStart < aEnd) usedCols.add(a.col);
            }
            while (usedCols.has(col)) col++;
            active.push({ shift: s, col });
            columns.push({ shift: s, col });
        }

        // Compute total columns per overlap group
        const maxCol = columns.length > 0 ? Math.max(...columns.map(c => c.col)) + 1 : 1;
        return columns.map(c => ({ ...c, totalCols: maxCol }));
    };

    const handleDayClick = (e, dateStr) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hour = Math.round(y / HOUR_HEIGHT) + GRID_START_HOUR;
        const snapped = Math.max(GRID_START_HOUR, Math.min(GRID_END_HOUR - 1, hour));
        const time = `${String(snapped).padStart(2, '0')}:00`;
        onAddShift(dateStr, time);
    };

    return (
        <div className="sched-wg">
            {/* Header row: gutter + day columns */}
            <div className="sched-wg__header">
                <div className="sched-wg__gutter" />
                {days.map((day, i) => {
                    const dateStr = toLocalDateStr(day);
                    const isToday = dateStr === todayStr;
                    return (
                        <div key={i} className={`sched-wg__day-header ${isToday ? 'sched-wg__day-header--today' : ''}`}>
                            <span className="sched-wg__day-abbr">{dayAbbr[i]}</span>
                            <span className="sched-wg__day-num">{day.getMonth() + 1}/{day.getDate()}</span>
                        </div>
                    );
                })}
            </div>

            {/* Body: time gutter + day columns with shift blocks */}
            <div className="sched-wg__body" style={{ height: totalHeight }}>
                {/* Time gutter */}
                <div className="sched-wg__gutter">
                    {hours.map(h => (
                        <div key={h} className="sched-wg__hour-label" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}>
                            {fmtHour(h)}
                        </div>
                    ))}
                </div>

                {/* Day columns */}
                {days.map((day, i) => {
                    const dateStr = toLocalDateStr(day);
                    const isToday = dateStr === todayStr;
                    const dayShifts = shiftsByDate[dateStr] || [];
                    const positioned = computeColumns(dayShifts);

                    return (
                        <div
                            key={i}
                            className={`sched-wg__day-col ${isToday ? 'sched-wg__day-col--today' : ''}`}
                            onClick={(e) => handleDayClick(e, dateStr)}
                        >
                            {/* Hour gridlines */}
                            {hours.map(h => (
                                <div key={h} className="sched-wg__hline" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }} />
                            ))}

                            {/* Shift blocks */}
                            {positioned.map(({ shift: s, col, totalCols }) => {
                                const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: s.serviceCode };
                                const isOverlap = overlapIds && overlapIds.has(s.id);
                                const isCancelled = s.status === 'cancelled';

                                const [sh, sm] = (s.startTime || '09:00').split(':').map(Number);
                                const [eh, em] = (s.endTime || '13:00').split(':').map(Number);
                                let startMin = sh * 60 + sm;
                                let endMin = eh * 60 + em;
                                if (endMin <= startMin) endMin += 24 * 60;
                                // Clip to grid bounds
                                const gridStartMin = GRID_START_HOUR * 60;
                                const gridEndMin = GRID_END_HOUR * 60;
                                const clippedStart = Math.max(startMin, gridStartMin);
                                const clippedEnd = Math.min(endMin, gridEndMin);
                                const top = ((clippedStart - gridStartMin) / 60) * HOUR_HEIGHT;
                                const height = Math.max(((clippedEnd - clippedStart) / 60) * HOUR_HEIGHT, 20);
                                const isClipped = endMin > gridEndMin;

                                const colWidth = 100 / totalCols;
                                const left = col * colWidth;

                                return (
                                    <button
                                        key={s.id}
                                        className={`sched-wg__block ${isCancelled ? 'sched-wg__block--cancelled' : ''} ${isOverlap ? 'sched-wg__block--overlap' : ''}`}
                                        style={{
                                            top: top + 'px',
                                            height: height + 'px',
                                            left: left + '%',
                                            width: colWidth + '%',
                                            '--block-color': colorInfo.color,
                                            '--block-bg': isOverlap ? 'hsl(0 84% 97%)' : colorInfo.bg,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); onEditShift(s); }}
                                        title={`${colorInfo.label} — ${hhmm12(s.startTime)} - ${hhmm12(s.endTime)} (${s.hours}h)`}
                                    >
                                        <span className="sched-wg__block-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span>
                                        <span className="sched-wg__block-time">{hhmm12(s.startTime)}-{hhmm12(s.endTime)}</span>
                                        {viewMode === 'client' && <span className="sched-wg__block-label">{s.displayEmployeeName || 'Unassigned'}</span>}
                                        {viewMode !== 'client' && <span className="sched-wg__block-label">{s.client?.clientName || ''}</span>}
                                        {isClipped && <span className="sched-wg__block-clip" title="Continues next day">...</span>}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Update the ScheduleTimeGrid reference to ScheduleWeekGrid**

In the SchedulingPage component's render section, every `<ScheduleTimeGrid` call must become `<ScheduleWeekGrid`. Search and replace all occurrences.

Also update `handleAddShift` to accept the optional time parameter:

```javascript
const handleAddShift = (dateStr, startTime) => {
    setModal({ type: 'shift', shift: null, defaultDate: dateStr, defaultStartTime: startTime });
};
```

And update the `ShiftFormModal` usage to pass `defaultStartTime`:

In `ShiftFormModal`, update the `startTime` useState:
```javascript
const [startTime, setStartTime] = useState(shift?.startTime || defaultStartTime || '09:00');
```

And add `defaultStartTime` to the props destructuring.

- [ ] **Step 3: Replace .sched-tg CSS with .sched-wg CSS**

In `client/src/index.css`, replace the entire `.sched-tg` block (lines 2262-2426, from `/* ── Time Grid Calendar */` through the last `.sched-tg__block-label` rule) with:

```css
/* ── Week Grid Calendar (x=days, y=hours) ── */
.sched-wg {
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 16px;
    background: hsl(var(--card));
}

/* Header row */
.sched-wg__header {
    display: flex;
    border-bottom: 2px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.4);
}
.sched-wg__day-header {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    border-left: 1px solid hsl(var(--border));
}
.sched-wg__day-header--today {
    background: hsl(217 91% 98%);
}
.sched-wg__day-abbr {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
    letter-spacing: 0.5px;
}
.sched-wg__day-header--today .sched-wg__day-abbr {
    color: hsl(217 91% 50%);
}
.sched-wg__day-num {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: hsl(var(--foreground));
}
.sched-wg__day-header--today .sched-wg__day-num {
    color: hsl(217 91% 50%);
}

/* Body: contains gutter + day columns */
.sched-wg__body {
    display: flex;
    position: relative;
    overflow-y: auto;
}

/* Time gutter (left) */
.sched-wg__gutter {
    width: 60px;
    flex-shrink: 0;
    position: relative;
    border-right: 1px solid hsl(var(--border));
}
.sched-wg__header > .sched-wg__gutter {
    width: 60px;
    flex-shrink: 0;
    border-right: 1px solid hsl(var(--border));
}
.sched-wg__hour-label {
    position: absolute;
    left: 0;
    right: 0;
    height: 60px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 2px;
    font-size: 10px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
}

/* Day columns */
.sched-wg__day-col {
    flex: 1;
    position: relative;
    border-left: 1px solid hsl(var(--border));
    cursor: pointer;
    min-height: 100%;
}
.sched-wg__day-col--today {
    background: hsl(217 91% 98%);
}

/* Horizontal hour gridlines */
.sched-wg__hline {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 1px solid hsl(var(--border) / 0.5);
    pointer-events: none;
    z-index: 0;
}

/* Shift blocks (vertical positioning) */
.sched-wg__block {
    position: absolute;
    border: none;
    border-left: 3px solid var(--block-color, #6B7280);
    border-radius: 0 4px 4px 0;
    background: var(--block-bg, hsl(var(--muted)));
    cursor: pointer;
    font-family: inherit;
    padding: 3px 6px;
    overflow: hidden;
    z-index: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
    transition: opacity 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
}
.sched-wg__block:hover {
    opacity: 0.9;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 5;
}
.sched-wg__block--cancelled {
    opacity: 0.4;
    text-decoration: line-through;
}
.sched-wg__block--overlap {
    border-left-color: hsl(0 84% 60%) !important;
    animation: sched-wg-pulse 2s ease-in-out infinite;
}
@keyframes sched-wg-pulse {
    0%, 100% { box-shadow: 0 0 0 0 hsl(0 84% 60% / 0.15); }
    50% { box-shadow: 0 0 0 3px hsl(0 84% 60% / 0.15); }
}
.sched-wg__block-badge {
    padding: 1px 4px;
    border-radius: 4px;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    flex-shrink: 0;
    line-height: 1.3;
    align-self: flex-start;
}
.sched-wg__block-time {
    font-size: 10px;
    font-weight: 600;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sched-wg__block-label {
    font-size: 10px;
    color: hsl(var(--foreground) / 0.75);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sched-wg__block-clip {
    font-size: 10px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
```

Also update the responsive media query at the bottom (around line 2674):

```css
@media (max-width: 768px) {
    .sched-toolbar { flex-direction: column; align-items: stretch; }
    .sched-wg__gutter { width: 40px; }
    .sched-wg__header > .sched-wg__gutter { width: 40px; }
    .sched-wg__hour-label { font-size: 8px; }
    .sched-wg__block-time { font-size: 8px; }
    .sched-wg__block-label { display: none; }
    .sched-wg__block-badge { font-size: 7px; }
    .sched-card__select { min-width: 140px; }
    .form-grid-2 { grid-template-columns: 1fr; }
    .sched-auth-bar { gap: 8px; padding: 8px 12px; }
}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx client/src/index.css
git commit -m "feat: replace ScheduleTimeGrid with ScheduleWeekGrid (days across, hours down)"
```

---

### Task 4: Add new fields to ShiftFormModal

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx` (ShiftFormModal component, lines 33-244)

- [ ] **Step 1: Add accountNumber, sandataClientId, and client details state to ShiftFormModal**

In the `ShiftFormModal` function props, add `defaultStartTime`:

```jsx
function ShiftFormModal({ shift, clients, employees, onSave, onDelete, onClose, defaultDate, defaultClientId, defaultEmployeeId, defaultStartTime }) {
```

Add new state variables after the existing useState calls:

```jsx
const [startTime, setStartTime] = useState(shift?.startTime || defaultStartTime || '09:00');
const [accountNumber, setAccountNumber] = useState(shift?.accountNumber || '');
const [sandataClientId, setSandataClientId] = useState(shift?.sandataClientId || '');

// Client details (pre-filled when client selected)
const selectedClient = clients.find(c => c.id === Number(clientId));
const [clientAddress, setClientAddress] = useState(selectedClient?.address || '');
const [clientPhone, setClientPhone] = useState(selectedClient?.phone || '');
const [clientGateCode, setClientGateCode] = useState(selectedClient?.gateCode || '');
const [clientNotes, setClientNotes] = useState(selectedClient?.notes || '');
```

Add a useEffect to update client details when clientId changes:

```jsx
useEffect(() => {
    const c = clients.find(cl => cl.id === Number(clientId));
    if (c) {
        setClientAddress(c.address || '');
        setClientPhone(c.phone || '');
        setClientGateCode(c.gateCode || '');
        setClientNotes(c.notes || '');
    }
}, [clientId, clients]);
```

- [ ] **Step 2: Add the new form fields in the JSX**

After the Service/Date form-grid-2 row (line 138), add:

```jsx
<div className="form-grid-2">
    <div className="form-group">
        <label htmlFor="shiftAccountNumber">Account Number</label>
        <select id="shiftAccountNumber" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required={!shift}>
            <option value="">Select account…</option>
            <option value="71040">71040</option>
            <option value="71119">71119</option>
            <option value="71120">71120</option>
            <option value="71635">71635</option>
        </select>
    </div>
    <div className="form-group">
        <label htmlFor="shiftSandataId">SANDATA Client ID</label>
        <input id="shiftSandataId" value={sandataClientId} onChange={e => setSandataClientId(e.target.value)} placeholder="Optional…" />
    </div>
</div>
```

After the Notes field and before form-actions, add the Client Details section (only visible when client selected):

```jsx
{clientId && (
    <fieldset style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
        <legend style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', padding: '0 6px' }}>
            Client Details (saved to client record)
        </legend>
        <div className="form-grid-2">
            <div className="form-group">
                <label htmlFor="clientAddress">Address</label>
                <input id="clientAddress" value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Address…" />
            </div>
            <div className="form-group">
                <label htmlFor="clientPhone">Phone</label>
                <input id="clientPhone" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone…" />
            </div>
        </div>
        <div className="form-group">
            <label htmlFor="clientGateCode">Gate Code</label>
            <input id="clientGateCode" value={clientGateCode} onChange={e => setClientGateCode(e.target.value)} placeholder="Gate code…" />
        </div>
        <div className="form-group">
            <label htmlFor="clientNotesField">Notes</label>
            <textarea id="clientNotesField" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Notes about this client…" rows={2} />
        </div>
    </fieldset>
)}
```

- [ ] **Step 3: Update handleSubmit to include new fields and patch client**

Update the `handleSubmit` function to include the new shift fields and call patchClient if client details changed:

```jsx
const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
        const data = {
            clientId: Number(clientId), employeeId: Number(employeeId), serviceCode, shiftDate, startTime, endTime, notes,
            accountNumber, sandataClientId,
        };
        if (shift) data.status = status;
        if (!shift && recurring && repeatUntil) data.repeatUntil = repeatUntil;

        // Patch client details if changed
        if (clientId) {
            const c = clients.find(cl => cl.id === Number(clientId));
            if (c) {
                const patch = {};
                if (clientAddress !== (c.address || '')) patch.address = clientAddress;
                if (clientPhone !== (c.phone || '')) patch.phone = clientPhone;
                if (clientGateCode !== (c.gateCode || '')) patch.gateCode = clientGateCode;
                if (clientNotes !== (c.notes || '')) patch.notes = clientNotes;
                if (Object.keys(patch).length > 0) {
                    await api.patchClient(Number(clientId), patch);
                }
            }
        }

        await onSave(data);
    } finally {
        setSaving(false);
    }
};
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd client && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx
git commit -m "feat: add accountNumber, sandataClientId, and client details to ShiftFormModal"
```

---

### Task 5: Update notification templates

**Files:**
- Modify: `server/src/services/notificationService.js`

- [ ] **Step 1: Update formatScheduleSms to include new fields**

In `server/src/services/notificationService.js`, update `formatScheduleSms` (line 57, signature: `(employeeName, shifts, weekLabel, confirmUrl)`) to append client details after each shift line. The existing format builds a line per shift ending with `(${shift.serviceCode})\n`. After that line (line 70), add detail lines:

```javascript
function formatScheduleSms(employeeName, shifts, weekLabel, confirmUrl) {
    let msg = `NV Best PCA - Schedule for ${weekLabel}:\n`;
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayAbbr[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        const startH = Number(shift.startTime.split(':')[0]) % 12 || 12;
        const startM = shift.startTime.split(':')[1];
        const startP = Number(shift.startTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        const endH = Number(shift.endTime.split(':')[0]) % 12 || 12;
        const endM = shift.endTime.split(':')[1];
        const endP = Number(shift.endTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        msg += `[${day} ${date}] ${startH}:${startM}${startP}-${endH}:${endM}${endP} - ${shift.client.clientName} (${shift.serviceCode})\n`;
        const details = [];
        if (shift.client.address) details.push(`📍 ${shift.client.address}`);
        if (shift.client.phone) details.push(`📞 ${shift.client.phone}`);
        if (shift.client.gateCode) details.push(`🔑 Gate: ${shift.client.gateCode}`);
        if (shift.client.notes) details.push(`📝 ${shift.client.notes}`);
        if (shift.accountNumber) details.push(`Account: ${shift.accountNumber}`);
        if (shift.sandataClientId) details.push(`Client ID: ${shift.sandataClientId}`);
        if (details.length > 0) msg += details.join(' | ') + '\n';
    }
    msg += `\nConfirm: ${confirmUrl}`;
    return msg;
}
```

- [ ] **Step 2: Update formatScheduleEmailHtml to include notes, accountNumber, sandataClientId**

In `formatScheduleEmailHtml` (line 76, signature: `(employeeName, shifts, weekLabel, confirmUrl)`), the existing table row (lines 83-91) has columns: Day, Time, Client, Address, Phone, Gate Code, Service. Add three new columns.

Update the `<tr>` headers at line 97 to:
```html
<tr><th>Day</th><th>Time</th><th>Client</th><th>Address</th><th>Phone</th><th>Gate Code</th><th>Notes</th><th>Service</th><th>Account #</th><th>SANDATA ID</th></tr>
```

Update each shift row (lines 83-91) to add after the gateCode `<td>`:
```html
            <td>${shift.client.notes || ''}</td>
            <td>${shift.serviceCode}</td>
            <td>${shift.accountNumber || ''}</td>
            <td>${shift.sandataClientId || ''}</td>
```

(Note: the existing `<td>${shift.serviceCode}</td>` moves to stay between Notes and Account #.)

- [ ] **Step 3: Update the shift include in scheduleNotificationController**

In `server/src/controllers/scheduleNotificationController.js`, verify the shift query includes `accountNumber` and `sandataClientId`. Since Prisma returns all scalar fields by default and we already include `client`, no change should be needed. But verify the `client` select includes `notes` field. If the select is restrictive (e.g., only `clientName, address, phone, gateCode`), add `notes`.

Check line where shifts are fetched — the include should be:
```javascript
client: { select: { clientName: true, address: true, phone: true, gateCode: true, notes: true } }
```

- [ ] **Step 4: Run tests and verify build**

Run: `cd server && npm test && cd ../client && npm run build`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/notificationService.js server/src/controllers/scheduleNotificationController.js
git commit -m "feat: include client details and shift account fields in notification templates"
```

---

### Task 6: Create DrawerPanel component and CSS

**Files:**
- Create: `client/src/components/common/DrawerPanel.jsx`
- Modify: `client/src/index.css` (add drawer styles at end)

- [ ] **Step 1: Create the DrawerPanel component**

Create `client/src/components/common/DrawerPanel.jsx`:

```jsx
import { useEffect } from 'react';

export default function DrawerPanel({ children, onClose }) {
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="drawer-backdrop" onClick={onClose}>
            <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
                <button className="drawer-panel__close" onClick={onClose} title="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                {children}
            </aside>
        </div>
    );
}
```

- [ ] **Step 2: Add DrawerPanel CSS**

Add to the end of `client/src/index.css` (before the final payroll legend line):

```css
/* ── Drawer Panel ── */
.drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 50;
    display: flex;
    justify-content: flex-end;
}
.drawer-panel {
    width: 400px;
    max-width: 100%;
    height: 100%;
    background: hsl(var(--card));
    border-left: 1px solid hsl(var(--border));
    overflow-y: auto;
    padding: 24px;
    position: relative;
    animation: drawer-slide-in 0.2s ease-out;
}
@keyframes drawer-slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}
.drawer-panel__close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    padding: 4px;
    border-radius: 4px;
}
.drawer-panel__close:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
}

/* Drawer header */
.drawer-header { margin-bottom: 20px; padding-right: 32px; }
.drawer-header__name { font-size: 18px; font-weight: 700; color: hsl(var(--foreground)); margin: 0 0 4px; }
.drawer-header__meta { font-size: 13px; color: hsl(var(--muted-foreground)); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Drawer sections */
.drawer-section { margin-bottom: 20px; }
.drawer-section__title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid hsl(var(--border));
}

/* Inline editable fields in drawer */
.drawer-field { margin-bottom: 10px; }
.drawer-field__label { display: block; font-size: 12px; font-weight: 500; color: hsl(var(--muted-foreground)); margin-bottom: 3px; }
.drawer-field__input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
}
.drawer-field__input:focus { outline: none; border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15); }
.drawer-field__textarea { resize: vertical; min-height: 60px; }

/* Authorizations table in drawer */
.drawer-auth-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.drawer-auth-table th {
    text-align: left;
    padding: 6px 8px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    border-bottom: 2px solid hsl(var(--border));
    white-space: nowrap;
}
.drawer-auth-table td {
    padding: 6px 8px;
    border-bottom: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
}
.drawer-auth-table tr:hover { background: hsl(var(--muted) / 0.5); }

@media (max-width: 700px) {
    .drawer-panel { width: 100%; }
}
```

- [ ] **Step 3: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds (DrawerPanel is created but not yet imported anywhere).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/common/DrawerPanel.jsx client/src/index.css
git commit -m "feat: create DrawerPanel component with slide-in animation"
```

---

### Task 7: Rewrite ClientsPage with compact table and DrawerPanel

This is the largest frontend task. The current ClientsPage has a 15-column table with expand/collapse rows. It becomes a 6-column compact table where clicking a row opens a DrawerPanel with client details and authorizations.

**Files:**
- Modify: `client/src/pages/ClientsPage.jsx` (major rewrite)

- [ ] **Step 1: Rewrite the main table to 6 columns**

The rewrite removes: checkbox column, expand toggle, service columns, child rows, bulk select/delete, `min-width: 1200px`. Removes state: `expandedIds`, `selectedIds`, `selectAll`.

The new table has columns: Client Name (bold), Medicaid ID (muted), Insurance Type (badge), Status (color badge), Days to Expire (color number), Actions (edit, delete).

Clicking a row sets `drawerClient` state which opens the DrawerPanel.

The complete ClientsPage rewrite is large — the key structural changes are:

1. Remove `expandedIds`, `selectedIds`, `selectAll` state and all related handlers
2. Add `drawerClient` state (the client whose drawer is open)
3. Remove `toggleExpand`, `toggleSelectAll`, `toggleSelectOne`, `handleBulkDelete`
4. Change table `<thead>` to 6 columns
5. Change table row `onClick` from `toggleExpand` to `setDrawerClient(client)`
6. Remove child rows (authorization expand)
7. Add DrawerPanel render when `drawerClient` is set

The `ClientFormModal` also needs 4 new fields: address, phone, gateCode, notes.

- [ ] **Step 2: Add DrawerPanel content for client detail**

When `drawerClient` is set, render:

```jsx
{drawerClient && (
    <DrawerPanel onClose={() => setDrawerClient(null)}>
        <div className="drawer-header">
            <h2 className="drawer-header__name">{drawerClient.clientName}</h2>
            <div className="drawer-header__meta">
                <span>{drawerClient.medicaidId}</span>
                <span className="insurance-badge" style={insuranceBadgeStyle(drawerClient.insuranceType)}>
                    {drawerClient.insuranceType}
                </span>
            </div>
            <button className="btn btn--outline btn--sm" style={{ marginTop: 8 }}
                onClick={() => { setModal({ type: 'clientForm', client: drawerClient }); }}>
                {Icons.edit} Edit Client
            </button>
        </div>

        {/* Client Notes (inline editable) */}
        <ClientNotesSection client={drawerClient} onSaved={(updated) => {
            setDrawerClient(updated);
            fetchData();
        }} />

        {/* Authorizations */}
        <div className="drawer-section">
            <h3 className="drawer-section__title">Authorizations</h3>
            <table className="drawer-auth-table">
                <thead>
                    <tr>
                        <th>Service</th><th>Code</th><th>Units</th>
                        <th>Start</th><th>End</th><th>Status</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {(drawerClient.authorizations || []).map(auth => (
                        <tr key={auth.id}>
                            <td>{auth.serviceCategory}</td>
                            <td>{auth.serviceCode}</td>
                            <td>{auth.authorizedUnits}</td>
                            <td>{auth.authorizationStartDate ? new Date(auth.authorizationStartDate).toLocaleDateString() : '—'}</td>
                            <td>{auth.authorizationEndDate ? new Date(auth.authorizationEndDate).toLocaleDateString() : '—'}</td>
                            <td><span className={`status-badge status-badge--${auth.computedStatus?.toLowerCase()?.replace(' ', '-') || 'ok'}`}>{auth.computedStatusLabel || 'OK'}</span></td>
                            <td>
                                <button className="btn btn--outline btn--xs" onClick={() => setModal({ type: 'authForm', auth, client: drawerClient })}>{Icons.edit}</button>
                                <button className="btn btn--outline btn--xs" onClick={() => setModal({ type: 'confirmDeleteAuth', auth, client: drawerClient })} style={{ marginLeft: 4 }}>{Icons.trash}</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button className="btn btn--outline btn--sm" style={{ marginTop: 10 }}
                onClick={() => setModal({ type: 'authForm', auth: null, client: drawerClient })}>
                + Add Authorization
            </button>
        </div>
    </DrawerPanel>
)}
```

- [ ] **Step 3: Create ClientNotesSection inline component**

Add a `ClientNotesSection` component inside ClientsPage (or at the top of the file) that renders inline-editable fields and saves via `api.patchClient`:

```jsx
function ClientNotesSection({ client, onSaved }) {
    const [address, setAddress] = useState(client.address || '');
    const [phone, setPhone] = useState(client.phone || '');
    const [gateCode, setGateCode] = useState(client.gateCode || '');
    const [notes, setNotes] = useState(client.notes || '');
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const hasChanges = address !== (client.address || '') || phone !== (client.phone || '')
        || gateCode !== (client.gateCode || '') || notes !== (client.notes || '');

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await api.patchClient(client.id, { address, phone, gateCode, notes });
            showToast('Client details saved');
            onSaved(updated);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="drawer-section">
            <h3 className="drawer-section__title">Client Details</h3>
            <div className="drawer-field">
                <label className="drawer-field__label">Address</label>
                <input className="drawer-field__input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Phone</label>
                <input className="drawer-field__input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Gate Code</label>
                <input className="drawer-field__input" value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="Gate code…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Notes</label>
                <textarea className="drawer-field__input drawer-field__textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…" />
            </div>
            {hasChanges && (
                <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Details'}
                </button>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Update ClientFormModal with 4 new fields**

Find the existing `ClientFormModal` in ClientsPage.jsx. Add fields after the existing Insurance Type select:

```jsx
<div className="form-grid-2">
    <div className="form-group">
        <label htmlFor="clientAddress">Address</label>
        <input id="clientAddress" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address…" />
    </div>
    <div className="form-group">
        <label htmlFor="clientPhone">Phone</label>
        <input id="clientPhone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone…" />
    </div>
</div>
<div className="form-group">
    <label htmlFor="clientGateCode">Gate Code</label>
    <input id="clientGateCode" value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="Gate code…" />
</div>
<div className="form-group">
    <label htmlFor="clientNotes">Notes</label>
    <textarea id="clientNotes" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Notes…" rows={3} />
</div>
```

Add corresponding state and include in the save payload.

- [ ] **Step 5: Remove min-width: 1200px from CSS**

In `client/src/index.css`, find `.sheet-table { ... min-width: 1200px; ... }` (line 593) and remove the `min-width: 1200px;` line.

- [ ] **Step 6: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ClientsPage.jsx client/src/index.css
git commit -m "feat: redesign ClientsPage with compact table and DrawerPanel detail view"
```

---

### Task 8: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `cd server && npm test`
Expected: All tests pass.

- [ ] **Step 2: Build frontend**

Run: `cd client && npm run build`
Expected: Build succeeds with no warnings.

- [ ] **Step 3: Manual smoke test checklist**

Start both servers:
```bash
cd server && npm run dev &
cd client && npm run dev
```

Verify in browser at `http://localhost:5173`:
1. Login works
2. Master Sheet: compact 6-column table, clicking row opens DrawerPanel, client details editable, authorization table with add/edit/delete
3. Scheduling: calendar has days across top, hours down left, shift blocks positioned correctly, clicking empty area opens form with snapped time
4. Shift form: Account Number dropdown, SANDATA Client ID field, Client Details section appears when client selected
5. Existing features still work: payroll, timesheets, signing

- [ ] **Step 4: Remove any dead code**

Check for and remove:
- Old `ScheduleTimeGrid` CSS classes (`.sched-tg__*`) if still present
- Unused state variables from ClientsPage (expandedIds, selectedIds, etc.)
- `getEmployeeScheduleByName` from `client/src/api.js` (dead endpoint)

- [ ] **Step 5: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove dead code and old grid styles"
```

---

### Task 9: Update notification service to include shift-level account fields

**Note:** This task depends on Task 5 (notification templates) and Task 1 (shift schema). It ensures the `scheduleNotificationController` fetches shifts with the new fields and passes them correctly to the formatters.

**Files:**
- Modify: `server/src/controllers/scheduleNotificationController.js`

- [ ] **Step 1: Verify shift query includes new fields**

In `scheduleNotificationController.js`, find the Prisma query that fetches shifts for notification. Verify:
1. The `client` include/select has `notes: true`
2. The Shift model will automatically include `accountNumber` and `sandataClientId` since they're scalar fields (no select restriction needed)

If the client select is restrictive (only certain fields), add `notes: true`.

- [ ] **Step 2: Run tests**

Run: `cd server && npm test`
Expected: All pass.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add server/src/controllers/scheduleNotificationController.js
git commit -m "fix: include client notes in schedule notification queries"
```
