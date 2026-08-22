# Employee Portal v3.0 — Area 2: Lifecycle + Agency Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize the employee onboarding lifecycle into a 7-state machine and add per-item agency review over the Area 1 requirement ledger, with a "Changes Requested" loop and status-based portal gating.

**Architecture:** Extend the existing Area 1 `EmployeeRequirement` ledger as the review target (no new review table). All `Employee.onboardingStatus` writes go through one status-machine module (`onboardingLifecycle.js`) that validates transitions and logs audits. A pure `reviewSummary()` derivation decides finalize outcomes. The admin `OnboardingReviewModal` becomes a per-item approve/reject surface; the employee-app renders a changes-requested loop and gates all non-onboarding routes until status is `active`.

**Tech Stack:** Express + Prisma (PostgreSQL) backend, Jest (server tests, run with `TZ=UTC` via `npm test`); React 19 admin client (Vitest) and React 19 + Vite `employee-app` PWA (Vitest).

## Global Constraints

- **Spec source:** `docs/superpowers/specs/2026-08-06-employee-portal-v3-lifecycle-review-design.md`. Every task traces to a spec section.
- **TDD:** backend logic written test-first (Jest); frontend components tested with Vitest. Write the failing test, watch it fail, implement minimal code, watch it pass, commit.
- **Test DB isolation:** server tests MUST run against a `*_test` database. `server/jest.setup.js` hard-requires `DATABASE_URL` to match `/_test(\?|$)/`. Create `server/.env.test` pointing at `nvbestpca_lifecycle_test` before running any server test (Task 0). Run server tests **only** via `cd server && npm test` (sets `TZ=UTC`) — never bare `npx jest`.
- **Audit:** every status transition and every per-item review decision logs `audit.logAction()` with `entityType: 'Employee'` and `metadata` describing the change. New `entityType`s already covered (`Employee`, `EmployeeRequirement` are in `ENTITY_TYPES`).
- **Design system:** admin modal uses `btn btn--success` / `btn btn--danger` / `btn btn--outline`, existing `PreviewModal` / `FileThumbnail` / `useFileThumbnail` for file preview. Employee-app uses its existing onboarding component styles.
- **Canonical statuses (exact strings):** `invitation_pending`, `onboarding_in_progress`, `pending_review`, `changes_requested`, `approved`, `active`, `inactive`.
- **No AI attribution** in commits (user global rule): no `Co-Authored-By`, no "Generated with" lines.
- **Commit granularity:** commit at the end of each task (after its tests pass). Descriptive conventional-commit messages (`feat:`, `test:`, `refactor:`).

---

## File Structure

**Backend (server/):**
- Create `src/services/onboardingLifecycle.js` — status machine: `STATUSES`, `TRANSITIONS`, `transition()`.
- Create `__tests__/onboardingLifecycle.test.js` — transition-table unit tests.
- Modify `src/services/requirementService.js` — add `reviewSummary()`, extend `projectLedger()` with `reviewStatus`, add `resetItemForRework()`.
- Create `__tests__/reviewSummary.test.js` — pure derivation tests.
- Modify `src/services/onboardingService.js` — add `reviewItem()`, `finalizeOnboarding()`; route status writes through lifecycle; retire whole-submission `reviewOnboarding`/`approveOnboarding` usage.
- Modify `src/controllers/onboardingController.js` — add `reviewRequirementItem`, `finalizeOnboarding`; update `getOnboardingReviews` to `pending_review`; delete `approveOnboarding`/`rejectOnboarding`/`requestOnboardingChange` handlers.
- Modify `src/controllers/authController.js` — add `onboardingStatus` to `employeeLogin` + `getMe` responses.
- Modify `src/routes/api.js` — add per-item review + finalize routes; remove the 3 retired review routes.
- Create `prisma/migrations/<ts>_area2_lifecycle_review/migration.sql` — add `EmployeeRequirement.review_status`; rename status values.
- Modify `prisma/schema.prisma` — add `reviewStatus` field; update `onboardingStatus` default.
- Create `prisma/migrate-lifecycle-statuses.js` — idempotent data backfill; wire into deploy seed chain.
- Create `__tests__/onboardingFinalize.test.js`, `__tests__/reviewRequirementItem.test.js` — endpoint integration tests.

**Admin client (client/):**
- Modify `src/api.js` — add `reviewRequirementItem`, `finalizeOnboarding`; remove retired review calls.
- Modify `src/components/employees/OnboardingReviewModal.jsx` — per-item review rows + "Finish Review" + "Approve all remaining".
- Modify `src/pages/EmployeesPage.jsx` — status labels/filters for renamed statuses.
- Create `src/components/employees/__tests__/OnboardingReviewModal.test.jsx`.

**Employee app (employee-app/):**
- Modify `src/api.js` — thread `onboardingStatus` from login; add `getMe` if needed.
- Modify `src/hooks/useAuth.jsx` — expose `onboardingStatus`; refresh via `/auth/me`.
- Modify `src/App.jsx` — status gate: non-`active` → onboarding-only.
- Modify `src/pages/OnboardingPage.jsx` — changes-requested banner, locked approved items, jump-to-first-rejected.
- Create/modify onboarding step components to accept `reviewStatus` (locked/rejected rendering).
- Tests under `src/pages/__tests__/` and `src/components/onboarding/__tests__/`.

---

## Task 0: Test-DB setup (prerequisite)

**Files:**
- Create: `server/.env.test`

**Interfaces:**
- Produces: a `*_test` Postgres database the whole plan's server tests run against.

- [ ] **Step 1: Create `server/.env.test`**

```
DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test"
JWT_SECRET="test-secret-lifecycle"
ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
INTEGRITY_KEY="1111111111111111111111111111111111111111111111111111111111111111"
```

- [ ] **Step 2: Create the database and apply the current schema**

Run:
```bash
cd server && createdb nvbestpca_lifecycle_test 2>/dev/null; \
  DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test" npx prisma migrate deploy
```
Expected: migrations apply cleanly ("All migrations have been successfully applied").

- [ ] **Step 3: Verify the guard passes**

Run: `cd server && npm test -- --testPathPattern=onboardingReview 2>&1 | tail -20`
Expected: existing suite runs (may fail on assertions we change later, but the `jest.setup.js` DB/TZ guard does NOT throw). If it throws "Refusing to run against non-test DB", fix `.env.test` before continuing.

- [ ] **Step 4: Commit**

Note: `.env.test` may be gitignored. Check `git check-ignore server/.env.test`. If ignored, commit only a documented example instead:

```bash
cd /Users/mac/Documents/antigravity/nvbestpca/worktrees/employee-lifecycle-review
# If .env.test is NOT ignored:
git add server/.env.test && git commit -m "test: add lifecycle test-db env"
# If it IS ignored, skip the commit — the file only needs to exist locally.
```

---

## Task 1: Status-machine module (`onboardingLifecycle.js`)

Implements Spec Section 1. Pure transition table + a `transition()` that validates, writes `onboardingStatus`, and logs an audit entry.

**Files:**
- Create: `server/src/services/onboardingLifecycle.js`
- Test: `server/__tests__/onboardingLifecycle.test.js`

**Interfaces:**
- Produces:
  - `STATUSES = { INVITATION_PENDING: 'invitation_pending', ONBOARDING_IN_PROGRESS: 'onboarding_in_progress', PENDING_REVIEW: 'pending_review', CHANGES_REQUESTED: 'changes_requested', APPROVED: 'approved', ACTIVE: 'active', INACTIVE: 'inactive' }`
  - `TRANSITIONS` — map of `from` → array of allowed `to` strings.
  - `isAllowed(from, to) → boolean`
  - `async transition(tx, employeeId, to, meta = {})` — accepts a Prisma client/transaction `tx`, reads current status, throws `Error('Illegal onboarding transition: <from> → <to>')` if not allowed, updates `onboardingStatus`, logs audit (`entityType: 'Employee'`, `action: 'UPDATE'`, `metadata: { statusFrom, statusTo, ...meta }`), returns the updated employee.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/onboardingLifecycle.test.js
const prisma = require('../src/lib/prisma');
const lifecycle = require('../src/services/onboardingLifecycle');
const { STATUSES } = lifecycle;

afterAll(async () => { await prisma.$disconnect(); });

describe('onboardingLifecycle transition table (pure)', () => {
  it('exposes all 7 canonical statuses', () => {
    expect(Object.values(STATUSES).sort()).toEqual(
      ['active', 'approved', 'changes_requested', 'inactive', 'invitation_pending', 'onboarding_in_progress', 'pending_review'].sort()
    );
  });

  it.each([
    ['invitation_pending', 'onboarding_in_progress'],
    ['onboarding_in_progress', 'pending_review'],
    ['pending_review', 'approved'],
    ['approved', 'active'],
    ['pending_review', 'changes_requested'],
    ['changes_requested', 'pending_review'],
    ['active', 'inactive'],
    ['inactive', 'active'],
  ])('allows %s → %s', (from, to) => {
    expect(lifecycle.isAllowed(from, to)).toBe(true);
  });

  it.each([
    ['invitation_pending', 'active'],
    ['pending_review', 'active'],
    ['active', 'pending_review'],
    ['changes_requested', 'active'],
  ])('rejects %s → %s', (from, to) => {
    expect(lifecycle.isAllowed(from, to)).toBe(false);
  });
});

describe('transition() persistence', () => {
  it('updates status and logs an audit entry for a legal transition', async () => {
    const emp = await prisma.employee.create({ data: { name: 'LC', email: `lc-${Date.now()}@t.co`, onboardingStatus: 'pending_review' } });
    const updated = await lifecycle.transition(prisma, emp.id, 'approved', { reason: 'test' });
    expect(updated.onboardingStatus).toBe('approved');
    const log = await prisma.auditLog.findFirst({ where: { entityType: 'Employee', entityId: emp.id }, orderBy: { id: 'desc' } });
    expect(log.metadata).toMatchObject({ statusFrom: 'pending_review', statusTo: 'approved', reason: 'test' });
  });

  it('throws on an illegal transition and leaves status unchanged', async () => {
    const emp = await prisma.employee.create({ data: { name: 'LC2', email: `lc2-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending' } });
    await expect(lifecycle.transition(prisma, emp.id, 'active')).rejects.toThrow('Illegal onboarding transition: invitation_pending → active');
    const still = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(still.onboardingStatus).toBe('invitation_pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=onboardingLifecycle`
Expected: FAIL — `Cannot find module '../src/services/onboardingLifecycle'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/services/onboardingLifecycle.js
const audit = require('./auditService');

const STATUSES = {
  INVITATION_PENDING: 'invitation_pending',
  ONBOARDING_IN_PROGRESS: 'onboarding_in_progress',
  PENDING_REVIEW: 'pending_review',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

const TRANSITIONS = {
  invitation_pending: ['onboarding_in_progress'],
  onboarding_in_progress: ['pending_review'],
  pending_review: ['approved', 'changes_requested'],
  changes_requested: ['pending_review'],
  approved: ['active'],
  active: ['inactive'],
  inactive: ['active'],
};

function isAllowed(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

// tx: a Prisma client or an interactive transaction client. Validates the move,
// persists onboardingStatus, and logs an audit entry bound to the transition.
async function transition(tx, employeeId, to, meta = {}) {
  const emp = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new Error('Employee not found');
  const from = emp.onboardingStatus;
  if (from === to) return emp; // idempotent no-op
  if (!isAllowed(from, to)) throw new Error(`Illegal onboarding transition: ${from} → ${to}`);
  const updated = await tx.employee.update({ where: { id: employeeId }, data: { onboardingStatus: to } });
  audit.logAction({
    userId: meta.userId ?? 0,
    userName: meta.userName ?? emp.name,
    userRole: meta.userRole ?? 'system',
    action: 'UPDATE',
    entityType: 'Employee',
    entityId: employeeId,
    entityName: emp.name,
    metadata: { statusFrom: from, statusTo: to, ...meta.detail },
  });
  return updated;
}

module.exports = { STATUSES, TRANSITIONS, isAllowed, transition };
```

Note: the test expects `metadata` to contain `reason: 'test'` directly. Adjust `transition` to spread `meta` (minus reserved keys) into metadata. Replace the `metadata` line with:

```js
    metadata: { statusFrom: from, statusTo: to, ...stripReserved(meta) },
```

and add near the top:

```js
function stripReserved(meta) {
  const { userId, userName, userRole, ...rest } = meta;
  return rest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=onboardingLifecycle`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/onboardingLifecycle.js server/__tests__/onboardingLifecycle.test.js
git commit -m "feat: add onboarding lifecycle status machine"
```

---

## Task 2: `reviewSummary()` + ledger `reviewStatus` derivation

Implements Spec Section 2. Adds the pure derivation that decides finalize outcome and extends `projectLedger` output. The `reviewStatus` DB column arrives in Task 3 (migration); here we make the code read it defensively (defaults to `'pending'` when absent) so the pure test can run without the column via in-memory arrays.

**Files:**
- Modify: `server/src/services/requirementService.js`
- Test: `server/__tests__/reviewSummary.test.js`

**Interfaces:**
- Consumes: `projectLedger(employeeId)` output rows (from Task's own extension).
- Produces:
  - `reviewSummary(requirements) → { outcome: 'approved' | 'changes_requested', rejectedIds: number[] }` where `requirements` is an array of `{ id, optional, reviewStatus }`. Rule: any **required** item with `reviewStatus === 'rejected'` → `changes_requested` (and its id is in `rejectedIds`); else all required approved → `approved`. Optional items never affect the outcome.
  - `projectLedger` rows gain `reviewStatus` (string, defaults `'pending'`).

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/reviewSummary.test.js
const { reviewSummary } = require('../src/services/requirementService');

describe('reviewSummary (pure)', () => {
  it('returns approved when every required item is approved', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 2, optional: false, reviewStatus: 'approved' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'approved', rejectedIds: [] });
  });

  it('returns changes_requested with the rejected ids when any required item is rejected', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 2, optional: false, reviewStatus: 'rejected' },
      { id: 3, optional: false, reviewStatus: 'pending' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'changes_requested', rejectedIds: [2] });
  });

  it('ignores optional items entirely', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 9, optional: true, reviewStatus: 'rejected' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'approved', rejectedIds: [] });
  });

  it('treats a not-yet-decided required item as blocking approval (still not rejected → changes only on rejection)', () => {
    const reqs = [{ id: 1, optional: false, reviewStatus: 'pending' }];
    // No rejection, but not all approved: outcome should NOT be approved.
    expect(reviewSummary(reqs).outcome).toBe('changes_requested');
    expect(reviewSummary(reqs).rejectedIds).toEqual([]);
  });
});
```

Note the last case: a finalize call is only *offered* once every required item has a decision (enforced in the UI + endpoint, Task 5), but `reviewSummary` must still be well-defined for a stray `pending`. Define it as: `approved` **only** when every required item is `approved`; otherwise `changes_requested`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=reviewSummary`
Expected: FAIL — `reviewSummary is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/src/services/requirementService.js`, add:

```js
// Decide the finalize outcome from per-item admin review states.
// `reviewStatus`: 'pending' | 'approved' | 'rejected'. Optional items never block.
function reviewSummary(requirements) {
  const required = requirements.filter(r => !r.optional);
  const rejectedIds = required.filter(r => r.reviewStatus === 'rejected').map(r => r.id);
  const allApproved = required.every(r => r.reviewStatus === 'approved');
  return { outcome: allApproved ? 'approved' : 'changes_requested', rejectedIds };
}
```

And in `projectLedger`, add `reviewStatus` to the returned row object:

```js
      rejectionReason: r.rejectionReason,
      reviewStatus: r.reviewStatus || 'pending',
      label: cat ? (cat.label || cat.title) : '',
```

Export `reviewSummary`:

```js
module.exports = { assignRequirements, markSubmitted, markPolicyAck, isOnboardingComplete, projectLedger, reviewSummary, KINDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=reviewSummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/requirementService.js server/__tests__/reviewSummary.test.js
git commit -m "feat: add reviewSummary derivation and reviewStatus in ledger"
```

---

## Task 3: Schema + migration (add `reviewStatus`, rename statuses)

Implements Spec Section 5 (schema portion). Adds the `review_status` column and a SQL migration that also renames existing `onboardingStatus` values.

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_area2_lifecycle_review/migration.sql`

**Interfaces:**
- Produces: `EmployeeRequirement.reviewStatus String @default("pending")` column (`review_status`); `Employee.onboardingStatus` default changed to `'invitation_pending'`.

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`, in `model EmployeeRequirement`, add after `rejectionReason`:

```prisma
  reviewStatus    String    @default("pending") @map("review_status")
```

Change the `Employee.onboardingStatus` line default from `"active"` to `"invitation_pending"`:

```prisma
  onboardingStatus        String                 @default("invitation_pending") @map("onboarding_status")
```

- [ ] **Step 2: Create the migration via Prisma (generates SQL + applies to test DB)**

Run:
```bash
cd server && DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test" \
  npx prisma migrate dev --name area2_lifecycle_review --create-only
```
Expected: a new folder `prisma/migrations/<ts>_area2_lifecycle_review/migration.sql` with an `ALTER TABLE employee_requirements ADD COLUMN review_status ...` and a default change on `employee.onboarding_status`.

- [ ] **Step 3: Append the value-rename statements to the migration SQL**

Open the generated `migration.sql` and append (idempotent — safe to re-run):

```sql
-- Rename legacy onboardingStatus values to canonical Area 2 names.
UPDATE "employees" SET "onboarding_status" = 'invitation_pending' WHERE "onboarding_status" = 'invited';
UPDATE "employees" SET "onboarding_status" = 'pending_review'     WHERE "onboarding_status" = 'submitted';
-- 'active' and 'changes_requested' are already canonical; no change.
```

- [ ] **Step 4: Apply and verify**

Run:
```bash
cd server && DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test" npx prisma migrate deploy && \
  DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test" npx prisma generate
```
Expected: migration applies; client regenerates with `reviewStatus`.

- [ ] **Step 5: Smoke-test the column exists**

Run: `cd server && npm test -- --testPathPattern=reviewSummary` (unchanged) then a quick check that Prisma knows the field:
```bash
cd server && DATABASE_URL="postgresql://mac@localhost:5432/nvbestpca_lifecycle_test" node -e "const p=require('./src/lib/prisma');p.employeeRequirement.findMany({where:{reviewStatus:'pending'},take:1}).then(()=>{console.log('reviewStatus OK');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
Expected: prints `reviewStatus OK`.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add reviewStatus column and rename onboarding statuses"
```

---

## Task 4: Per-item review service + endpoint

Implements Spec Section 3 (per-item review) + Section 2 (item state on decision). Adds `reviewItem()` to the service and the `PATCH /api/employees/:id/requirements/:reqId/review` endpoint.

**Files:**
- Modify: `server/src/services/onboardingService.js`
- Modify: `server/src/controllers/onboardingController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/reviewRequirementItem.test.js`

**Interfaces:**
- Consumes: `onboardingLifecycle` (no transition here — item review does not move employee status), `prisma`.
- Produces:
  - `onboardingService.reviewItem(employeeId, reqId, { decision, reason }) → updated requirement`. `decision` ∈ `{'approved','rejected'}`. On `rejected`, sets `reviewStatus:'rejected'` + `rejectionReason: reason`. On `approved`, sets `reviewStatus:'approved'`, clears `rejectionReason`. Throws `Error('Requirement not found')` if the requirement doesn't belong to `employeeId`; throws `Error('Rejection reason required')` if rejecting with a blank reason.
  - Controller `reviewRequirementItem(req,res,next)` — admin-only; maps `Requirement not found` → 404, `Rejection reason required` → 400; logs audit (`action:'UPDATE'`, `metadata:{ action:'review_requirement', reqId, decision }`).
  - Route: `PATCH /api/employees/:id/requirements/:reqId/review`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/reviewRequirementItem.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `ri-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin' } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1 }, JWT_SECRET)}` };
}

async function empWithReq() {
  const emp = await prisma.employee.create({ data: { name: 'RI EE', email: `ri-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, onboardingStatus: 'pending_review' } });
  const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted' } });
  return { emp, req };
}

describe('PATCH /employees/:id/requirements/:reqId/review', () => {
  it('approves an item', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'approved' });
    expect(res.status).toBe(200);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('approved');
  });

  it('rejects an item with a reason', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'rejected', reason: 'Blurry scan' });
    expect(res.status).toBe(200);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('rejected');
    expect(after.rejectionReason).toBe('Blurry scan');
  });

  it('400s on reject with a blank reason', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'rejected', reason: '  ' });
    expect(res.status).toBe(400);
  });

  it('404s when the requirement is not owned by the employee', async () => {
    const header = await adminHeader();
    const { req } = await empWithReq();
    const other = await prisma.employee.create({ data: { name: 'Other', email: `other-${Date.now()}@t.co`, onboardingStatus: 'pending_review' } });
    const res = await request(app).patch(`/api/employees/${other.id}/requirements/${req.id}/review`).set(header).send({ decision: 'approved' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=reviewRequirementItem`
Expected: FAIL — 404 route not found on the PATCH.

- [ ] **Step 3: Implement the service method**

In `server/src/services/onboardingService.js`, add and export:

```js
async function reviewItem(employeeId, reqId, { decision, reason }) {
  const req = await prisma.employeeRequirement.findUnique({ where: { id: reqId } });
  if (!req || req.employeeId !== employeeId) throw new Error('Requirement not found');
  if (decision === 'rejected') {
    if (!reason || !reason.trim()) throw new Error('Rejection reason required');
    return prisma.employeeRequirement.update({ where: { id: reqId }, data: { reviewStatus: 'rejected', rejectionReason: reason.trim() } });
  }
  return prisma.employeeRequirement.update({ where: { id: reqId }, data: { reviewStatus: 'approved', rejectionReason: '' } });
}
```

Add `reviewItem` to the `module.exports` object.

- [ ] **Step 4: Implement the controller + route**

In `server/src/controllers/onboardingController.js`, add:

```js
async function reviewRequirementItem(req, res, next) {
  try {
    const id = Number(req.params.id);
    const reqId = Number(req.params.reqId);
    const { decision, reason } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' });
    const updated = await onboarding.reviewItem(id, reqId, { decision, reason });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'review_requirement', reqId, decision } });
    res.json({ success: true, requirement: updated });
  } catch (err) {
    if (err.message === 'Requirement not found') return res.status(404).json({ error: err.message });
    if (err.message === 'Rejection reason required') return res.status(400).json({ error: err.message });
    next(err);
  }
}
```

Add `reviewRequirementItem` to `module.exports`. In `server/src/routes/api.js`, add `reviewRequirementItem` to the destructured import from `onboardingController`, and register (near the other `/employees/:id` review routes, ~line 462):

```js
router.patch('/employees/:id/requirements/:reqId/review', requireRole('admin'), requirePermission('employees'), reviewRequirementItem);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=reviewRequirementItem`
Expected: PASS (all 4 cases).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/onboardingService.js server/src/controllers/onboardingController.js server/src/routes/api.js server/__tests__/reviewRequirementItem.test.js
git commit -m "feat: add per-item onboarding requirement review endpoint"
```

---

## Task 5: Finalize endpoint (approve→activate / changes-requested)

Implements Spec Section 3 (finalize). Reads `reviewSummary`, then either transitions to `approved`→`active` (activating the login user, sending welcome email) or to `changes_requested` (reopening the onboarding token, surfacing rejected items).

**Files:**
- Modify: `server/src/services/onboardingService.js`
- Modify: `server/src/controllers/onboardingController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/onboardingFinalize.test.js`

**Interfaces:**
- Consumes: `onboardingLifecycle.transition`, `reviewSummary`, `projectLedger`, `createOnboardingToken`, `sendOnboardingEmail`, `sendWelcomeEmail`.
- Produces:
  - `onboardingService.finalizeOnboarding(employeeId, actor) → { outcome, employee }` where `actor = { userId, userName, userRole }`. `outcome` ∈ `{'approved','changes_requested'}`.
    - `approved`: `transition(tx, id, 'approved', ...)` then `transition(tx, id, 'active', ...)` inside one `$transaction`; set the linked `User.status = 'active'`; fire-and-forget `sendWelcomeEmail`.
    - `changes_requested`: `transition(tx, id, 'changes_requested', ...)`; reopen onboarding tokens (`status:'pending'`, `completedAt:null`, extend `expiresAt`); if the linked user exists, hold it `status:'pending'`; ensure an unexpired token exists (mint + email if not).
    - Guard: throws `Error('Employee is not pending review')` if `onboardingStatus !== 'pending_review'`.
  - Controller `finalizeOnboarding(req,res,next)` — admin-only; maps that guard to 400; logs audit `metadata:{ action:'finalize_onboarding', outcome }`; returns `{ success:true, outcome }`.
  - Route: `POST /api/employees/:id/onboarding/finalize`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/onboardingFinalize.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `fin-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin' } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1 }, JWT_SECRET)}` };
}

// pending_review employee with a login user + one required requirement, plus a completed token.
async function pendingReviewEmployee() {
  const user = await prisma.user.create({ data: { email: `finu-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'Fin', role: 'pca', status: 'pending' } });
  const emp = await prisma.employee.create({ data: { name: 'Fin EE', email: `fin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, onboardingStatus: 'pending_review', userId: user.id } });
  const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted' } });
  const tok = await onboarding.createOnboardingToken(emp.id);
  await prisma.onboardingToken.update({ where: { id: tok.id }, data: { status: 'completed', completedAt: new Date() } });
  return { emp, user, req, tokenStr: tok.token };
}

describe('POST /employees/:id/onboarding/finalize', () => {
  it('all-approved → active + user activated', async () => {
    const header = await adminHeader();
    const { emp, user, req } = await pendingReviewEmployee();
    await prisma.employeeRequirement.update({ where: { id: req.id }, data: { reviewStatus: 'approved' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('approved');
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterEmp.onboardingStatus).toBe('active');
    expect(afterUser.status).toBe('active');
  });

  it('any-rejected → changes_requested + token reopened', async () => {
    const header = await adminHeader();
    const { emp, req } = await pendingReviewEmployee();
    await prisma.employeeRequirement.update({ where: { id: req.id }, data: { reviewStatus: 'rejected', rejectionReason: 'Bad' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('changes_requested');
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(afterEmp.onboardingStatus).toBe('changes_requested');
    const tok = await prisma.onboardingToken.findFirst({ where: { employeeId: emp.id, status: 'pending', expiresAt: { gt: new Date() } } });
    expect(tok).toBeTruthy();
  });

  it('400s if the employee is not pending_review', async () => {
    const header = await adminHeader();
    const { emp } = await pendingReviewEmployee();
    await prisma.employee.update({ where: { id: emp.id }, data: { onboardingStatus: 'active' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=onboardingFinalize`
Expected: FAIL — route not found (404) / `finalizeOnboarding is not a function`.

- [ ] **Step 3: Implement `finalizeOnboarding` in the service**

In `server/src/services/onboardingService.js` add (and `require` the lifecycle + reviewSummary at the top of the file):

```js
const lifecycle = require('./onboardingLifecycle');
const { projectLedger, reviewSummary } = require('./requirementService');
```

```js
async function finalizeOnboarding(employeeId, actor = {}) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error('Employee not found');
  if (employee.onboardingStatus !== 'pending_review') throw new Error('Employee is not pending review');

  const ledger = await projectLedger(employeeId);
  const { outcome } = reviewSummary(ledger);
  const meta = { userId: actor.userId, userName: actor.userName, userRole: actor.userRole };

  if (outcome === 'approved') {
    await prisma.$transaction(async (tx) => {
      await lifecycle.transition(tx, employeeId, 'approved', meta);
      await lifecycle.transition(tx, employeeId, 'active', meta);
      if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { status: 'active' } });
    });
    sendWelcomeEmail(employee).catch(err => console.error('Welcome email failed:', err.message));
    return { outcome, employee };
  }

  // changes_requested
  await prisma.$transaction(async (tx) => {
    await lifecycle.transition(tx, employeeId, 'changes_requested', meta);
    await tx.onboardingToken.updateMany({
      where: { employeeId },
      data: { status: 'pending', completedAt: null, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    });
    if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { status: 'pending' } });
  });
  const active = await prisma.onboardingToken.findFirst({ where: { employeeId, status: 'pending', expiresAt: { gt: new Date() } } });
  if (!active) {
    const token = await createOnboardingToken(employeeId);
    sendOnboardingEmail(employee, token).catch(err => console.error('Onboarding re-invite email failed:', err.message));
  }
  return { outcome, employee };
}
```

Add `finalizeOnboarding` to `module.exports`. **Note:** `requirementService` already `require`s `prisma`; importing `reviewSummary`/`projectLedger` into `onboardingService` creates no cycle (requirementService does not import onboardingService — verify with `grep -n "onboardingService" server/src/services/requirementService.js` → expect no match).

- [ ] **Step 4: Implement the controller + route**

In `server/src/controllers/onboardingController.js` add:

```js
async function finalizeOnboarding(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { outcome } = await onboarding.finalizeOnboarding(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'finalize_onboarding', outcome } });
    res.json({ success: true, outcome });
  } catch (err) {
    if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
    if (err.message === 'Employee is not pending review') return res.status(400).json({ error: err.message });
    next(err);
  }
}
```

Add `finalizeOnboarding` to `module.exports`. In `api.js`, add it to the destructured import and register:

```js
router.post('/employees/:id/onboarding/finalize', requireRole('admin'), requirePermission('employees'), finalizeOnboarding);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=onboardingFinalize`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/onboardingService.js server/src/controllers/onboardingController.js server/src/routes/api.js server/__tests__/onboardingFinalize.test.js
git commit -m "feat: add onboarding finalize endpoint (approve/activate or changes-requested)"
```

---

## Task 6: Re-submit flip-back + wire the first-data transition; retire legacy review endpoints

Implements Spec Section 2 (re-submit flip-back), Section 1 (first-data transition trigger), and Section 3 (retire whole-submission endpoints). Also updates `getOnboardingReviews` to query `pending_review`.

**Files:**
- Modify: `server/src/services/requirementService.js` (add `resetItemForRework`)
- Modify: `server/src/services/onboardingService.js` (submit path: flip rejected items back; transition to `pending_review`)
- Modify: `server/src/controllers/employeePortal/onboardingRequirementsController.js` (first-data transition on personal/emergency save)
- Modify: `server/src/controllers/onboardingController.js` (getOnboardingReviews → `pending_review`; delete `approveOnboarding`/`rejectOnboarding`/`requestOnboardingChange`)
- Modify: `server/src/routes/api.js` (remove the 3 retired routes)
- Test: `server/__tests__/onboardingResubmit.test.js`

**Interfaces:**
- Consumes: `onboardingLifecycle`.
- Produces:
  - `requirementService.resetItemForRework(tx, requirementId)` — sets a redone item back to `reviewStatus:'pending'`, `status:'submitted'`, `rejectionReason:''`. (Called when an employee re-uploads/re-acks a previously rejected item.)
  - The employee submit path (`submitOnboarding` / `completeOnboarding`) transitions `onboarding_in_progress|changes_requested → pending_review` via `lifecycle.transition` instead of writing `'submitted'` directly.
  - First-data saves (`savePersonal`/`saveEmergency`) fire `transition(prisma, empId, 'onboarding_in_progress')` (a no-op if already past it).
  - `getOnboardingReviews` queries `onboardingStatus: 'pending_review'`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/onboardingResubmit.test.js
const prisma = require('../src/lib/prisma');
const { resetItemForRework } = require('../src/services/requirementService');
const lifecycle = require('../src/services/onboardingLifecycle');

afterAll(async () => { await prisma.$disconnect(); });

describe('resetItemForRework', () => {
  it('flips a rejected item back to pending/submitted and clears the reason', async () => {
    const emp = await prisma.employee.create({ data: { name: 'RW', email: `rw-${Date.now()}@t.co`, onboardingStatus: 'changes_requested' } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'rejected', rejectionReason: 'Bad' } });
    await resetItemForRework(prisma, req.id);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('pending');
    expect(after.rejectionReason).toBe('');
    expect(after.status).toBe('submitted');
  });
});

describe('changes_requested → pending_review transition on re-submit', () => {
  it('is a legal transition', () => {
    expect(lifecycle.isAllowed('changes_requested', 'pending_review')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=onboardingResubmit`
Expected: FAIL — `resetItemForRework is not a function`.

- [ ] **Step 3: Implement `resetItemForRework`**

In `server/src/services/requirementService.js`:

```js
async function resetItemForRework(tx, requirementId) {
  return tx.employeeRequirement.update({
    where: { id: requirementId },
    data: { reviewStatus: 'pending', status: 'submitted', rejectionReason: '' },
  });
}
```

Add `resetItemForRework` to `module.exports`.

- [ ] **Step 4: Run the unit test to green**

Run: `cd server && npm test -- --testPathPattern=onboardingResubmit`
Expected: PASS.

- [ ] **Step 5: Wire the submit-path transition**

In `server/src/services/onboardingService.js`, in `completeOnboarding`, replace the direct `onboardingStatus` write. Currently the transaction does `data: { userId: user.id, onboardingStatus: skipApproval ? 'active' : 'submitted' }`. Change to set only `userId` in that update, then after the `$transaction` (when not skipping approval), transition:

```js
    // ... after the existing prisma.$transaction([...]) that sets userId + token + availability
    if (!skipApproval) {
      // invitation_pending|onboarding_in_progress|changes_requested → pending_review
      const cur = await prisma.employee.findUnique({ where: { id: employee.id } });
      if (cur.onboardingStatus === 'invitation_pending') {
        await lifecycle.transition(prisma, employee.id, 'onboarding_in_progress');
      }
      await lifecycle.transition(prisma, employee.id, 'pending_review');
    } else {
      await prisma.employee.update({ where: { id: employee.id }, data: { onboardingStatus: 'active' } });
    }
```

Remove `onboardingStatus` from the in-transaction `employee.update` data (leave `userId`). Keep behaviour identical for the `skipApproval` (pre-existing user) case.

- [ ] **Step 6: Wire the first-data transition**

In `server/src/controllers/employeePortal/onboardingRequirementsController.js`, in both `savePersonal` and `saveEmergency`, after the employee record is updated with the saved data, add (import `lifecycle` at top: `const lifecycle = require('../../services/onboardingLifecycle');`):

```js
    // First real onboarding data moves the employee off invitation_pending. No-op if already past it.
    try { await lifecycle.transition(require('../../lib/prisma'), employee.id, 'onboarding_in_progress'); } catch (e) { /* already past; ignore illegal-from-later-state */ }
```

Because `transition` throws on an illegal move (e.g. from `pending_review`), wrap in try/catch and swallow only the "Illegal onboarding transition" error — rethrow anything else:

```js
    try { await lifecycle.transition(prismaClient, employee.id, 'onboarding_in_progress'); }
    catch (e) { if (!/Illegal onboarding transition/.test(e.message)) throw e; }
```

(Use whatever prisma reference that controller already imports; check the top of the file.)

- [ ] **Step 7: Retire the legacy review endpoints + update the reviews query**

In `server/src/controllers/onboardingController.js`:
- Change `getOnboardingReviews`'s `where` from `{ onboardingStatus: 'submitted' }` to `{ onboardingStatus: 'pending_review' }`.
- Delete the `approveOnboarding`, `rejectOnboarding`, `requestOnboardingChange` functions and remove them from `module.exports`.

In `server/src/routes/api.js`, delete the three routes (`/employees/:id/approve-onboarding`, `/reject-onboarding`, `/request-onboarding-change`) and remove those names from the destructured import.

In `server/src/services/onboardingService.js`, delete `approveOnboarding` and `reviewOnboarding` (now unused) and remove them from `module.exports`. **First** grep for other callers: `grep -rn "approveOnboarding\|reviewOnboarding\|requestOnboardingChange\|rejectOnboarding" server/src client/src` — expect the only remaining references to be the ones this task removes and (temporarily) `client/src/api.js` + `OnboardingReviewModal.jsx` (handled in Tasks 7–8). Leave the client references for those tasks; do not break the server build.

- [ ] **Step 8: Run the full server suite**

Run: `cd server && npm test 2>&1 | tail -30`
Expected: all suites PASS. If `onboardingReviewDecision.test.js` / `onboardingReviews.test.js` from Area 1 assert the old `'submitted'` status or the deleted endpoints, update those tests to the new status names / finalize endpoint (they are testing behavior this task replaces). Do NOT delete coverage — port each assertion to the new flow.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/onboardingService.js server/src/services/requirementService.js server/src/controllers/onboardingController.js server/src/controllers/employeePortal/onboardingRequirementsController.js server/src/routes/api.js server/__tests__/
git commit -m "feat: wire lifecycle transitions on submit/first-data, retire legacy review endpoints"
```

---

## Task 7: Thread `onboardingStatus` into auth responses (server + employee-app)

Implements Spec Section 4 (gating needs status). Adds `onboardingStatus` to `employeeLogin` and `getMe`, then surfaces it in the employee-app `useAuth`.

**Files:**
- Modify: `server/src/controllers/authController.js`
- Modify: `employee-app/src/api.js`
- Modify: `employee-app/src/hooks/useAuth.jsx`
- Test: `server/__tests__/employeeLoginStatus.test.js`

**Interfaces:**
- Produces:
  - `employeeLogin` response `user` object gains `onboardingStatus` (from the linked `Employee`).
  - `getMe` response gains `onboardingStatus` (null for non-employee users).
  - `useAuth()` exposes `user.onboardingStatus` and a `refreshMe()` that re-fetches `/auth/me` and updates stored user.

- [ ] **Step 1: Write the failing server test**

```js
// server/__tests__/employeeLoginStatus.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');

afterAll(async () => { await prisma.$disconnect(); });

it('employee-login returns onboardingStatus', async () => {
  const pw = 'secret123';
  const user = await prisma.user.create({ data: { email: `els-${Date.now()}@t.co`, passwordHash: await bcrypt.hash(pw, 4), name: 'ELS', role: 'pca', status: 'active' } });
  await prisma.employee.create({ data: { name: 'ELS EE', email: `els-emp-${Date.now()}@t.co`, userId: user.id, onboardingStatus: 'changes_requested' } });
  const res = await request(app).post('/api/auth/employee-login').send({ email: user.email, password: pw });
  expect(res.status).toBe(200);
  expect(res.body.user.onboardingStatus).toBe('changes_requested');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=employeeLoginStatus`
Expected: FAIL — `onboardingStatus` is `undefined`.

- [ ] **Step 3: Add `onboardingStatus` to the login response**

In `server/src/controllers/authController.js` `employeeLogin`, the linked `employee` is already fetched. Add `onboardingStatus: employee.onboardingStatus` to the `res.json({ user: {...} })` block.

- [ ] **Step 4: Add `onboardingStatus` to `getMe`**

In `getMe`, after loading the user, also fetch the employee status and include it:

```js
        const employee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { onboardingStatus: true } });
        res.json({
            id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone,
            permissionGroupId: user.permissionGroupId ?? null,
            permissions,
            permissionsVersion: user.permissionsVersion ?? 1,
            onboardingStatus: employee ? employee.onboardingStatus : null,
        });
```

- [ ] **Step 5: Run the server test to green**

Run: `cd server && npm test -- --testPathPattern=employeeLoginStatus`
Expected: PASS.

- [ ] **Step 6: Surface status in the employee-app auth**

In `employee-app/src/api.js`, add a `getMe` call if one doesn't exist:

```js
  getMe: () => request('/auth/me'),
```

In `employee-app/src/hooks/useAuth.jsx`, add a `refreshMe` that re-fetches and merges status, and ensure the stored user carries `onboardingStatus`:

```js
  const refreshMe = useCallback(async () => {
    try {
      const me = await api.getMe();
      const merged = { ...(JSON.parse(localStorage.getItem('user') || '{}')), ...me };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      return merged;
    } catch { return null; }
  }, []);
```

Add `refreshMe` to the context value. `login` already stores `data.user` (now including `onboardingStatus`).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/authController.js server/__tests__/employeeLoginStatus.test.js employee-app/src/api.js employee-app/src/hooks/useAuth.jsx
git commit -m "feat: expose onboardingStatus in auth responses and employee-app auth"
```

---

## Task 8: Employee-app status gate (onboarding-only until active)

Implements Spec Section 4 (status-based gating). One app-level guard: non-`active` employees are redirected to the onboarding/changes-requested view; all other routes are hidden.

**Files:**
- Modify: `employee-app/src/App.jsx`
- Test: `employee-app/src/__tests__/App.gate.test.jsx` (create)

**Interfaces:**
- Consumes: `useAuth().user.onboardingStatus`.
- Produces: `ProtectedRoutes` renders the normal shell only when `onboardingStatus === 'active'`; otherwise `<Navigate to="/onboarding-status" replace />` (a lightweight status/redirect screen). Employees mid-onboarding reach the wizard via their emailed `/onboard/:token` link (unchanged, public route).

- [ ] **Step 1: Write the failing test**

```jsx
// employee-app/src/__tests__/App.gate.test.jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';

// Mock useAuth to control status.
vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual('../hooks/useAuth');
  return { ...actual, useAuth: () => mockAuth };
});
let mockAuth = {};

import App from '../App';

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('status gating', () => {
  it('active employee can see the home shell', () => {
    mockAuth = { user: { id: 1, onboardingStatus: 'active' }, loading: false };
    renderAt('/');
    // Home content marker — adjust to a stable string HomePage renders.
    expect(document.querySelector('.employee-layout, .home-page, main')).toBeTruthy();
  });

  it('changes_requested employee is redirected off the home shell', () => {
    mockAuth = { user: { id: 1, onboardingStatus: 'changes_requested' }, loading: false };
    renderAt('/');
    // The onboarding-status screen renders instead of the schedule/home shell.
    expect(screen.getByText(/onboarding|complete your setup|changes requested/i)).toBeTruthy();
  });
});
```

Note: `App` wraps everything in `AuthProvider`; the `vi.mock` on `useAuth` overrides the consumer hook so the provider's real state is bypassed. If `App` also calls `AuthProvider` internally, keep it — the mock replaces `useAuth` regardless. Adjust the content markers to real strings after seeing HomePage / the new status screen.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd employee-app && npx vitest run src/__tests__/App.gate.test.jsx`
Expected: FAIL — no redirect; both render the shell.

- [ ] **Step 3: Implement the gate + status screen**

Create `employee-app/src/pages/OnboardingStatusPage.jsx` — a minimal screen keyed off status (uses existing app styles):

```jsx
import { useAuth } from '../hooks/useAuth';

export default function OnboardingStatusPage() {
  const { user } = useAuth();
  const status = user?.onboardingStatus;
  const copy = {
    pending_review: { title: 'Onboarding submitted', body: 'Your account is pending review. We’ll email you when it’s activated.' },
    changes_requested: { title: 'Changes requested', body: 'Your admin asked for changes. Open the link in your email to fix the flagged items and resubmit.' },
    inactive: { title: 'Account inactive', body: 'Your account is inactive. Please contact your administrator.' },
  }[status] || { title: 'Complete your setup', body: 'Please finish onboarding using the link in your email.' };
  return (
    <div className="onboarding-status-screen">
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
    </div>
  );
}
```

In `employee-app/src/App.jsx`:
- Import `OnboardingStatusPage`.
- In `ProtectedRoutes`, after the `!user` check, gate on status:

```jsx
function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboardingStatus && user.onboardingStatus !== 'active') {
    return <Navigate to="/onboarding-status" replace />;
  }
  return (
    <NotificationsProvider>
      <EmployeeLayout />
    </NotificationsProvider>
  );
}
```

- Add the public-ish route (still requires a logged-in user, so put it just outside `ProtectedRoutes` but behind a login check, or add a tiny wrapper). Simplest: add a sibling route that renders the status screen when a user exists:

```jsx
        <Route path="/onboarding-status" element={<OnboardingStatusPage />} />
```

Guard `OnboardingStatusPage` to redirect `active` users to `/` and unauthenticated users to `/login` (read `useAuth` inside it).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd employee-app && npx vitest run src/__tests__/App.gate.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/App.jsx employee-app/src/pages/OnboardingStatusPage.jsx employee-app/src/__tests__/App.gate.test.jsx
git commit -m "feat: gate employee-app to onboarding-only until active"
```

---

## Task 9: Employee-app changes-requested loop (banner, locked items, jump-to-rejected)

Implements Spec Section 4 (changes-requested return loop). The `/onboard/:token` wizard, when the ledger has rejected items, shows a banner, locks approved items, and jumps to the first rejected step.

**Files:**
- Modify: `employee-app/src/pages/OnboardingPage.jsx`
- Modify: `employee-app/src/components/onboarding/DocumentsStep.jsx`, `CertificationsStep.jsx`, `PoliciesStep.jsx` (respect `reviewStatus` locked/rejected)
- Test: `employee-app/src/pages/__tests__/OnboardingPage.changesRequested.test.jsx` (create)

**Interfaces:**
- Consumes: `getOnboardingInfo(token)` response — each requirement now carries `reviewStatus` + `rejectionReason` (from Task 2's `projectLedger`). The `getOnboardingInfo` controller already returns `requirements` from `projectLedger`, so no server change is needed here.
- Produces: within the wizard, a `<ChangesRequestedBanner>` listing items where `reviewStatus === 'rejected'` with each `rejectionReason`; approved items render read-only ("✓ Uploaded", no Replace); the wizard's initial step is the first rejected item's step.

- [ ] **Step 1: Write the failing test**

```jsx
// employee-app/src/pages/__tests__/OnboardingPage.changesRequested.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as api from '../../api';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../api');

const ledger = [
  { id: 1, kind: 'document', status: 'approved', reviewStatus: 'approved', optional: false, label: 'ID Card', rejectionReason: '' },
  { id: 2, kind: 'document', status: 'submitted', reviewStatus: 'rejected', optional: false, label: 'SSN Card', rejectionReason: 'Illegible scan' },
];

beforeEach(() => {
  api.getOnboardingInfo.mockResolvedValue({
    employeeName: 'Jane', employeeEmail: 'j@t.co', adminReviewNote: '',
    onboardingStatus: 'changes_requested', requirements: ledger,
    saved: { personal: {}, emergency: {}, availability: null },
    progress: { personal: true, emergency: true, availability: true },
  });
});

it('shows a changes-requested banner listing rejected items with reasons', async () => {
  render(<MemoryRouter initialEntries={['/onboard/tok']}><Routes><Route path="/onboard/:token" element={<OnboardingPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/changes requested/i)).toBeInTheDocument());
  expect(screen.getByText(/SSN Card/)).toBeInTheDocument();
  expect(screen.getByText(/Illegible scan/)).toBeInTheDocument();
});
```

Note: `getOnboardingInfo` currently does not return `onboardingStatus`. Add it in `getOnboardingInfo` (controller) so the wizard can detect the changes-requested mode — small server tweak folded into this task: in `onboardingController.getOnboardingInfo`, add `onboardingStatus: employee.onboardingStatus` to the `res.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd employee-app && npx vitest run src/pages/__tests__/OnboardingPage.changesRequested.test.jsx`
Expected: FAIL — no banner text.

- [ ] **Step 3: Add `onboardingStatus` to `getOnboardingInfo` (server)**

In `server/src/controllers/onboardingController.js` `getOnboardingInfo`, add `onboardingStatus: employee.onboardingStatus,` to the response object.

- [ ] **Step 4: Implement the banner + mode in `OnboardingPage.jsx`**

Add a derived flag and banner:

```jsx
  const rejectedItems = (info?.requirements || []).filter(r => r.reviewStatus === 'rejected');
  const changesRequested = info?.onboardingStatus === 'changes_requested' && rejectedItems.length > 0;
```

Render near the top of the wizard body when `changesRequested`:

```jsx
  {changesRequested && (
    <div className="cr-banner" role="alert">
      <h3>Changes requested</h3>
      <p>Please fix the flagged items below and resubmit.</p>
      <ul>
        {rejectedItems.map(r => (
          <li key={r.id}><strong>{r.label}</strong>{r.rejectionReason ? <span className="cr-banner__reason"> — {r.rejectionReason}</span> : null}</li>
        ))}
      </ul>
    </div>
  )}
```

Add jump-to-first-rejected: extend the existing `initialStepApplied` effect so, when `changesRequested`, the initial `step` is set to the step index of the first rejected item's kind (`documents` / `certifications` / `policies`). Map kind→step key using the existing `STEPS` array (`documents`, `certifications`, `policies`), find the index, and `setStep(idx)` once.

- [ ] **Step 5: Lock approved items in the step components**

In `DocumentsStep.jsx` / `CertificationsStep.jsx` / `PoliciesStep.jsx`, for each requirement render read-only when `reviewStatus === 'approved'` (no Replace/Re-upload/Re-ack control — reuse the existing "✓ Uploaded" state), editable only when `reviewStatus === 'rejected'` or `'pending'`. Show the `rejectionReason` inline under rejected items.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd employee-app && npx vitest run src/pages/__tests__/OnboardingPage.changesRequested.test.jsx`
Expected: PASS.

- [ ] **Step 7: Flip rejected items back on re-submit (server, wire `resetItemForRework`)**

When the employee re-uploads a rejected document or re-acks a rejected policy, the fulfillment controllers (`onboardingRequirementsController.uploadDocument` / `ackPolicy`) should call `resetItemForRework(tx, reqId)` so the redone item goes back to `reviewStatus:'pending'`. Add that call in each fulfillment path. Add a server test asserting a previously-rejected requirement, after re-upload, has `reviewStatus:'pending'` and cleared reason.

- [ ] **Step 8: Run the employee-app + server suites**

Run: `cd employee-app && npx vitest run` then `cd ../server && npm test 2>&1 | tail -20`
Expected: both green.

- [ ] **Step 9: Commit**

```bash
git add employee-app/src/pages/OnboardingPage.jsx employee-app/src/components/onboarding/ employee-app/src/pages/__tests__/OnboardingPage.changesRequested.test.jsx server/src/controllers/onboardingController.js server/src/controllers/employeePortal/onboardingRequirementsController.js server/__tests__/
git commit -m "feat: employee-app changes-requested loop with locked approved items"
```

---

## Task 10: Admin `OnboardingReviewModal` — per-item review UI

Implements Spec Section 3 (admin UI). Replaces the whole-submission Accept/Reject/Request-Change modal with a per-item approve/reject list + "Finish Review" + "Approve all remaining".

**Files:**
- Modify: `client/src/api.js`
- Modify: `client/src/components/employees/OnboardingReviewModal.jsx`
- Test: `client/src/components/employees/__tests__/OnboardingReviewModal.test.jsx` (create)

**Interfaces:**
- Consumes: `getOnboardingReviewDetail(id)` (returns `requirements` with `reviewStatus`, `rejectionReason`, `fileName`).
- Produces:
  - `api.reviewRequirementItem(employeeId, reqId, decision, reason)` → `PATCH /employees/:id/requirements/:reqId/review`.
  - `api.finalizeOnboarding(employeeId)` → `POST /employees/:id/onboarding/finalize`.
  - Modal renders one row per requirement (label + file preview via `PreviewModal`/`FileThumbnail` + Approve/Reject controls; Reject reveals a required reason input). "Finish Review" enabled once every **required** item has a decision (`reviewStatus !== 'pending'`); calls `finalizeOnboarding` then `onResolved`. "Approve all remaining" approves every still-`pending` required item.

- [ ] **Step 1: Add the API helpers + remove retired calls**

In `client/src/api.js`, add:

```js
export const reviewRequirementItem = (employeeId, reqId, decision, reason) =>
  request(`/employees/${employeeId}/requirements/${reqId}/review`, { method: 'PATCH', body: JSON.stringify({ decision, reason }) });
export const finalizeOnboarding = (employeeId) =>
  request(`/employees/${employeeId}/onboarding/finalize`, { method: 'POST' });
```

Remove `approveOnboarding` / `rejectOnboarding` / `requestOnboardingChange` exports (retired in Task 6). (Match the existing `request`/method idiom in this file.)

- [ ] **Step 2: Write the failing test**

```jsx
// client/src/components/employees/__tests__/OnboardingReviewModal.test.jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as api from '../../../api';
import { ToastProvider } from '../../../hooks/useToast';
import OnboardingReviewModal from '../OnboardingReviewModal';

vi.mock('../../../api');

const detail = {
  employee: { id: 7, name: 'Jane', email: 'j@t.co' },
  requirements: [
    { id: 1, kind: 'document', label: 'ID Card', reviewStatus: 'pending', optional: false, fileName: 'id.pdf' },
    { id: 2, kind: 'policy', label: 'HIPAA', reviewStatus: 'pending', optional: false },
  ],
  availability: null,
};

beforeEach(() => {
  api.getOnboardingReviewDetail.mockResolvedValue(detail);
  api.reviewRequirementItem.mockResolvedValue({ success: true });
  api.finalizeOnboarding.mockResolvedValue({ success: true, outcome: 'approved' });
});

function renderModal() {
  return render(<ToastProvider><OnboardingReviewModal employeeId={7} onClose={() => {}} onResolved={() => {}} /></ToastProvider>);
}

it('disables Finish Review until every required item is decided', async () => {
  renderModal();
  await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
  const finish = screen.getByRole('button', { name: /finish review/i });
  expect(finish).toBeDisabled();
});

it('Approve all remaining decides every pending item then enables Finish', async () => {
  renderModal();
  await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /approve all remaining/i }));
  await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('button', { name: /finish review/i })).not.toBeDisabled());
});
```

(Confirm `ToastProvider` is the correct export name for the admin toast context — check `client/src/hooks/useToast`; adapt the wrapper if it differs.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/employees/__tests__/OnboardingReviewModal.test.jsx`
Expected: FAIL — no "Finish Review" button.

- [ ] **Step 4: Rewrite the modal for per-item review**

Replace the Accept/Reject/Request-Change footer and the read-only requirement chips with:
- A per-item row list. Each row: `label`, a file preview (reuse `FileThumbnail` + open in `PreviewModal` where `fileName` exists — pass a `fetchBlob` using the employee document download endpoint), current `reviewStatus` badge, and **Approve** / **Reject** buttons (`btn btn--success` / `btn btn--danger`). Reject reveals a required reason `<textarea>`; confirming calls `api.reviewRequirementItem(id, reqId, 'rejected', reason)` and updates local row state. Approve calls it with `'approved'`.
- Local state: keep a `rows` array mirroring `data.requirements`, updating each row's `reviewStatus` after its API call succeeds.
- Footer:
  - **"Approve all remaining"** (`btn btn--outline`): for every required row still `reviewStatus === 'pending'`, call `reviewRequirementItem(..., 'approved')` (await all), then update local state.
  - **"Finish Review"** (`btn btn--success`): disabled until every required row has `reviewStatus !== 'pending'`; on click calls `api.finalizeOnboarding(employeeId)`, toasts the outcome (`approved` → "Approved & activated"; `changes_requested` → "Sent back for changes"), then `onResolved(employeeId); onClose()`.
- Keep the Personal / Emergency / Availability read-only sections as they are.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/employees/__tests__/OnboardingReviewModal.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/api.js client/src/components/employees/OnboardingReviewModal.jsx client/src/components/employees/__tests__/OnboardingReviewModal.test.jsx
git commit -m "feat: per-item admin onboarding review modal with finalize"
```

---

## Task 11: Admin status labels/filters + data-migration script + full-suite verification

Implements Spec Section 5 (labels/filter maps + deploy-chain migration) and the final no-regression gate.

**Files:**
- Modify: `client/src/pages/EmployeesPage.jsx` (status badges + `onboardingFilter` options)
- Create: `server/prisma/migrate-lifecycle-statuses.js`
- Modify: `server/package.json` (add `db:migrate-lifecycle` script) and the deploy/seed chain (`npm start` sequence in `package.json` / start script)
- Test: `server/__tests__/migrateLifecycleStatuses.test.js`

**Interfaces:**
- Produces:
  - Admin employee list shows canonical status labels: `invitation_pending` → "Invited", `onboarding_in_progress` → "Onboarding", `pending_review` → "Pending Review", `changes_requested` → "Changes Requested", `active` → "Active", `inactive` → "Inactive". The `onboardingFilter` dropdown offers these values.
  - `migrate-lifecycle-statuses.js` exports `run()` — idempotent: renames `invited→invitation_pending`, `submitted→pending_review`; backfills mid-onboarding employees to `onboarding_in_progress` when they have saved onboarding data (dob/address or an onboardingDraft) but no completed submission; leaves already-canonical rows untouched. Safe to run repeatedly.

- [ ] **Step 1: Write the failing migration test**

```js
// server/__tests__/migrateLifecycleStatuses.test.js
const prisma = require('../src/lib/prisma');
const { run } = require('../prisma/migrate-lifecycle-statuses');

afterAll(async () => { await prisma.$disconnect(); });

it('renames legacy statuses and is idempotent', async () => {
  const a = await prisma.employee.create({ data: { name: 'A', email: `mig-a-${Date.now()}@t.co`, onboardingStatus: 'invited' } });
  const b = await prisma.employee.create({ data: { name: 'B', email: `mig-b-${Date.now()}@t.co`, onboardingStatus: 'submitted' } });
  await run();
  expect((await prisma.employee.findUnique({ where: { id: a.id } })).onboardingStatus).toBe('invitation_pending');
  expect((await prisma.employee.findUnique({ where: { id: b.id } })).onboardingStatus).toBe('pending_review');
  // idempotent
  await run();
  expect((await prisma.employee.findUnique({ where: { id: b.id } })).onboardingStatus).toBe('pending_review');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=migrateLifecycleStatuses`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the migration script**

```js
// server/prisma/migrate-lifecycle-statuses.js
const prisma = require('../src/lib/prisma');

async function run() {
  await prisma.employee.updateMany({ where: { onboardingStatus: 'invited' }, data: { onboardingStatus: 'invitation_pending' } });
  await prisma.employee.updateMany({ where: { onboardingStatus: 'submitted' }, data: { onboardingStatus: 'pending_review' } });
  // Backfill: employees still in invitation_pending who already saved onboarding data → onboarding_in_progress.
  const started = await prisma.employee.findMany({
    where: { onboardingStatus: 'invitation_pending', OR: [{ address: { not: '' } }, { dob: { not: null } }, { onboardingDraft: { not: null } }] },
    select: { id: true },
  });
  if (started.length) {
    await prisma.employee.updateMany({ where: { id: { in: started.map(e => e.id) } }, data: { onboardingStatus: 'onboarding_in_progress' } });
  }
  return { renamed: true };
}

if (require.main === module) {
  run().then(() => { console.log('lifecycle status migration complete'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };
```

(Adjust the `address`/`dob` filters to the actual column semantics — `dob` is an encrypted string; if `{ not: null }` on `dob` is unreliable through the crypto layer, filter on `onboardingDraft` + `address` only. Verify against `schema.prisma`.)

- [ ] **Step 4: Run migration test to green**

Run: `cd server && npm test -- --testPathPattern=migrateLifecycleStatuses`
Expected: PASS.

- [ ] **Step 5: Wire into the deploy seed chain**

Add to `server/package.json` scripts: `"db:migrate-lifecycle": "node prisma/migrate-lifecycle-statuses.js"`. Then add it to the production start sequence (where `prisma migrate deploy` → `seed.js` runs — check the root `package.json` `start` script or the Railway start command referenced in CLAUDE.md). Insert `node prisma/migrate-lifecycle-statuses.js` after `prisma migrate deploy` and before/after `seed.js` (idempotent either way). Keep it in the same chained command so a failure stops the deploy.

- [ ] **Step 6: Update admin status labels/filters**

In `client/src/pages/EmployeesPage.jsx`, replace the inline status badges (currently checking `'invited'` and `'submitted'` around lines 755–756) with a canonical map, and update the `onboardingFilter` options to the 6 canonical values:

```jsx
const ONBOARDING_STATUS_LABELS = {
  invitation_pending: 'Invited',
  onboarding_in_progress: 'Onboarding',
  pending_review: 'Pending Review',
  changes_requested: 'Changes Requested',
  active: 'Active',
  inactive: 'Inactive',
};
```

Render `ONBOARDING_STATUS_LABELS[emp.onboardingStatus]` in the badge; drive the filter dropdown from `Object.entries(ONBOARDING_STATUS_LABELS)`. Grep the file for any other `'invited'`/`'submitted'` literal and update. Also check `client/src/pages/HistoryPage.jsx` status filters and any lead-reminders popup that surfaced the old "Review" action — repoint it at the new modal flow (the modal is unchanged in how it's opened; only its internals changed in Task 10).

- [ ] **Step 7: Update the Area 1 review-list consumer**

Wherever the admin surfaces "employees awaiting review" (the lead-reminders popup / `getOnboardingReviews` consumer), confirm it now reads `pending_review` employees (server already changed in Task 6) and opens the upgraded `OnboardingReviewModal`. No status string should remain hardcoded to `'submitted'` on the client — grep `client/src` for `'submitted'` in an onboarding context and fix.

- [ ] **Step 8: Full no-regression verification**

Run, and confirm each is green before claiming done:
```bash
cd server && npm test 2>&1 | tail -30
cd ../client && npx vitest run 2>&1 | tail -20
cd ../employee-app && npx vitest run 2>&1 | tail -20
```
Expected: all three suites pass. Fix any Area 1 test still asserting old status strings by porting it to the new names (do not delete coverage).

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/EmployeesPage.jsx client/src/pages/HistoryPage.jsx server/prisma/migrate-lifecycle-statuses.js server/package.json package.json server/__tests__/migrateLifecycleStatuses.test.js
git commit -m "feat: canonical onboarding status labels, idempotent status migration, deploy wiring"
```

---

## Task 12: DECISIONS.md entry

Per the user's global "Research Before Building" rule, record the build-vs-adopt reasoning for this area.

**Files:**
- Modify (or create): `DECISIONS.md` (repo root)

- [ ] **Step 1: Append the decision entry**

```markdown
## 2026-08-14 — Employee Portal v3 Area 2: Lifecycle + Agency Review

**Decision:** Build in-house (extend the existing Area 1 requirement ledger + a small status-machine module), not adopt a workflow/state-machine library (e.g. XState, `javascript-state-machine`).

**Options considered:**
- **XState / javascript-state-machine** — mature, well-documented, large community. Rejected: our machine is 7 states / 8 edges with DB-persisted status and audit side-effects on every edge; a library adds a dependency and an interpreter abstraction for a table that fits in ~30 lines, and the transitions must run inside Prisma transactions alongside other writes. Poor fit for the effort saved.
- **New dedicated review table** — rejected per spec: the Area 1 `EmployeeRequirement` ledger already holds per-item state; adding `reviewStatus` reuses it and keeps one source of truth. Audit log already captures who/when per decision, so no separate history table (YAGNI).
- **Custom (chosen)** — `onboardingLifecycle.transition()` as the single gate for status writes + a pure `reviewSummary()` derivation. Minimal surface, fully testable, no new deps.

**Why:** the domain is small and tightly coupled to our persistence + audit conventions; a library would constrain more than it helps.
```

- [ ] **Step 2: Commit**

```bash
git add DECISIONS.md
git commit -m "docs: record build-vs-adopt decision for lifecycle + review (Area 2)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §1 Status machine (`onboardingLifecycle.js`, 7 states, transition table, audit) | Task 1; first-data + submit transitions in Task 6 |
| §2 Per-item model (`reviewStatus`, `reviewSummary`, re-submit flip-back) | Task 2 (derivation + ledger), Task 3 (column), Task 6/9 (`resetItemForRework`) |
| §3 Admin review flow (per-item endpoint, finalize, modal upgrade, approve-all) | Task 4 (item endpoint), Task 5 (finalize), Task 10 (modal) |
| §4 Employee side (changes-requested loop, locked items, jump-to-rejected, gating) | Task 8 (gating), Task 9 (loop) + Task 7 (status in auth) |
| §5 Data migration (column + rename + backfill), testing, label maps, deploy chain | Task 3 (schema/migration), Task 11 (data script + labels + deploy wiring) |
| Retire legacy whole-submission endpoints | Task 6 (server) + Task 10 (client api) |
| Cross-cutting: audit on every transition/decision | Tasks 1, 4, 5 (audit calls) |
| Test-DB isolation (`.env.test`, `_test` DB, `TZ=UTC`) | Task 0 + every server test run via `npm test` |
| DECISIONS.md entry (user global rule) | Task 12 |

**Placeholder scan:** No "TODO"/"handle edge cases"/"similar to Task N" left; each code step carries real content. A few steps call out "adjust to the actual column/idiom after checking `schema.prisma`/`useToast`" — these are verification instructions, not missing content, and name the exact file to check.

**Type consistency:** `transition(tx, employeeId, to, meta)`, `reviewSummary(reqs) → {outcome, rejectedIds}`, `reviewItem(employeeId, reqId, {decision, reason})`, `finalizeOnboarding(employeeId, actor) → {outcome, employee}`, `resetItemForRework(tx, requirementId)`, `reviewRequirementItem`/`finalizeOnboarding` controllers, and the two client API helpers are named identically across every task that references them. Status strings use the seven canonical values everywhere.

**Note on ordering:** Task 3 (migration) must land before Tasks 4–11 run against the DB (they read/write `reviewStatus`). Task 2's pure test runs without the column (in-memory arrays), so it is safe before Task 3. Execute tasks in the listed order.
