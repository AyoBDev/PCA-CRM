# Lead Follow-Up Reminders + Contact Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each lead-worker a once-per-morning briefing of the leads needing attention today, and let them log the outcome of each follow-up into a per-lead timeline that stays visible when viewing the lead.

**Architecture:** A new `LeadContact` model gives every lead an append-only follow-up timeline (mirrors the existing `ClientNote` pattern). Pure classifier functions in `leadService.js` decide which reminder bucket a lead falls into; a thin `getReminders(prisma, user, now)` queries and maps them. Controllers stay thin and audit every mutation. The frontend adds a morning modal, a reusable log-contact form, and a timeline section in the lead detail view — all wired into the mandatory Undo/Redo/History/Activity command bar.

**Tech Stack:** Express + Prisma + PostgreSQL (backend), Jest (tests), React 19 + Vite (frontend). Existing helpers: `requireRole`, `requirePermission('leads')`, `audit.logAction`, `useUndoStack`, `useAuth().hasPermission`.

## Global Constraints

- All new API routes: `requireRole('admin', 'user')` + `requirePermission('leads')`.
- Every mutation calls `audit.logAction(...)` (fire-and-forget, never awaited).
- Every frontend mutation calls `undoState.pushAction(description, undoFn, redoFn)` with a real reverse/redo API call, per CLAUDE.md.
- New `entityType` `'LeadContact'` added to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.
- Backend logic is written test-first (TDD); mirror the style of `server/__tests__/leadService.test.js` (pure functions) and `server/__tests__/leadController.test.js` (mocked prisma).
- Shared constants live in single sources: outcomes + thresholds in `client/src/utils/leadConstants.js` (frontend) and `server/src/services/leadService.js` (backend). Values: `STALE_WARN_DAYS = 7`, `STUCK_DAYS = 7`, `DORMANT_DAYS = 90` (existing).
- Terminal outcomes: `reached_not_interested`, `wrong_number`, `went_elsewhere`.
- `dob`-style DateTime rules do not apply here; `LeadContact.followUpDate` is a real `DateTime?`.
- All work happens in the worktree `worktrees/lead-followup-reminders` on branch `feat/lead-followup-reminders`. Run backend commands from `server/`, frontend from `client/`.

---

## File Structure

**Backend**
- Modify `server/prisma/schema.prisma` — add `LeadContact` model + `contacts` relation on `Lead`.
- Create `server/prisma/migrations/<ts>_add_lead_contacts/migration.sql` (via `prisma migrate dev`).
- Modify `server/src/services/leadService.js` — add `TERMINAL_OUTCOMES`, `STALE_WARN_DAYS`, `STUCK_DAYS`, pure `classifyLeadForReminders(...)`, `buildReminderBuckets(...)`, and async `getReminders(prisma, user, now)`.
- Modify `server/src/controllers/leadController.js` — add `createLeadContact`, `listLeadContacts`, `deleteLeadContact`, `getLeadReminders`; set `createdBy` server-side in `createLead`.
- Modify `server/src/routes/api.js` — register the four new routes.

**Frontend**
- Modify `client/src/utils/leadConstants.js` — add `LEAD_CONTACT_OUTCOMES`, `LEAD_CONTACT_METHODS`, `TERMINAL_OUTCOMES`, `isTerminalOutcome()`.
- Modify `client/src/api.js` — add `createLeadContact`, `listLeadContacts`, `deleteLeadContact`, `getLeadReminders`.
- Create `client/src/components/leads/LogContactForm.jsx` — reusable outcome form.
- Create `client/src/components/leads/LeadRemindersModal.jsx` — morning briefing modal.
- Modify `client/src/components/leads/LeadDetailModal.jsx` — add "Follow-up history" section + `LogContactForm`.
- Modify `client/src/pages/LeadsPage.jsx` — mount the modal, once-per-day mechanic, wire `undoState.pushAction` for contact logging.
- Modify `client/src/pages/HistoryPage.jsx` — add `'LeadContact'` to `ENTITY_TYPES`.

**Tests**
- Create `server/__tests__/leadReminders.test.js` — pure classifier + bucket tests.
- Modify `server/__tests__/leadController.test.js` — contact endpoint tests.

---

## Task 1: LeadContact schema + migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<ts>_add_lead_contacts/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `LeadContact { id, leadId, outcome, method, note, followUpDate, createdBy, createdAt }` and `Lead.contacts LeadContact[]`.

- [ ] **Step 1: Add the model + relation to schema.prisma**

In `server/prisma/schema.prisma`, inside `model Lead { ... }`, add this line next to the other relations (e.g. just before `@@index([status])`):

```prisma
  contacts                 LeadContact[]
```

Then add the new model after the `Lead` model's closing brace:

```prisma
model LeadContact {
  id           Int       @id @default(autoincrement())
  leadId       Int       @map("lead_id")
  outcome      String    @default("")
  method       String    @default("call")
  note         String    @default("")
  followUpDate DateTime? @map("follow_up_date")
  createdBy    String    @default("") @map("created_by")
  createdAt    DateTime  @default(now()) @map("created_at")
  lead         Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId])
  @@map("lead_contacts")
}
```

- [ ] **Step 2: Create and apply the migration**

Run from `server/`:

```bash
npx prisma migrate dev --name add_lead_contacts
```

Expected: a new folder `server/prisma/migrations/<timestamp>_add_lead_contacts/` with `migration.sql` creating the `lead_contacts` table; Prisma Client regenerates without error.

- [ ] **Step 3: Verify the client picks up the model**

Run from `server/`:

```bash
node -e "const p=require('./src/lib/prisma'); console.log(typeof p.leadContact.create)"
```

Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(leads): add LeadContact model for follow-up timeline"
```

---

## Task 2: Constants — outcomes, methods, thresholds

**Files:**
- Modify: `server/src/services/leadService.js`
- Modify: `client/src/utils/leadConstants.js`
- Test: `server/__tests__/leadReminders.test.js` (create)

**Interfaces:**
- Produces (backend, exported from `leadService.js`): `TERMINAL_OUTCOMES` (string[]), `STALE_WARN_DAYS` (7), `STUCK_DAYS` (7), `isTerminalOutcome(outcome) -> boolean`.
- Produces (frontend, exported from `leadConstants.js`): `LEAD_CONTACT_OUTCOMES` (array of `{ id, label, terminal, color }`), `LEAD_CONTACT_METHODS` (array of `{ id, label }`), `TERMINAL_OUTCOMES` (string[]), `isTerminalOutcome(outcome) -> boolean`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/leadReminders.test.js`:

```js
const { TERMINAL_OUTCOMES, STALE_WARN_DAYS, STUCK_DAYS, isTerminalOutcome } = require('../src/services/leadService');

describe('contact outcome constants', () => {
  test('terminal outcomes are the three closing ones', () => {
    expect(TERMINAL_OUTCOMES.sort()).toEqual(['reached_not_interested', 'went_elsewhere', 'wrong_number']);
  });
  test('isTerminalOutcome true for terminal, false otherwise', () => {
    expect(isTerminalOutcome('wrong_number')).toBe(true);
    expect(isTerminalOutcome('no_answer')).toBe(false);
    expect(isTerminalOutcome('')).toBe(false);
  });
  test('thresholds have the agreed values', () => {
    expect(STALE_WARN_DAYS).toBe(7);
    expect(STUCK_DAYS).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: FAIL — `TERMINAL_OUTCOMES` is undefined / `isTerminalOutcome is not a function`.

- [ ] **Step 3: Add the backend constants**

In `server/src/services/leadService.js`, near the existing `const DORMANT_DAYS = 90;`, add:

```js
const STALE_WARN_DAYS = 7;
const STUCK_DAYS = 7;
const TERMINAL_OUTCOMES = ['reached_not_interested', 'wrong_number', 'went_elsewhere'];
function isTerminalOutcome(outcome) {
  return TERMINAL_OUTCOMES.includes(outcome);
}
```

Then extend the `module.exports = { ... }` object to include: `STALE_WARN_DAYS, STUCK_DAYS, TERMINAL_OUTCOMES, isTerminalOutcome`.

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: PASS.

- [ ] **Step 5: Add the frontend constants**

In `client/src/utils/leadConstants.js`, add:

```js
export const LEAD_CONTACT_METHODS = [
  { id: 'call',      label: 'Phone call' },
  { id: 'text',      label: 'Text message' },
  { id: 'email',     label: 'Email' },
  { id: 'in_person', label: 'In person' },
];

export const LEAD_CONTACT_OUTCOMES = [
  { id: 'no_answer',               label: 'No answer',            terminal: false, color: '#94a3b8' },
  { id: 'left_voicemail',          label: 'Left voicemail',       terminal: false, color: '#93c5fd' },
  { id: 'reached_interested',      label: 'Reached — interested', terminal: false, color: '#4ade80' },
  { id: 'callback_requested',      label: 'Callback requested',   terminal: false, color: '#fcd34d' },
  { id: 'reached_not_interested',  label: 'Not interested',       terminal: true,  color: '#f87171' },
  { id: 'wrong_number',            label: 'Wrong number',         terminal: true,  color: '#f87171' },
  { id: 'went_elsewhere',          label: 'Went elsewhere',       terminal: true,  color: '#f87171' },
  { id: 'other',                   label: 'Other',                terminal: false, color: '#a78bfa' },
];

export const TERMINAL_OUTCOMES = LEAD_CONTACT_OUTCOMES.filter(o => o.terminal).map(o => o.id);

export function isTerminalOutcome(outcome) {
  return TERMINAL_OUTCOMES.includes(outcome);
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/leadService.js client/src/utils/leadConstants.js server/__tests__/leadReminders.test.js
git commit -m "feat(leads): add contact outcome/method constants and reminder thresholds"
```

---

## Task 3: Pure reminder classifier

**Files:**
- Modify: `server/src/services/leadService.js`
- Test: `server/__tests__/leadReminders.test.js`

**Interfaces:**
- Consumes: `STALE_WARN_DAYS`, `STUCK_DAYS`, `DORMANT_DAYS` from Task 2.
- Produces: `classifyLeadForReminders(lead, ctx) -> string[]` where `lead` is `{ status, followUpDate, updatedAt, createdAt, contactCount }`, `ctx` is `{ now: Date }`, and the return is a subset of `['due', 'stale_soon', 'new_untouched', 'stuck']` (a lead can be in more than one bucket). Archived/converted leads (status `'archived'` or a truthy `convertedAt`) return `[]`.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/leadReminders.test.js`:

```js
const { classifyLeadForReminders } = require('../src/services/leadService');

const DAY = 86400000;
const now = new Date('2026-08-02T12:00:00Z');
function lead(over = {}) {
  return {
    status: 'review',
    followUpDate: null,
    updatedAt: new Date(now.getTime() - 1 * DAY),
    createdAt: new Date(now.getTime() - 1 * DAY),
    contactCount: 1,
    convertedAt: null,
    ...over,
  };
}

describe('classifyLeadForReminders', () => {
  test('follow-up due today or earlier -> due', () => {
    expect(classifyLeadForReminders(lead({ followUpDate: now }), { now })).toContain('due');
    expect(classifyLeadForReminders(lead({ followUpDate: new Date(now.getTime() - 2 * DAY) }), { now })).toContain('due');
  });
  test('follow-up in the future -> not due', () => {
    expect(classifyLeadForReminders(lead({ followUpDate: new Date(now.getTime() + 2 * DAY) }), { now })).not.toContain('due');
  });
  test('inactive within the stale warning window -> stale_soon', () => {
    const updatedAt = new Date(now.getTime() - 85 * DAY); // 85 days: between 83 (90-7) and 90
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).toContain('stale_soon');
  });
  test('inactive but not yet in the warning window -> not stale_soon', () => {
    const updatedAt = new Date(now.getTime() - 10 * DAY);
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).not.toContain('stale_soon');
  });
  test('new status, older than 24h, zero contacts -> new_untouched', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 2 * DAY), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).toContain('new_untouched');
  });
  test('new status with a contact logged -> not new_untouched', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 2 * DAY), contactCount: 1 });
    expect(classifyLeadForReminders(l, { now })).not.toContain('new_untouched');
  });
  test('non-new stage older than STUCK_DAYS -> stuck', () => {
    const l = lead({ status: 'review', updatedAt: new Date(now.getTime() - 8 * DAY) });
    expect(classifyLeadForReminders(l, { now })).toContain('stuck');
  });
  test('new stage is never counted as stuck (has its own bucket)', () => {
    const l = lead({ status: 'new', updatedAt: new Date(now.getTime() - 30 * DAY), createdAt: new Date(now.getTime() - 30 * DAY), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).not.toContain('stuck');
  });
  test('archived or converted -> empty', () => {
    expect(classifyLeadForReminders(lead({ status: 'archived' }), { now })).toEqual([]);
    expect(classifyLeadForReminders(lead({ convertedAt: now }), { now })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: FAIL — `classifyLeadForReminders is not a function`.

- [ ] **Step 3: Implement the classifier**

In `server/src/services/leadService.js`, add:

```js
function classifyLeadForReminders(lead, ctx) {
  const now = ctx.now || new Date();
  if (lead.convertedAt || lead.status === 'archived') return [];
  const DAY = 86400000;
  const buckets = [];

  // Follow-ups due today or earlier
  if (lead.followUpDate) {
    const due = new Date(lead.followUpDate);
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    if (due <= endOfToday) buckets.push('due');
  }

  // Going stale soon: inactive between (DORMANT_DAYS - STALE_WARN_DAYS) and DORMANT_DAYS
  const daysInactive = Math.floor((now.getTime() - new Date(lead.updatedAt).getTime()) / DAY);
  if (daysInactive >= DORMANT_DAYS - STALE_WARN_DAYS && daysInactive < DORMANT_DAYS) {
    buckets.push('stale_soon');
  }

  // New & untouched: status 'new', created > 24h ago, zero contacts
  const ageHours = (now.getTime() - new Date(lead.createdAt).getTime()) / 3600000;
  if (lead.status === 'new' && ageHours > 24 && (lead.contactCount || 0) === 0) {
    buckets.push('new_untouched');
  }

  // Stuck: any non-new, non-archived stage inactive longer than STUCK_DAYS
  if (lead.status !== 'new' && daysInactive > STUCK_DAYS) {
    buckets.push('stuck');
  }

  return buckets;
}
```

Add `classifyLeadForReminders` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: PASS (all classifier tests green).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/leadService.js server/__tests__/leadReminders.test.js
git commit -m "feat(leads): pure reminder bucket classifier"
```

---

## Task 4: getReminders — query + per-user scoping

**Files:**
- Modify: `server/src/services/leadService.js`
- Test: `server/__tests__/leadReminders.test.js`

**Interfaces:**
- Consumes: `classifyLeadForReminders` (Task 3).
- Produces: `matchesOwner(lead, user) -> boolean` (pure) and `async getReminders(prisma, user, now)`.
  - `matchesOwner`: true when `lead.assignedTo` or `lead.createdBy` equals `user.name` (trimmed, case-insensitive); for `user.role === 'admin'`, also true when both `assignedTo` and `createdBy` are blank (unowned).
  - `getReminders` returns `{ due: [], stale_soon: [], new_untouched: [], stuck: [] }`; each item is `{ id, firstName, lastName, phone, status, followUpDate, daysInactive, lastContact }` where `lastContact` is `{ outcome, method, note, createdAt } | null`.

- [ ] **Step 1: Write the failing test for matchesOwner**

Append to `server/__tests__/leadReminders.test.js`:

```js
const { matchesOwner } = require('../src/services/leadService');

describe('matchesOwner', () => {
  const user = { name: 'Grace Intake', role: 'user' };
  const admin = { name: 'Boss', role: 'admin' };
  test('matches by assignedTo (case-insensitive, trimmed)', () => {
    expect(matchesOwner({ assignedTo: '  grace intake ', createdBy: '' }, user)).toBe(true);
  });
  test('matches by createdBy', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: 'Grace Intake' }, user)).toBe(true);
  });
  test('non-owner user does not match', () => {
    expect(matchesOwner({ assignedTo: 'Someone Else', createdBy: 'Another' }, user)).toBe(false);
  });
  test('admin also matches unowned leads', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: '' }, admin)).toBe(true);
  });
  test('non-admin does NOT match unowned leads', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: '' }, user)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: FAIL — `matchesOwner is not a function`.

- [ ] **Step 3: Implement matchesOwner and getReminders**

In `server/src/services/leadService.js`, add:

```js
function matchesOwner(lead, user) {
  const norm = (s) => (s || '').trim().toLowerCase();
  const me = norm(user.name);
  const assigned = norm(lead.assignedTo);
  const creator = norm(lead.createdBy);
  if (me && (assigned === me || creator === me)) return true;
  if (user.role === 'admin' && !assigned && !creator) return true;
  return false;
}

async function getReminders(prisma, user, now = new Date()) {
  const DAY = 86400000;
  const leads = await prisma.lead.findMany({
    where: { status: { not: 'archived' }, convertedAt: null },
    include: { contacts: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const out = { due: [], stale_soon: [], new_untouched: [], stuck: [] };
  for (const lead of leads) {
    if (!matchesOwner(lead, user)) continue;
    const contactCount = lead.contacts.length; // 0 or 1 from take:1 — see note
    const buckets = classifyLeadForReminders(
      { ...lead, contactCount: lead._count ? lead._count.contacts : contactCount },
      { now }
    );
    if (buckets.length === 0) continue;
    const last = lead.contacts[0] || null;
    const item = {
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      status: lead.status,
      followUpDate: lead.followUpDate,
      daysInactive: Math.floor((now.getTime() - new Date(lead.updatedAt).getTime()) / DAY),
      lastContact: last ? { outcome: last.outcome, method: last.method, note: last.note, createdAt: last.createdAt } : null,
    };
    for (const b of buckets) out[b].push(item);
  }
  return out;
}
```

Because `new_untouched` needs an exact zero-contact check, request the count explicitly. Replace the `include` above with:

```js
    include: {
      contacts: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { contacts: true } },
    },
```

and the classifier call already reads `lead._count.contacts`. Add `matchesOwner` and `getReminders` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:

```bash
npx jest --testPathPattern=leadReminders
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/leadService.js server/__tests__/leadReminders.test.js
git commit -m "feat(leads): getReminders with per-user scoping and last-contact summary"
```

---

## Task 5: Contact endpoints + createdBy fix

**Files:**
- Modify: `server/src/controllers/leadController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/leadController.test.js`

**Interfaces:**
- Consumes: `isTerminalOutcome`, `getReminders` (Tasks 2/4); `prisma.leadContact`, `prisma.lead` (Task 1).
- Produces controller handlers: `createLeadContact(req,res,next)`, `listLeadContacts(req,res,next)`, `deleteLeadContact(req,res,next)`, `getLeadReminders(req,res,next)`.
  - `createLeadContact`: body `{ outcome, method, note, followUpDate }`. If `!isTerminalOutcome(outcome)` and no `followUpDate` → `400 { error: 'followUpDate required unless outcome is terminal' }`. Otherwise create the contact (`createdBy: req.user.name`), and if `followUpDate` present, update `Lead.followUpDate`; always bump the lead's `updatedAt` (via `data: { updatedAt: new Date() }` on the same update, or a no-op update). Audit `CREATE` / `LeadContact`. Return `201` with the created contact.
  - `deleteLeadContact`: deletes `leadContact` by id; audit `DELETE` / `LeadContact`; return `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/leadController.test.js`, extend the top `jest.mock('../src/lib/prisma', ...)` to add a `leadContact` mock and `lead.findUnique`/`update` if not present:

```js
jest.mock('../src/lib/prisma', () => ({
  lead: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  leadContact: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
}));
```

Then add:

```js
describe('createLeadContact', () => {
  test('400 when non-terminal outcome has no followUpDate', async () => {
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'no_answer', note: 'rang out' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(400);
  });
  test('creates contact for terminal outcome without followUpDate', async () => {
    prisma.leadContact.create.mockResolvedValue({ id: 9, leadId: 5, outcome: 'wrong_number' });
    prisma.lead.update.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'wrong_number', note: 'bad #' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(201);
    expect(prisma.leadContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: 5, outcome: 'wrong_number', createdBy: 'Admin' }) })
    );
  });
  test('writes followUpDate back to the lead when provided', async () => {
    prisma.leadContact.create.mockResolvedValue({ id: 10, leadId: 5 });
    prisma.lead.update.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'no_answer', followUpDate: '2026-08-10' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(201);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ followUpDate: expect.any(Date) }) })
    );
  });
});

describe('createLead sets createdBy from the authenticated user', () => {
  test('createdBy is req.user.name', async () => {
    prisma.lead.create.mockResolvedValue({ id: 7, firstName: 'Jane', lastName: 'Doe' });
    const res = mockRes();
    await controller.createLead({ ...reqUser, body: { firstName: 'Jane', lastName: 'Doe' } }, res, jest.fn());
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdBy: 'Admin' }) })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `server/`:

```bash
npx jest --testPathPattern=leadController
```

Expected: FAIL — `controller.createLeadContact is not a function` and the `createdBy` assertion fails.

- [ ] **Step 3: Implement the handlers + createdBy fix**

In `server/src/controllers/leadController.js`:

At the top, ensure these are imported (the file already requires `prisma`, `audit`, and `leadService`; add `isTerminalOutcome`, `getReminders` to the destructure from `leadService`):

```js
const { isTerminalOutcome, getReminders } = require('../services/leadService');
```

(If `leadService` is already required under another name, add these to that destructure instead of a second require.)

In `createLead`, change the create call to inject `createdBy`:

```js
    const data = sanitizeLeadBody(req.body);
    if (!data.createdBy) data.createdBy = req.user.name;
    const lead = await prisma.lead.create({ data });
```

Add the new handlers:

```js
async function createLeadContact(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const { outcome = '', method = 'call', note = '', followUpDate } = req.body;
    if (!isTerminalOutcome(outcome) && !followUpDate) {
      return res.status(400).json({ error: 'followUpDate required unless outcome is terminal' });
    }
    const nextDate = followUpDate ? new Date(followUpDate) : null;
    const contact = await prisma.leadContact.create({
      data: { leadId, outcome, method, note, followUpDate: nextDate, createdBy: req.user.name },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { updatedAt: new Date(), ...(nextDate ? { followUpDate: nextDate } : {}) },
    });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'LeadContact', entityId: contact.id, entityName: `Lead #${leadId} — ${outcome}`, metadata: { leadId } });
    res.status(201).json(contact);
  } catch (err) { next(err); }
}

async function listLeadContacts(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const contacts = await prisma.leadContact.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' } });
    res.json(contacts);
  } catch (err) { next(err); }
}

async function deleteLeadContact(req, res, next) {
  try {
    const contactId = Number(req.params.contactId);
    const existing = await prisma.leadContact.findUnique({ where: { id: contactId } });
    await prisma.leadContact.delete({ where: { id: contactId } });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'DELETE', entityType: 'LeadContact', entityId: contactId, entityName: `Lead #${existing ? existing.leadId : '?'} — ${existing ? existing.outcome : ''}`, metadata: { leadId: existing ? existing.leadId : null } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getLeadReminders(req, res, next) {
  try {
    const buckets = await getReminders(prisma, req.user, new Date());
    res.json(buckets);
  } catch (err) { next(err); }
}
```

Add all four to the file's `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run from `server/`:

```bash
npx jest --testPathPattern=leadController
```

Expected: PASS.

- [ ] **Step 5: Register routes**

In `server/src/routes/api.js`, near the other `/leads` routes, add (import the new handler names at the top with the existing lead controller imports):

```js
router.get('/leads/reminders', requireRole('admin', 'user'), requirePermission('leads'), getLeadReminders);
router.get('/leads/:id/contacts', requireRole('admin', 'user'), requirePermission('leads'), listLeadContacts);
router.post('/leads/:id/contacts', requireRole('admin', 'user'), requirePermission('leads'), createLeadContact);
router.delete('/leads/:id/contacts/:contactId', requireRole('admin', 'user'), requirePermission('leads'), deleteLeadContact);
```

**Important:** place the `/leads/reminders` line BEFORE any existing `/leads/:id` GET route, so `reminders` is not captured as an `:id`.

- [ ] **Step 6: Run the full server test suite**

Run from `server/`:

```bash
npx jest --testPathPattern="lead"
```

Expected: PASS (all lead-related suites).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/leadController.js server/src/routes/api.js server/__tests__/leadController.test.js
git commit -m "feat(leads): contact log endpoints, reminders endpoint, server-side createdBy"
```

---

## Task 6: API client + HistoryPage entity type

**Files:**
- Modify: `client/src/api.js`
- Modify: `client/src/pages/HistoryPage.jsx`

**Interfaces:**
- Produces (from `api.js`): `getLeadReminders()`, `listLeadContacts(leadId)`, `createLeadContact(leadId, body)`, `deleteLeadContact(leadId, contactId)`.

- [ ] **Step 1: Add API helpers**

In `client/src/api.js`, following the existing one-export-per-endpoint pattern. The file's base helper is `request(path, options)`; POST/DELETE bodies are passed as `body: JSON.stringify(...)` with a JSON `Content-Type` header (see `login`, `deleteUser`, and `bulk-permanent` for the exact shape). Add:

```js
export const getLeadReminders = () => request('/leads/reminders');
export const listLeadContacts = (leadId) => request(`/leads/${leadId}/contacts`);
export const createLeadContact = (leadId, body) =>
    request(`/leads/${leadId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
export const deleteLeadContact = (leadId, contactId) =>
    request(`/leads/${leadId}/contacts/${contactId}`, { method: 'DELETE' });
```

- [ ] **Step 2: Add the entity type to History**

In `client/src/pages/HistoryPage.jsx`, add `'LeadContact'` to the `ENTITY_TYPES` array (line ~11), placed right after `'Lead'`.

- [ ] **Step 3: Verify the client builds**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/api.js client/src/pages/HistoryPage.jsx
git commit -m "feat(leads): api client for contacts/reminders + LeadContact history type"
```

---

## Task 7: LogContactForm component

**Files:**
- Create: `client/src/components/leads/LogContactForm.jsx`

**Interfaces:**
- Consumes: `LEAD_CONTACT_OUTCOMES`, `LEAD_CONTACT_METHODS`, `isTerminalOutcome` (Task 2).
- Produces: default-exported `LogContactForm({ onSubmit, onCancel, busy })` where `onSubmit(values)` receives `{ outcome, method, note, followUpDate }` (`followUpDate` is a `YYYY-MM-DD` string or `''`). The component enforces client-side that a non-terminal outcome requires a `followUpDate` before it will call `onSubmit` (disable/guard the submit button and show an inline hint).

- [ ] **Step 1: Create the component**

Create `client/src/components/leads/LogContactForm.jsx`:

```jsx
import { useState } from 'react';
import { LEAD_CONTACT_OUTCOMES, LEAD_CONTACT_METHODS, isTerminalOutcome } from '../../utils/leadConstants';

export default function LogContactForm({ onSubmit, onCancel, busy = false }) {
  const [outcome, setOutcome] = useState('no_answer');
  const [method, setMethod] = useState('call');
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const needsDate = !isTerminalOutcome(outcome);
  const canSubmit = !busy && outcome && (!needsDate || followUpDate);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ outcome, method, note, followUpDate });
  }

  return (
    <form className="log-contact-form" onSubmit={handleSubmit}>
      <div className="log-contact-form__row">
        <label>
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {LEAD_CONTACT_OUTCOMES.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {LEAD_CONTACT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What happened on this contact?" />
      </label>
      {needsDate && (
        <label>
          Next follow-up date <span className="log-contact-form__required">required</span>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </label>
      )}
      <div className="log-contact-form__actions">
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>Save follow-up</button>
      </div>
      {needsDate && !followUpDate && (
        <p className="log-contact-form__hint">Set the next follow-up date, or choose a closing outcome.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/leads/LogContactForm.jsx
git commit -m "feat(leads): reusable LogContactForm with terminal-outcome guard"
```

---

## Task 8: Follow-up history in the lead detail view

**Files:**
- Modify: `client/src/components/leads/LeadDetailModal.jsx`

**Interfaces:**
- Consumes: `listLeadContacts`, `createLeadContact` (Task 6); `LogContactForm` (Task 7); `LEAD_CONTACT_OUTCOMES` for label/color lookup; `formatDateTime` from `utils/dates.js`.
- Produces: a "Follow-up history" section inside the modal. Accepts a new optional prop `onContactLogged(leadId, contact)` so the parent (`LeadsPage`) can wire undo; if absent, the section still works standalone.

- [ ] **Step 1: Load and render the timeline**

In `LeadDetailModal.jsx`, add state and a load effect (place hooks BEFORE any early return, per the React Hook Rule in CLAUDE.md):

```jsx
const [contacts, setContacts] = useState([]);
const [logging, setLogging] = useState(false);
const [showForm, setShowForm] = useState(false);

useEffect(() => {
  if (!lead?.id) return;
  let alive = true;
  api.listLeadContacts(lead.id).then((rows) => { if (alive) setContacts(rows); }).catch(() => {});
  return () => { alive = false; };
}, [lead?.id]);
```

Add the outcome lookup near the top of the module:

```jsx
const OUTCOME_BY_ID = Object.fromEntries(LEAD_CONTACT_OUTCOMES.map((o) => [o.id, o]));
```

Add the section in the modal body (after the existing notes/details, before the footer):

```jsx
<section className="lead-history">
  <div className="lead-history__head">
    <h4>Follow-up history</h4>
    <button type="button" className="btn btn--sm" onClick={() => setShowForm((s) => !s)}>
      {showForm ? 'Close' : '+ Log follow-up'}
    </button>
  </div>

  {showForm && (
    <LogContactForm
      busy={logging}
      onCancel={() => setShowForm(false)}
      onSubmit={async (values) => {
        setLogging(true);
        try {
          const contact = await api.createLeadContact(lead.id, values);
          setContacts((prev) => [contact, ...prev]);
          setShowForm(false);
          if (onContactLogged) onContactLogged(lead.id, contact);
        } finally { setLogging(false); }
      }}
    />
  )}

  {lead.callNotes ? (
    <p className="lead-history__intake"><strong>Intake note:</strong> {lead.callNotes}</p>
  ) : null}

  {contacts.length === 0 ? (
    <p className="lead-history__empty">No follow-ups logged yet.</p>
  ) : (
    <ul className="lead-history__list">
      {contacts.map((c) => {
        const meta = OUTCOME_BY_ID[c.outcome] || { label: c.outcome, color: '#94a3b8' };
        return (
          <li key={c.id} className="lead-history__item">
            <span className="lead-history__badge" style={{ background: meta.color }}>{meta.label}</span>
            <span className="lead-history__method">{c.method}</span>
            {c.note && <p className="lead-history__note">{c.note}</p>}
            <div className="lead-history__foot">
              <span>{c.createdBy}</span>
              <span>{formatDateTime(c.createdAt)}</span>
              {c.followUpDate && <span>next: {formatDate(c.followUpDate)}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  )}
</section>
```

Add the imports at the top of the file:

```jsx
import LogContactForm from './LogContactForm';
import { LEAD_CONTACT_OUTCOMES } from '../../utils/leadConstants';
import { formatDateTime, formatDate } from '../../utils/dates';
import * as api from '../../api';
```

(If the file already imports `api` or `dates` helpers, extend the existing import rather than adding a duplicate. Accept `onContactLogged` in the component's props destructure.)

- [ ] **Step 2: Verify it builds**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/leads/LeadDetailModal.jsx
git commit -m "feat(leads): follow-up history timeline in lead detail view"
```

---

## Task 9: LeadRemindersModal (morning briefing)

**Files:**
- Create: `client/src/components/leads/LeadRemindersModal.jsx`

**Interfaces:**
- Consumes: `getLeadReminders`, `createLeadContact` (Task 6); `LogContactForm` (Task 7); `LEAD_CONTACT_OUTCOMES`.
- Produces: default-exported `LeadRemindersModal({ open, onClose, onOpenLead, onContactLogged })`. On mount (when `open`) it fetches reminders, renders four labeled bucket sections with count badges, an empty state, and per-row **Log follow-up** (inline `LogContactForm`) + **Open** actions. Logging a follow-up removes that lead from all buckets in local state and calls `onContactLogged(leadId, contact)`.

- [ ] **Step 1: Create the component**

Create `client/src/components/leads/LeadRemindersModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import LogContactForm from './LogContactForm';
import * as api from '../../api';

const BUCKETS = [
  { key: 'due',            title: 'Follow-ups due',   hint: 'Promised call-backs that are due or overdue' },
  { key: 'stale_soon',     title: 'Going stale soon', hint: 'No activity in a while — about to auto-archive' },
  { key: 'new_untouched',  title: 'New & untouched',  hint: 'Fresh leads with no contact logged yet' },
  { key: 'stuck',          title: 'Stuck in a stage', hint: 'Sitting in the same stage too long' },
];

export default function LeadRemindersModal({ open, onClose, onOpenLead, onContactLogged }) {
  const [buckets, setBuckets] = useState({ due: [], stale_soon: [], new_untouched: [], stuck: [] });
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null); // leadId currently logging
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getLeadReminders()
      .then((data) => setBuckets(data))
      .catch(() => setBuckets({ due: [], stale_soon: [], new_untouched: [], stuck: [] }))
      .finally(() => setLoading(false));
  }, [open]);

  function removeLead(leadId) {
    setBuckets((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) next[k] = prev[k].filter((l) => l.id !== leadId);
      return next;
    });
  }

  const total = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);

  if (!open) return null;

  return (
    <Modal onClose={onClose} wide>
      <h3 className="lead-reminders__title">Good morning — leads needing attention</h3>
      {loading ? (
        <p>Loading…</p>
      ) : total === 0 ? (
        <p className="lead-reminders__empty">You're all caught up 🎉</p>
      ) : (
        <div className="lead-reminders">
          {BUCKETS.map(({ key, title, hint }) => {
            const rows = buckets[key];
            if (!rows.length) return null;
            return (
              <section key={key} className="lead-reminders__bucket">
                <h4>{title} <span className="lead-reminders__count">{rows.length}</span></h4>
                <p className="lead-reminders__hint">{hint}</p>
                <ul>
                  {rows.map((l) => (
                    <li key={l.id} className="lead-reminders__row">
                      <div className="lead-reminders__who">
                        <strong>{l.firstName} {l.lastName}</strong>
                        <span>{l.phone}</span>
                        {l.lastContact && <em>last: {l.lastContact.outcome}</em>}
                      </div>
                      <div className="lead-reminders__actions">
                        <button type="button" className="btn btn--sm" onClick={() => setActiveLog(activeLog === l.id ? null : l.id)}>
                          {activeLog === l.id ? 'Close' : 'Log follow-up'}
                        </button>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onOpenLead(l.id)}>Open</button>
                      </div>
                      {activeLog === l.id && (
                        <LogContactForm
                          busy={busy}
                          onCancel={() => setActiveLog(null)}
                          onSubmit={async (values) => {
                            setBusy(true);
                            try {
                              const contact = await api.createLeadContact(l.id, values);
                              removeLead(l.id);
                              setActiveLog(null);
                              if (onContactLogged) onContactLogged(l.id, contact);
                            } finally { setBusy(false); }
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
```

Note: `common/Modal` renders `{ children }` inside a fixed shell and takes `{ children, onClose, wide }` — there is no `title` prop, so the heading is rendered as the first child (as above), matching how `LeadDetailModal` uses `<Modal onClose={onClose} wide>`.

- [ ] **Step 2: Verify it builds**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/leads/LeadRemindersModal.jsx
git commit -m "feat(leads): morning reminders modal with inline follow-up logging"
```

---

## Task 10: Wire modal into LeadsPage + once-per-day + undo

**Files:**
- Modify: `client/src/pages/LeadsPage.jsx`

**Interfaces:**
- Consumes: `LeadRemindersModal` (Task 9); `deleteLeadContact` (Task 6); existing `useUndoStack`, `useAuth`.
- Produces: the modal mounted on the Leads page, shown once per calendar day via `localStorage('leadRemindersShown')`, with contact-logging wired into `undoState.pushAction`.

- [ ] **Step 1: Add imports and the once-per-day + undo wiring**

In `client/src/pages/LeadsPage.jsx`, add imports:

```jsx
import LeadRemindersModal from '../components/leads/LeadRemindersModal';
import { deleteLeadContact, createLeadContact } from '../api';
import { useAuth } from '../hooks/useAuth';
```

(If `LeadsPage.jsx` already imports from `../api` as a namespace like `import * as api from '../api'`, skip these named imports and call `api.deleteLeadContact(...)` / `api.createLeadContact(...)` instead.)

Add hooks (BEFORE any early return — the file already declares `const undoState = useUndoStack();`; place these next to it):

```jsx
const { hasPermission } = useAuth();
const [remindersOpen, setRemindersOpen] = useState(false);

useEffect(() => {
  if (!hasPermission('leads')) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('leadRemindersShown') === today) return;
  // Only open if there is something to show; the modal itself no-ops on empty,
  // but we avoid flashing it by stamping the day once opened.
  setRemindersOpen(true);
  localStorage.setItem('leadRemindersShown', today);
}, [hasPermission]);

const handleContactLogged = useCallback((leadId, contact) => {
  undoState.pushAction(
    `Logged follow-up for lead #${leadId}`,
    async () => { await deleteLeadContact(leadId, contact.id); },   // undo
    async () => { /* redo: re-create (recreated contact gets a new id) */
      await createLeadContact(leadId, {
        outcome: contact.outcome, method: contact.method, note: contact.note,
        followUpDate: contact.followUpDate ? String(contact.followUpDate).slice(0, 10) : '',
      });
    }
  );
}, [undoState]);
```

- [ ] **Step 2: Mount the modal in the page's JSX**

Near the end of the returned JSX (alongside other modals in the page), add:

```jsx
<LeadRemindersModal
  open={remindersOpen}
  onClose={() => setRemindersOpen(false)}
  onOpenLead={(id) => { setRemindersOpen(false); openLeadDetail(id); }}
  onContactLogged={handleContactLogged}
/>
```

Replace `openLeadDetail(id)` with whatever the page's existing "open a lead's detail modal" handler is called (search the file for how a `LeadCard`/row opens `LeadDetailModal` and reuse that exact function).

- [ ] **Step 3: Pass onContactLogged to the detail modal too**

Find where `LeadDetailModal` is rendered in `LeadsPage.jsx` and add the prop so logging from the detail view is also undoable:

```jsx
onContactLogged={handleContactLogged}
```

- [ ] **Step 4: Verify it builds**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/LeadsPage.jsx
git commit -m "feat(leads): mount reminders modal, once-per-day trigger, undo wiring"
```

---

## Task 11: Styles + manual verification

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add minimal styles**

In `client/src/index.css`, add styles for the new classes used above, matching the existing zinc/shadcn token system (reuse `hsl(var(--border))`, `hsl(var(--primary))`, `hsl(var(--muted-foreground))` as the surrounding CSS does). Cover at minimum: `.lead-history`, `.lead-history__list`, `.lead-history__item`, `.lead-history__badge`, `.lead-history__foot`, `.lead-reminders`, `.lead-reminders__title`, `.lead-reminders__bucket`, `.lead-reminders__count`, `.lead-reminders__hint`, `.lead-reminders__empty`, `.lead-reminders__row`, `.lead-reminders__who`, `.lead-reminders__actions`, `.log-contact-form`, `.log-contact-form__row`, `.log-contact-form__hint`, `.log-contact-form__required`. Keep it consistent with existing modal/list styling (spacing 12–16px, 14px body text, badges rounded with white text).

- [ ] **Step 2: Build the client**

Run from `client/`:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual end-to-end verification (per CLAUDE.md mandatory checklist)**

Start both servers (`cd server && npm run dev`, `cd client && npm run dev`), log in as an admin, and:

1. Seed/ensure at least one lead assigned to or created by the logged-in user with a `followUpDate` of today (use `server/prisma/seed-leads-qa.js` or edit a lead).
2. Clear the day stamp: in the browser console run `localStorage.removeItem('leadRemindersShown')`, then reload.
3. Confirm the **morning modal appears** and the lead shows under "Follow-ups due".
4. Click **Log follow-up**, pick `no answer`, confirm the date field is **required** (submit disabled until set), set a future date, save → row disappears from the modal.
5. Confirm the **Undo button in the GlobalToolbar enables**; click it → the contact is removed (re-open the lead's detail to confirm the timeline no longer shows it). Click **Redo** → it reappears.
6. Open the lead's **detail modal** → confirm the "Follow-up history" section lists the logged contacts newest-first with outcome/method/note/author/date, and the intake note shows above.
7. Open the **Activity drawer** on the Leads page and the **History page** → confirm `LeadContact` entries appear.
8. Reload the page again the same day → confirm the modal does **not** reappear (day stamp respected).

Fix any issue found before considering the task done. A modal that never appears, an Undo that doesn't enable, or an empty Activity drawer means the task is not complete.

- [ ] **Step 4: Run the full backend suite once more**

Run from `server/`:

```bash
npm test
```

Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "style(leads): styles for reminders modal, contact form, and history timeline"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** contact log model (T1), outcomes/thresholds (T2), four buckets (T3), per-user + admin-unowned scoping (T4), endpoints + `createdBy` fix (T5), history entity type + api (T6), reusable form (T7), timeline in lead view (T8), morning modal (T9), once-per-day + undo (T10), styles + mandatory manual verification (T11). All spec sections mapped.
- **Terminal-outcome rule** enforced server-side (T5) and mirrored client-side (T7).
- **Naming consistency:** `classifyLeadForReminders`, `matchesOwner`, `getReminders`, `createLeadContact`, `listLeadContacts`, `deleteLeadContact`, `getLeadReminders`, `getLeadReminders`/`createLeadContact` api names used identically across tasks.
- **Route ordering** note included so `/leads/reminders` isn't swallowed by `/leads/:id`.
- **React Hook Rule** called out in T8/T10 (hooks before early returns).
