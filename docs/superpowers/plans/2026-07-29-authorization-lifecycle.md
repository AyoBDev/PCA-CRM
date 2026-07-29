# Authorization Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual authorization status with a two-action lifecycle — Renew (auto-closes the old auth with no overlap, moves it to a history thread) and Mark Inactive (end date + reason) — and make authorization notes display directly on the auth and be editable in place, separate from client notes.

**Architecture:** Additive Prisma migration adds `renewedFromId`, `renewedToId`, `inactiveReason`, `inactiveNote`, `closedAt` to `Authorization`. The existing `POST /authorizations/:id/renew` endpoint is extended to server-compute the old auth's close date (`newStart − 1 day`), set the chain links, and propagate account/sandata. A new `PATCH /authorizations/:id/inactivate` handles close-outs. Frontend refactors the already-existing `AuthorizationFormModal` status cards (removing "Active", making Renewal/Inactive the toggle) and adds a history thread + always-visible editable note in `ProgramsAuthTab`.

**Tech Stack:** Express + Prisma (PostgreSQL) backend with Jest tests; React 19 + Vite frontend with the app's two-tier toolbar / `.pa-*` design system and `useUndoStack`.

## Global Constraints

- **Backend TDD:** every backend logic change is written test-first — failing Jest test, then implementation. Run `cd server && npm test`.
- **Frontend design system:** follow `docs/superpowers/specs/2026-06-01-design-system-design.md` and existing `.pa-*` / `auth-status-card` markup; do not invent new component styles where one exists.
- **Undo/Redo/History/Activity:** every mutation on the Programs tab wires `undoState.pushAction(desc, undoFn, redoFn)` with real reverse API calls, per CLAUDE.md. `entityType` is `'Authorization'` (already in `ENTITY_TYPES`).
- **No AI attribution** in commits.
- **manualStatus** only ever holds `'active'` or `'inactive'` after this work. Derive nothing new from `'pending'`.
- **Date math** (`newStart − 1 day`) is server-authoritative; the modal only previews it.
- **Multi-auth codes** (`COPE`, `PAS`): renewing one `serviceName` variant must not close a sibling variant — respect the `serviceCode|serviceName` composite already used by `deactivatePreviousAuths`.
- Spec: `docs/superpowers/specs/2026-07-29-authorization-lifecycle-design.md`.

---

## File Structure

**Backend**
- `server/prisma/schema.prisma` — add 5 fields to `Authorization` model.
- `server/prisma/migrations/<ts>_authorization_lifecycle/migration.sql` — add columns + normalize `pending`→`active`.
- `server/src/lib/authDates.js` (create) — `dayBefore(dateStr)` pure helper (single source for close-date math).
- `server/src/controllers/authorizationController.js` — extend `renewAuthorization`; add `inactivateAuthorization`.
- `server/src/routes/api.js` — add `PATCH /authorizations/:id/inactivate`.
- `server/src/services/authorizationService.js` — `enrichAuthorization` passes through new fields (verify).
- `server/src/lib/__tests__/authDates.test.js` (create) — date helper unit tests.
- `server/src/controllers/__tests__/authorizationLifecycle.test.js` (create) — renew + inactivate integration tests.

**Frontend**
- `client/src/api.js` — add `inactivateAuthorization`; confirm `renewAuthorization` shape.
- `client/src/components/common/AuthorizationFormModal.jsx` — remove "Active" card; make Renewal/Inactive the toggle; add close preview banner, note-preset dropdown, inactive fields, "Correct current" link.
- `client/src/pages/ClientDetailPage.jsx` — add `handleRenewAuth` + `handleInactivateAuth`; pass `onRenewal`/`onInactivate` to the modal; wire undo.
- `client/src/pages/client-tabs/ProgramsAuthTab.jsx` — remove status `<select>`; render always-visible editable auth note; render collapsible history thread.
- `client/src/index.css` — history-thread + inline-note styles (reuse existing tokens).

---

## Task 1: Date helper (`dayBefore`)

**Files:**
- Create: `server/src/lib/authDates.js`
- Test: `server/src/lib/__tests__/authDates.test.js`

**Interfaces:**
- Produces: `dayBefore(dateStr: string): string` — takes `'YYYY-MM-DD'`, returns the previous calendar day as `'YYYY-MM-DD'`. Timezone-safe (parses at `T00:00:00`, no UTC drift).

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/__tests__/authDates.test.js
const { dayBefore } = require('../authDates');

describe('dayBefore', () => {
    it('returns the previous day', () => {
        expect(dayBefore('2026-06-01')).toBe('2026-05-31');
    });
    it('crosses year boundary', () => {
        expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    });
    it('handles leap day', () => {
        expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    });
    it('does not drift across timezones', () => {
        // Parsed at local midnight, so the calendar day is stable.
        expect(dayBefore('2026-03-15')).toBe('2026-03-14');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest authDates -v`
Expected: FAIL — "Cannot find module '../authDates'".

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/lib/authDates.js
// Returns the calendar day before dateStr ('YYYY-MM-DD'), as 'YYYY-MM-DD'.
// Parsed at local midnight so the date does not shift across UTC boundaries.
function dayBefore(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

module.exports = { dayBefore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest authDates -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/authDates.js server/src/lib/__tests__/authDates.test.js
git commit -m "feat(auth): add dayBefore date helper for renewal close-out"
```

---

## Task 2: Schema fields + migration

**Files:**
- Modify: `server/prisma/schema.prisma:388-416` (Authorization model)
- Create: `server/prisma/migrations/<timestamp>_authorization_lifecycle/migration.sql`

**Interfaces:**
- Produces: `Authorization.renewedFromId Int?`, `renewedToId Int?`, `inactiveReason String`, `inactiveNote String`, `closedAt DateTime?`.

- [ ] **Step 1: Add fields to the Prisma model**

In `server/prisma/schema.prisma`, inside `model Authorization`, after the `usedHoursYtd` line, add:

```prisma
  renewedFromId           Int?                      @map("renewed_from_id")
  renewedToId             Int?                      @map("renewed_to_id")
  inactiveReason          String                    @default("") @map("inactive_reason")
  inactiveNote            String                    @default("") @map("inactive_note")
  closedAt                DateTime?                 @map("closed_at")
```

- [ ] **Step 2: Create the migration by hand (do not use `migrate dev` — it may reset)**

Create `server/prisma/migrations/<timestamp>_authorization_lifecycle/migration.sql` (use a timestamp later than `20260730000000`, e.g. `20260731000000`):

```sql
-- Authorization lifecycle: renewal chain links, inactive close-out fields,
-- and a normalization of the retired 'pending' status to 'active'.
ALTER TABLE "authorizations"
    ADD COLUMN "renewed_from_id" INTEGER,
    ADD COLUMN "renewed_to_id" INTEGER,
    ADD COLUMN "inactive_reason" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "inactive_note" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "closed_at" TIMESTAMP(3);

-- 'pending' is retired; a pending auth is functionally active.
UPDATE "authorizations" SET "manual_status" = 'active' WHERE "manual_status" = 'pending';
```

- [ ] **Step 3: Apply the migration**

Run: `cd server && npx prisma migrate deploy && npx prisma generate`
Expected: migration applied, client regenerated, no errors.

- [ ] **Step 4: Verify the columns exist**

Run: `cd server && node -e "require('./src/lib/prismaBase').authorization.findFirst({select:{renewedFromId:true,inactiveReason:true,closedAt:true}}).then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(auth): add renewal chain + inactive fields; normalize pending status"
```

---

## Task 3: Extend `renewAuthorization` (backend, TDD)

**Files:**
- Modify: `server/src/controllers/authorizationController.js:291-341` (`renewAuthorization`)
- Test: `server/src/controllers/__tests__/authorizationLifecycle.test.js`

**Interfaces:**
- Consumes: `dayBefore` (Task 1); existing `validateBody`, `deactivatePreviousAuths`, `enrichAuthorization`, `buildAuthTypeFields`.
- Produces: `POST /authorizations/:id/renew` now sets old auth `authorizationEndDate = dayBefore(newStart)`, `manualStatus:'inactive'`, `closedAt:now`, `renewedToId:new.id`; new auth gets `renewedFromId:old.id` and inherits old `accountNumber`/`sandataClientId` when the body omits them.

- [ ] **Step 1: Write the failing test**

```js
// server/src/controllers/__tests__/authorizationLifecycle.test.js
const prisma = require('../../lib/prisma');
const ctrl = require('../authorizationController');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}
const user = { id: 1, name: 'Tester', role: 'admin' };

describe('renewAuthorization', () => {
    let client, oldAuth;
    beforeEach(async () => {
        client = await prisma.client.create({ data: { clientName: 'Renew Test' } });
        oldAuth = await prisma.authorization.create({
            data: {
                clientId: client.id, serviceCode: 'PCS', serviceName: 'Personal Care',
                authorizationNumber: 'A-OLD', authorizedUnits: 40,
                authorizationStartDate: new Date('2025-06-01T00:00:00'),
                authorizationEndDate: new Date('2026-05-31T00:00:00'),
                accountNumber: 'ACCT-1', sandataClientId: 'SAND-1', manualStatus: 'active',
            },
        });
    });
    afterEach(async () => {
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('closes old auth day-before new start and links the chain', async () => {
        const req = {
            params: { id: String(oldAuth.id) }, user,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: '2026-06-01', authorizationEndDate: '2027-05-31',
                notes: 'Hours Increased — 40 to 48',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const newAuth = await prisma.authorization.findUnique({ where: { id: res.body.id } });
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });

        // Old auto-closes the day before the new start; no overlap.
        expect(reloadedOld.authorizationEndDate.toISOString().slice(0, 10)).toBe('2026-05-31');
        expect(reloadedOld.manualStatus).toBe('inactive');
        expect(reloadedOld.closedAt).not.toBeNull();
        expect(reloadedOld.renewedToId).toBe(newAuth.id);
        // New links back and inherits account/sandata.
        expect(newAuth.renewedFromId).toBe(oldAuth.id);
        expect(newAuth.manualStatus).toBe('active');
        expect(newAuth.accountNumber).toBe('ACCT-1');
        expect(newAuth.sandataClientId).toBe('SAND-1');
        expect(newAuth.notes).toBe('Hours Increased — 40 to 48');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest authorizationLifecycle -v`
Expected: FAIL — old auth end date is whatever the current code set (not the day-before), `renewedToId`/`renewedFromId` undefined.

- [ ] **Step 3: Implement the extension**

Replace the body of `renewAuthorization` (lines ~292-340) so the transaction computes the close date and chain links. Key changes shown; keep the surrounding `try/catch`, `validateBody`, and final `deactivatePreviousAuths` call:

```js
// at top of file with the other requires:
const { dayBefore } = require('../lib/authDates');

// POST /api/authorizations/:id/renew
async function renewAuthorization(req, res, next) {
    try {
        const oldId = Number(req.params.id);
        const oldAuth = await prisma.authorization.findUnique({ where: { id: oldId } });
        if (!oldAuth) return res.status(404).json({ error: 'Authorization not found' });

        const errors = await validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const clientId = oldAuth.clientId;
        const newStart = req.body.authorizationStartDate;
        // Server-authoritative close date: the day before the new auth starts.
        const closeDateStr = newStart ? dayBefore(newStart) : null;

        const newAuth = await prisma.authorization.create({
            data: {
                clientId,
                serviceCategory: (req.body.serviceCategory || '').trim(),
                serviceCode: req.body.serviceCode,
                serviceName: (req.body.serviceName || '').trim(),
                authorizationNumber: (req.body.authorizationNumber || '').trim(),
                authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                authorizedHours: parseFloat(req.body.authorizedHours) || 0,
                authorizationStartDate: newStart ? new Date(newStart) : null,
                authorizationEndDate: req.body.authorizationEndDate ? new Date(req.body.authorizationEndDate) : null,
                notes: (req.body.notes || '').trim(),
                // Renewals must not lose these — inherit from the old auth when omitted.
                accountNumber: (req.body.accountNumber || oldAuth.accountNumber || '').trim(),
                sandataClientId: (req.body.sandataClientId || oldAuth.sandataClientId || '').trim(),
                manualStatus: 'active',
                renewedFromId: oldId,
                ...buildAuthTypeFields(req.body),
            },
        });

        await prisma.authorization.update({
            where: { id: oldId },
            data: {
                manualStatus: 'inactive',
                closedAt: new Date(),
                renewedToId: newAuth.id,
                ...(closeDateStr ? { authorizationEndDate: new Date(closeDateStr + 'T00:00:00') } : {}),
            },
        });

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Authorization', entityId: newAuth.id, entityName: `${req.body.serviceCode} (renewal)`, metadata: { renewedFromId: oldId } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Authorization', entityId: oldId, entityName: oldAuth.serviceCode, changes: [{ field: 'manualStatus', oldValue: oldAuth.manualStatus, newValue: 'inactive' }], metadata: { reason: 'renewed', renewedToId: newAuth.id } });

        await deactivatePreviousAuths(clientId, newAuth.serviceCode, (req.body.serviceName || '').trim(), newAuth.id, {
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        });

        res.status(201).json(enrichAuthorization(newAuth));
    } catch (err) {
        next(err);
    }
}
```

Note: the old `$transaction([create, update])` array is replaced by sequential writes because the update depends on `newAuth.id`. This matches the existing create-then-deactivate ordering elsewhere in the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest authorizationLifecycle -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/authorizationController.js server/src/controllers/__tests__/authorizationLifecycle.test.js
git commit -m "feat(auth): renew auto-closes old auth day-before and links the chain"
```

---

## Task 4: `inactivateAuthorization` endpoint (backend, TDD)

**Files:**
- Modify: `server/src/controllers/authorizationController.js` (add function + export)
- Modify: `server/src/routes/api.js:316` (add route near the other auth routes)
- Test: `server/src/controllers/__tests__/authorizationLifecycle.test.js` (add a describe block)

**Interfaces:**
- Produces: `PATCH /authorizations/:id/inactivate` — body `{ authorizationEndDate, inactiveReason, inactiveNote }` → sets `manualStatus:'inactive'`, end date, reason, note, `closedAt:now`. Exported as `inactivateAuthorization`.

- [ ] **Step 1: Write the failing test (append to the same test file)**

```js
describe('inactivateAuthorization', () => {
    let client, auth;
    beforeEach(async () => {
        client = await prisma.client.create({ data: { clientName: 'Inactive Test' } });
        auth = await prisma.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        });
    });
    afterEach(async () => {
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('marks inactive with end date, reason, and note', async () => {
        const req = {
            params: { id: String(auth.id) }, user,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency', inactiveNote: 'Moved to Henderson.' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.manualStatus).toBe('inactive');
        expect(reloaded.inactiveReason).toBe('Client transferred to another agency');
        expect(reloaded.inactiveNote).toBe('Moved to Henderson.');
        expect(reloaded.authorizationEndDate.toISOString().slice(0, 10)).toBe('2026-03-15');
        expect(reloaded.closedAt).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest authorizationLifecycle -t inactivate -v`
Expected: FAIL — `ctrl.inactivateAuthorization is not a function`.

- [ ] **Step 3: Implement the function and export it**

Add to `authorizationController.js` (after `renewAuthorization`):

```js
// PATCH /api/authorizations/:id/inactivate
async function inactivateAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const oldAuth = await prisma.authorization.findUnique({ where: { id } });
        if (!oldAuth) return res.status(404).json({ error: 'Authorization not found' });

        const auth = await prisma.authorization.update({
            where: { id },
            data: {
                manualStatus: 'inactive',
                inactiveReason: (req.body.inactiveReason || '').trim(),
                inactiveNote: (req.body.inactiveNote || '').trim(),
                closedAt: new Date(),
                ...(req.body.authorizationEndDate
                    ? { authorizationEndDate: new Date(req.body.authorizationEndDate + 'T00:00:00') }
                    : {}),
            },
        });

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Authorization', entityId: id, entityName: auth.serviceCode, changes: [{ field: 'manualStatus', oldValue: oldAuth.manualStatus, newValue: 'inactive' }], metadata: { reason: auth.inactiveReason } });
        res.json(enrichAuthorization(auth));
    } catch (err) { next(err); }
}
```

Update the `module.exports` at the bottom of the file to include `inactivateAuthorization`.

- [ ] **Step 4: Add the route**

In `server/src/routes/api.js`, add to the import block that names `renewAuthorization`, then near line 316:

```js
router.patch('/authorizations/:id/inactivate', requireRole('admin', 'user'), requirePermission('authorizations'), inactivateAuthorization);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx jest authorizationLifecycle -v`
Expected: PASS (renew + inactivate).

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/authorizationController.js server/src/routes/api.js server/src/controllers/__tests__/authorizationLifecycle.test.js
git commit -m "feat(auth): add inactivate endpoint with end date, reason, note"
```

---

## Task 5: Retire the free `pending` status branch (backend, TDD)

**Files:**
- Modify: `server/src/controllers/authorizationController.js:265-289` (`updateAuthManualStatus`)
- Test: `server/src/controllers/__tests__/authorizationLifecycle.test.js` (add block)

**Interfaces:**
- Produces: `updateAuthManualStatus` accepts only `'active'`/`'inactive'`; `'pending'` returns 400.

- [ ] **Step 1: Write the failing test (append)**

```js
describe('updateAuthManualStatus validation', () => {
    it('rejects pending', async () => {
        const req = { params: { id: '1' }, user, body: { manualStatus: 'pending' } };
        const res = mockRes();
        await ctrl.updateAuthManualStatus(req, res, () => {});
        expect(res.statusCode).toBe(400);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest authorizationLifecycle -t pending -v`
Expected: FAIL — currently `'pending'` is accepted (200/404, not 400).

- [ ] **Step 3: Remove `'pending'` from the allowed list**

In `updateAuthManualStatus`, change:

```js
if (!['active', 'pending', 'inactive'].includes(manualStatus)) {
    return res.status(400).json({ error: 'Invalid status. Must be active, pending, or inactive.' });
}
```

to:

```js
if (!['active', 'inactive'].includes(manualStatus)) {
    return res.status(400).json({ error: 'Invalid status. Must be active or inactive.' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest authorizationLifecycle -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/authorizationController.js server/src/controllers/__tests__/authorizationLifecycle.test.js
git commit -m "feat(auth): retire pending status; only active/inactive allowed"
```

---

## Task 6: API client helpers (frontend)

**Files:**
- Modify: `client/src/api.js:195-198`

**Interfaces:**
- Consumes: `renewAuthorization(oldAuthId, data)` (exists).
- Produces: `inactivateAuthorization(id, { authorizationEndDate, inactiveReason, inactiveNote })`.

- [ ] **Step 1: Add the helper**

After the existing `renewAuthorization` export in `client/src/api.js`:

```js
export const inactivateAuthorization = (id, data) =>
    request(`/authorizations/${id}/inactivate`, { method: 'PATCH', body: JSON.stringify(data) });
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: build succeeds (or run `npm run build`).

- [ ] **Step 3: Commit**

```bash
git add client/src/api.js
git commit -m "feat(auth): add inactivateAuthorization api helper"
```

---

## Task 7: Refactor `AuthorizationFormModal` — Renewal/Inactive toggle

**Files:**
- Modify: `client/src/components/common/AuthorizationFormModal.jsx`

**Interfaces:**
- Consumes: new prop `onInactivate(payload)` where payload = `{ id, authorizationEndDate, inactiveReason, inactiveNote }`; existing `onRenewal(payload)` extended to carry `authorizationNumber, authorizedUnits, authorizationStartDate, authorizationEndDate, notes`.
- Produces: an Edit modal whose status cards are **Renewal** and **Inactive** only (no "Active"); Renewal is the default mode on edit.

**Design-system note:** reuse the existing `.auth-status-card`, `.field`, `.btn` classes. The close-preview banner reuses `.preview-box` styling from the prototype — add a matching class to `index.css` in Task 10 if not present.

- [ ] **Step 1: Default mode to renewal and add inactive fields state**

Change the `manualStatus` initial state (line 52) so an edit defaults to the renewal flow, and add state for the inactive/preset fields near the other `useState`s:

```js
const [manualStatus, setManualStatus] = useState(
    isRenewal ? 'renewal' : (auth?.id ? 'renewal' : 'active')
);
const [notePreset, setNotePreset] = useState('Annual Renewal – No Changes');
const [inactiveEnd, setInactiveEnd] = useState(new Date().toISOString().split('T')[0]);
const [inactiveReason, setInactiveReason] = useState('Client transferred to another agency');
const [inactiveNote, setInactiveNote] = useState('');
const [correctingInPlace, setCorrectingInPlace] = useState(false);
```

- [ ] **Step 2: Replace the status cards block (remove Active, keep Renewal + Inactive)**

Replace the `{showStatus && (...)}` block's three cards (lines ~266-286) so that on an existing auth only **Renewal** and **Inactive** render (drop the "Active" card entirely). For a brand-new auth (`!auth?.id`) keep the old plain create flow (no status cards). Cards:

```jsx
{showStatus && isEdit && (
    <div className="auth-status-field">
        <label className="field__label">Status</label>
        <div className="auth-status-cards">
            <label className={`auth-status-card ${manualStatus === 'renewal' ? 'auth-status-card--renewal' : ''}`}>
                <input type="radio" name="authStatus" value="renewal" checked={manualStatus === 'renewal'} onChange={() => setManualStatus('renewal')} />
                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                <span className="auth-status-card__label" style={{ color: '#2563eb' }}>Renewal</span>
                <span className="auth-status-card__desc">Annual renewal or any significant change — new dates, new units, new care plan.</span>
            </label>
            <label className={`auth-status-card ${manualStatus === 'inactive' ? 'auth-status-card--inactive' : ''}`}>
                <input type="radio" name="authStatus" value="inactive" checked={manualStatus === 'inactive'} onChange={() => setManualStatus('inactive')} />
                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                <span className="auth-status-card__label">Inactive</span>
                <span className="auth-status-card__desc">Client transferred, passed away, or no longer receiving this service.</span>
            </label>
        </div>
    </div>
)}
```

- [ ] **Step 3: Add the close-preview banner + note preset in renewal mode**

Directly below the date inputs, when `manualStatus === 'renewal' && isEdit`, render the banner and the preset dropdown. Compute the preview with a local `dayBefore` mirror:

```jsx
{isEdit && manualStatus === 'renewal' && !correctingInPlace && (
    <>
        <div className="preview-box">
            On save, <b>{auth.authorizationNumber || 'the current authorization'}</b> auto-closes
            with an end date of <b>{startDate ? fmtDayBefore(startDate) : '—'}</b> — the day before
            this new authorization starts. No overlapping dates, no manual entry.
        </div>
        <div className="field">
            <label>Authorization Note</label>
            <select value={notePreset} onChange={(e) => setNotePreset(e.target.value)}>
                <option>Annual Renewal – No Changes</option>
                <option>Hours Increased</option>
                <option>Hours Decreased</option>
                <option>New Care Plan Received</option>
                <option value="custom">Other — write below</option>
            </select>
            <textarea style={{ marginTop: 8 }} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Add detail — e.g. increased from 40 to 48 units/week per new care plan." />
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCorrectingInPlace(true)}>
            Correct current authorization instead
        </button>
    </>
)}
```

Add near the top of the component (after imports) a local helper:

```js
function fmtDayBefore(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-US');
}
```

- [ ] **Step 4: Add the inactive-mode fields**

When `manualStatus === 'inactive' && isEdit`, render end date / reason / note in place of the renewal fields:

```jsx
{isEdit && manualStatus === 'inactive' && (
    <>
        <div className="field">
            <label>Authorization End Date</label>
            <input type="date" value={inactiveEnd} onChange={(e) => setInactiveEnd(e.target.value)} />
        </div>
        <div className="field">
            <label>Reason</label>
            <select value={inactiveReason} onChange={(e) => setInactiveReason(e.target.value)}>
                <option>Client transferred to another agency</option>
                <option>Client passed away</option>
                <option>No contact with client</option>
                <option>Other</option>
            </select>
        </div>
        <div className="field">
            <label>Notes</label>
            <textarea value={inactiveNote} onChange={(e) => setInactiveNote(e.target.value)} placeholder="Optional additional detail..." />
        </div>
    </>
)}
```

- [ ] **Step 5: Route the submit by mode**

Replace `handleSubmit` (lines 130-160) so it dispatches on mode. Build the renewal note from preset + detail:

```js
const handleSubmit = (e) => {
    e.preventDefault();
    if (isEdit && manualStatus === 'renewal' && !correctingInPlace && onRenewal) {
        const note = notePreset === 'custom'
            ? (notes.trim() || 'Other')
            : (notePreset + (notes.trim() ? ' — ' + notes.trim() : ''));
        onRenewal({
            oldAuthId: auth.id,
            clientId: auth.clientId || clientId,
            serviceCategory, serviceCode, serviceName,
            authorizationNumber,
            authorizedUnits: parseInt(authorizedUnits) || 0,
            authorizationStartDate: startDate || null,
            authorizationEndDate: endDate || null,
            notes: note,
            accountNumber, sandataClientId,
            authorizationType,
            authorizedVisitsPerYear: isAnnual && authorizedVisitsPerYear ? Number(authorizedVisitsPerYear) : null,
            hoursPerVisit: isAnnual && hoursPerVisit ? Number(hoursPerVisit) : null,
            files,
        });
        return;
    }
    if (isEdit && manualStatus === 'inactive' && onInactivate) {
        onInactivate({ id: auth.id, authorizationEndDate: inactiveEnd, inactiveReason, inactiveNote });
        return;
    }
    // Create, or "correct current" in-place edit → plain save (no new auth).
    onSave({
        serviceCategory, serviceCode, serviceName, authorizationNumber,
        authorizedUnits: parseInt(authorizedUnits) || 0,
        authorizationStartDate: startDate || null,
        authorizationEndDate: endDate || null,
        notes, accountNumber, sandataClientId,
        manualStatus: 'active',
        files, authorizationType,
        authorizedVisitsPerYear: isAnnual && authorizedVisitsPerYear ? Number(authorizedVisitsPerYear) : null,
        hoursPerVisit: isAnnual && hoursPerVisit ? Number(hoursPerVisit) : null,
    });
};
```

Add `onInactivate` to the destructured props (line 27-36).

- [ ] **Step 6: Fix the submit button label per mode**

Change the primary button (line ~310):

```jsx
<button type="submit" className="btn btn--primary">
    {!isEdit ? 'Add Authorization'
        : correctingInPlace ? 'Save Correction'
        : manualStatus === 'inactive' ? 'Save & Mark Inactive'
        : 'Save Renewal'}
</button>
```

Also make the units/auth-number fields editable in renewal mode (they start blank via `isRenewal`; for edit-renewal they should prefill from `auth`). Adjust the initial state on lines 41-42 to seed from `auth` when editing:

```js
const [authorizedUnits, setAuthorizedUnits] = useState(auth?.authorizedUnits || '');
const [authorizationNumber, setAuthorizationNumber] = useState(auth?.authorizationNumber || '');
```

- [ ] **Step 7: Verify build**

Run: `cd client && npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/common/AuthorizationFormModal.jsx
git commit -m "feat(auth): modal Renewal/Inactive toggle, close preview, note preset, correct-in-place"
```

---

## Task 8: Wire parent handlers + undo (`ClientDetailPage`)

**Files:**
- Modify: `client/src/pages/ClientDetailPage.jsx:473-497` (add handlers), `:1377-1382` (pass props)

**Interfaces:**
- Consumes: `api.renewAuthorization`, `api.inactivateAuthorization`, `undoState.pushAction`, `fetchClient`, `showToast`, existing `handleSaveAuth`.
- Produces: `handleRenewAuth(payload)`, `handleInactivateAuth(payload)` passed as `onRenewal`/`onInactivate`.

- [ ] **Step 1: Add the two handlers after `handleSaveAuth`**

```js
const handleRenewAuth = async (payload) => {
    setSaving(true);
    try {
        const { oldAuthId, files, ...data } = payload;
        const newAuth = await api.renewAuthorization(oldAuthId, data);
        if (files && files.length && newAuth?.id) {
            for (const file of files) {
                const fd = new FormData();
                fd.append('file', file);
                await api.uploadAuthDocument(newAuth.id, fd);
            }
        }
        showToast('Authorization renewed');
        undoState.pushAction('Renewed authorization',
            async () => { await api.archiveAuthorization(newAuth.id); await api.updateAuthManualStatus(oldAuthId, 'active'); await fetchClient(); },
            async () => { await api.renewAuthorization(oldAuthId, data); await fetchClient(); },
        );
        setShowAuthModal(false);
        fetchClient();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
};

const handleInactivateAuth = async (payload) => {
    setSaving(true);
    try {
        const { id, ...data } = payload;
        const prev = editingAuth;
        await api.inactivateAuthorization(id, data);
        showToast('Authorization marked inactive');
        undoState.pushAction('Marked authorization inactive',
            async () => { await api.updateAuthorization(id, { ...prev, manualStatus: 'active' }); await fetchClient(); },
            async () => { await api.inactivateAuthorization(id, data); await fetchClient(); },
        );
        setShowAuthModal(false);
        fetchClient();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
};
```

- [ ] **Step 2: Pass the new props to the modal**

Update the `<AuthorizationFormModal>` mount (line 1377):

```jsx
<AuthorizationFormModal
    auth={editingAuth ? { ...editingAuth } : (authPresetServiceCode ? { serviceCode: authPresetServiceCode } : null)}
    clientId={client.id}
    onSave={handleSaveAuth}
    onRenewal={handleRenewAuth}
    onInactivate={handleInactivateAuth}
    onClose={() => setShowAuthModal(false)}
/>
```

- [ ] **Step 3: Manual verify in the running app**

Run client dev (`cd client && npm run dev`) and server (`cd server && npm run dev`). On a client with an active auth: Edit → Renewal → change units → Save Renewal. Confirm: old auth closes day-before, new auth active, Undo button enables, Undo restores, Redo re-applies. Then Edit → Inactive → reason → Save; confirm it flags inactive and stays visible.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ClientDetailPage.jsx
git commit -m "feat(auth): wire renew/inactivate handlers with undo in ClientDetailPage"
```

---

## Task 9: `ProgramsAuthTab` — remove status select, add history thread + editable note

**Files:**
- Modify: `client/src/pages/client-tabs/ProgramsAuthTab.jsx`

**Interfaces:**
- Consumes: `authGroupsForInsurance` (each group `{ current[], archived[] }`), each auth carrying new `renewedFromId`, `renewedToId`, `inactiveReason`, `inactiveNote`, `notes`; `handleSaveAuth`-style edit already via `openAuthModal`. Add a new prop `onSaveAuthNote(authId, note)` for inline note edits (implemented in ClientDetailPage as a thin `api.updateAuthorization` + undo).
- Produces: no status `<select>`; always-visible editable note; collapsible history thread.

- [ ] **Step 1: Remove the status `<select>` (lines 276-285)**

Delete the `<select className="pa-auth-item__status-select">...</select>` block entirely. The status is now shown read-only via the existing `ts-badge` expiry badge and the `pa-auth-item--${authStatus}` class.

- [ ] **Step 2: Remove `handleStatusChange` and its `<select>` filter option "Pending"**

Delete `handleStatusChange` (lines 154-162). In the filter tabs (lines 365-369) remove the `{ value: 'pending', label: 'Pending' }` entry. In `STATUS_STYLES`/`STATUS_SORT_ORDER` the `pending` keys can stay harmless, but remove `pending` from the filter UI and from `filterAuths` (line 92 `pending` branch).

- [ ] **Step 3: Render the authorization note always-visible + editable**

Inside `renderServiceCard`, below the `pa-service-card__body` detail block, add an editable note row bound to `latestAuth`:

```jsx
{latestAuth && (
    <AuthNoteInline auth={latestAuth} onSave={onSaveAuthNote} />
)}
```

Add the `AuthNoteInline` component at the top of the file:

```jsx
function AuthNoteInline({ auth, onSave }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(auth.notes || '');
    useEffect(() => { setText(auth.notes || ''); }, [auth.notes]);
    if (!editing) {
        return (
            <div className="pa-auth-note">
                <span className="pa-auth-note__label">Authorization Note</span>
                <span className="pa-auth-note__text">{auth.notes || <em style={{ opacity: .6 }}>No note</em>}</span>
                <button className="btn btn--ghost btn--xs" onClick={() => setEditing(true)}>{Icons.edit} Edit</button>
            </div>
        );
    }
    return (
        <div className="pa-auth-note pa-auth-note--editing">
            <textarea className="pa-auth-note__input" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="pa-auth-note__actions">
                <button className="btn btn--primary btn--xs" onClick={() => { onSave(auth.id, text); setEditing(false); }}>Save</button>
                <button className="btn btn--outline btn--xs" onClick={() => { setText(auth.notes || ''); setEditing(false); }}>Cancel</button>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Render the history thread**

After the `pa-service-card__footer`, when the group's current auth has predecessors, render the thread. Build the chain from `allAuths` by following `renewedFromId`:

```jsx
{(() => {
    const history = allAuths.filter(a => a.renewedToId); // superseded-by-renewal auths
    if (!history.length) return null;
    const isOpen = expandedHistory[code];
    return (
        <div className="pa-history">
            <button className="pa-history__toggle" onClick={() => setExpandedHistory(prev => ({ ...prev, [code]: !prev[code] }))}>
                {isOpen ? Icons.chevronDown : Icons.chevronRight} View authorization history ({history.length})
            </button>
            {isOpen && (
                <div className="pa-history__thread">
                    {history.sort((a, b) => new Date(b.authorizationEndDate || 0) - new Date(a.authorizationEndDate || 0)).map(h => (
                        <div key={h.id} className="pa-history__item">
                            <div className="pa-history__fields">
                                <span><b>#{h.authorizationNumber || '—'}</b></span>
                                <span>{h.authorizedUnits} units</span>
                                <span>{formatDate(h.authorizationStartDate)} – {formatDate(h.authorizationEndDate)}</span>
                                <span className="pa-badge">Superseded</span>
                            </div>
                            {h.notes && <div className="pa-history__note"><b>Note:</b> {h.notes}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
})()}
```

Add `const [expandedHistory, setExpandedHistory] = useState({});` with the other state hooks (before any early return).

- [ ] **Step 5: Show inactive reason on closed (non-renewed) auths**

Where a `latestAuth` is inactive and not renewed (`manualStatus==='inactive' && !renewedToId`), render a reason line in the card body:

```jsx
{latestAuth && (latestAuth.manualStatus === 'inactive') && !latestAuth.renewedToId && (
    <div className="pa-auth-inactive-reason">🛑 <span><b>{latestAuth.inactiveReason}.</b> {latestAuth.inactiveNote}</span></div>
)}
```

- [ ] **Step 6: Verify build**

Run: `cd client && npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/client-tabs/ProgramsAuthTab.jsx
git commit -m "feat(auth): programs tab history thread, editable auth note, drop status select"
```

---

## Task 10: `onSaveAuthNote` wiring + styles

**Files:**
- Modify: `client/src/pages/ClientDetailPage.jsx` (add `handleSaveAuthNote`, pass to both ProgramsAuthTab mounts at lines 882 and 927)
- Modify: `client/src/index.css` (add `.pa-auth-note`, `.pa-history`, `.pa-auth-inactive-reason`, `.preview-box` styles)

**Interfaces:**
- Produces: `handleSaveAuthNote(authId, note)` → `api.updateAuthorization(authId, { ...auth, notes: note })` with undo; `onSaveAuthNote` prop on `ProgramsAuthTab`.

- [ ] **Step 1: Add the handler in ClientDetailPage**

```js
const handleSaveAuthNote = async (authId, note) => {
    const auth = (client.authorizations || []).find(a => a.id === authId);
    const prevNote = auth?.notes || '';
    try {
        await api.updateAuthorization(authId, { ...auth, notes: note });
        showToast('Note saved');
        undoState.pushAction('Edited authorization note',
            async () => { await api.updateAuthorization(authId, { ...auth, notes: prevNote }); await fetchClient(); },
            async () => { await api.updateAuthorization(authId, { ...auth, notes: note }); await fetchClient(); },
        );
        fetchClient();
    } catch (err) { showToast(err.message, 'error'); }
};
```

Pass `onSaveAuthNote={handleSaveAuthNote}` to both `<ProgramsAuthTab>` mounts (lines ~882 and ~927).

- [ ] **Step 2: Add styles to `client/src/index.css`**

```css
.preview-box{ background:hsl(var(--primary)/0.06); border:1px solid hsl(var(--primary)/0.2); border-radius:10px; padding:11px 13px; font-size:12.5px; line-height:1.5; }
.pa-auth-note{ display:flex; align-items:center; gap:8px; margin-top:10px; font-size:13px; }
.pa-auth-note__label{ font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:hsl(var(--muted-foreground)); }
.pa-auth-note__text{ flex:1; }
.pa-auth-note--editing{ flex-direction:column; align-items:stretch; }
.pa-auth-note__input{ width:100%; min-height:56px; border:1px solid hsl(var(--border)); border-radius:8px; padding:8px 10px; font:inherit; }
.pa-auth-note__actions{ display:flex; gap:8px; margin-top:6px; }
.pa-history{ margin-top:12px; }
.pa-history__toggle{ background:none; border:none; color:hsl(var(--primary)); font-weight:600; font-size:12.5px; cursor:pointer; display:flex; align-items:center; gap:5px; padding:4px 2px; }
.pa-history__thread{ margin-top:10px; padding-left:16px; border-left:2px dotted hsl(var(--border)); display:flex; flex-direction:column; gap:10px; }
.pa-history__item{ background:hsl(var(--muted)/0.4); border:1px solid hsl(var(--border)); border-radius:10px; padding:10px 12px; }
.pa-history__fields{ display:flex; flex-wrap:wrap; gap:14px; font-size:12.5px; align-items:center; }
.pa-history__note{ margin-top:6px; font-size:12.5px; color:hsl(var(--muted-foreground)); }
.pa-auth-inactive-reason{ margin-top:10px; font-size:12.5px; color:hsl(var(--destructive)); display:flex; gap:6px; }
```

- [ ] **Step 3: Verify build + manual check**

Run: `cd client && npm run build 2>&1 | tail -5`
Then in the running app: edit an auth note inline → Save → note persists and shows on the card; Undo reverts it. Renew an auth → old one appears under "View authorization history" with its note.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ClientDetailPage.jsx client/src/index.css
git commit -m "feat(auth): inline auth-note save with undo; lifecycle styles"
```

---

## Task 11: HistoryPage entity + notes-separation guard

**Files:**
- Verify: `client/src/pages/HistoryPage.jsx` (`Authorization` already in `ENTITY_TYPES` — no change expected)
- Test: `server/src/controllers/__tests__/authorizationLifecycle.test.js` (add guard test)

**Interfaces:**
- Produces: a regression test proving an auth-note edit never writes `Client.notes`.

- [ ] **Step 1: Write the guard test (append)**

```js
describe('notes separation', () => {
    it('editing an auth note does not touch client.notes', async () => {
        const client = await prisma.client.create({ data: { clientName: 'Sep Test', notes: 'GATE 1234' } });
        const auth = await prisma.authorization.create({ data: { clientId: client.id, serviceCode: 'PCS', notes: 'orig' } });
        const req = { params: { id: String(auth.id) }, user, body: { serviceCode: 'PCS', notes: 'renewal note edited' } };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });
        const reloadedClient = await prisma.client.findUnique({ where: { id: client.id } });
        expect(reloadedClient.notes).toBe('GATE 1234');
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });
});
```

- [ ] **Step 2: Run — expect PASS (no code change; this is a guard)**

Run: `cd server && npx jest authorizationLifecycle -t separation -v`
Expected: PASS. If it fails, a cross-write exists — fix `updateAuthorization` to never touch client fields.

- [ ] **Step 3: Confirm `Authorization` is in `ENTITY_TYPES`**

Run: `grep -n "Authorization" client/src/pages/HistoryPage.jsx`
Expected: present. If absent, add `'Authorization'` to the `ENTITY_TYPES` array.

- [ ] **Step 4: Run the full backend suite**

Run: `cd server && npm test 2>&1 | tail -20`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/__tests__/authorizationLifecycle.test.js
git commit -m "test(auth): guard that auth-note edits never touch client notes"
```

---

## Self-Review

**Spec coverage:**
- §1 status model → Tasks 2, 5 (fields, pending removal, derive-active via badges).
- §2 modal → Task 7 (toggle, preview, preset, correct-in-place) + Task 8 (mount).
- §3 data flow renew → Task 3; inactivate → Task 4; undo → Tasks 8, 10.
- §4 history thread → Task 9.
- §5 notes (editable auth note, separation) → Tasks 9, 10, 11.
- §6 audit/History wiring → covered by `audit.logAction` in Tasks 3–5; entity verified Task 11.
- §7 testing → Tasks 1, 3, 4, 5, 11 (day-before, renew, inactivate, pending reject, separation, full suite).
- §8 decisions (keep correct-in-place, pending→active) → Task 2 migration + Task 7 link.
- §9 constraints → Global Constraints + per-task TDD/design-system notes.

**Placeholder scan:** none — every code step shows real code.

**Type consistency:** `dayBefore` (Task 1) used in Task 3; `onRenewal` payload keys in Task 7 match `handleRenewAuth` destructure in Task 8 (`oldAuthId`, `files`, rest → `data`); `onInactivate` payload `{ id, authorizationEndDate, inactiveReason, inactiveNote }` matches `handleInactivateAuth` and the `inactivateAuthorization` body; `onSaveAuthNote(authId, note)` matches Task 10 handler.

**Known follow-through:** the care-plan upload uses the two-step upload-then-link path (renew returns the new auth id, then `uploadAuthDocument`), resolving the §3 open item without a multipart renew endpoint.
