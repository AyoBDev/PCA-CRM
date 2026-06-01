# Single Active Authorization Per Service Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that only one authorization per service code can be active for a client at any time, auto-deactivating old auths when a new one is created.

**Architecture:** Add a `deactivatePreviousAuths` helper to the authorization controller that marks conflicting active auths as inactive. Call it from create, update, status-change, and restore endpoints. A standalone migration script handles existing duplicates. The AuthorizationsPage drawer filters to active-only.

**Tech Stack:** Express.js, Prisma ORM, PostgreSQL, React 19

---

## File Structure

| File | Change |
|------|--------|
| `server/src/controllers/authorizationController.js` | Modify: add `deactivatePreviousAuths` helper, call it from 4 functions |
| `server/prisma/dedup-active-auths.js` | Create: one-time migration script |
| `client/src/pages/AuthorizationsPage.jsx` | Modify: filter drawer auth list to active only |

---

### Task 1: Add deactivatePreviousAuths helper and wire into createAuthorization

**Files:**
- Modify: `server/src/controllers/authorizationController.js:1-49`

- [ ] **Step 1: Add the helper function**

After line 14 (end of `validateBody`), add:

```javascript
async function deactivatePreviousAuths(clientId, serviceCode, excludeId, auditContext) {
    const existing = await prisma.authorization.findMany({
        where: {
            clientId,
            serviceCode,
            manualStatus: 'active',
            archivedAt: null,
            id: { not: excludeId },
        },
    });
    if (existing.length === 0) return;
    await prisma.authorization.updateMany({
        where: { id: { in: existing.map(a => a.id) } },
        data: { manualStatus: 'inactive' },
    });
    for (const auth of existing) {
        audit.logAction({
            ...auditContext,
            action: 'UPDATE',
            entityType: 'Authorization',
            entityId: auth.id,
            entityName: auth.serviceCode,
            changes: [{ field: 'manualStatus', oldValue: 'active', newValue: 'inactive' }],
            metadata: { reason: 'superseded_by_new_auth' },
        });
    }
}
```

- [ ] **Step 2: Call helper from createAuthorization**

In `createAuthorization`, after the `audit.logAction` call (line 44) and before `res.status(201)`, add:

```javascript
await deactivatePreviousAuths(clientId, req.body.serviceCode, auth.id, {
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
});
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && node -e "require('./src/controllers/authorizationController')"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/authorizationController.js
git commit -m "feat: auto-deactivate previous auth on create"
```

---

### Task 2: Wire deactivatePreviousAuths into updateAuthorization

**Files:**
- Modify: `server/src/controllers/authorizationController.js:51-85`

- [ ] **Step 1: Add deactivation call when serviceCode changes**

In `updateAuthorization`, after the `prisma.authorization.update` call and before the `audit.logAction` call, add:

```javascript
if (req.body.serviceCode !== oldAuth.serviceCode || (auth.manualStatus === 'active' && oldAuth.manualStatus !== 'active')) {
    await deactivatePreviousAuths(auth.clientId, auth.serviceCode, auth.id, {
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    });
}
```

- [ ] **Step 2: Verify server starts**

Run: `cd server && node -e "require('./src/controllers/authorizationController')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/authorizationController.js
git commit -m "feat: auto-deactivate conflicting auth on update"
```

---

### Task 3: Wire deactivatePreviousAuths into updateAuthManualStatus and restoreAuthorization

**Files:**
- Modify: `server/src/controllers/authorizationController.js:106-123,162-180`

- [ ] **Step 1: Add deactivation to restoreAuthorization**

In `restoreAuthorization`, after the `prisma.authorization.update` call (which sets `archivedAt: null`) and before `audit.logAction`, add:

```javascript
if ((restored.manualStatus || 'active') === 'active') {
    await deactivatePreviousAuths(restored.clientId, restored.serviceCode, restored.id, {
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    });
}
```

- [ ] **Step 2: Add deactivation to updateAuthManualStatus**

In `updateAuthManualStatus`, after the `prisma.authorization.update` call and before `audit.logAction`, add:

```javascript
if (manualStatus === 'active') {
    await deactivatePreviousAuths(auth.clientId, auth.serviceCode, auth.id, {
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    });
}
```

Note: `auth` here refers to the variable holding the updated record (line 172 in original).

- [ ] **Step 3: Verify server starts**

Run: `cd server && node -e "require('./src/controllers/authorizationController')"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/authorizationController.js
git commit -m "feat: auto-deactivate conflicting auth on restore and status change"
```

---

### Task 4: Create migration script to dedup existing active auths

**Files:**
- Create: `server/prisma/dedup-active-auths.js`

- [ ] **Step 1: Write the migration script**

Create `server/prisma/dedup-active-auths.js`:

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const auths = await prisma.authorization.findMany({
        where: { manualStatus: 'active', archivedAt: null },
        orderBy: [{ clientId: 'asc' }, { serviceCode: 'asc' }, { authorizationStartDate: 'desc' }, { id: 'desc' }],
        include: { client: { select: { clientName: true } } },
    });

    const groups = {};
    for (const a of auths) {
        const key = `${a.clientId}|${a.serviceCode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
    }

    const toDeactivate = [];
    for (const [key, items] of Object.entries(groups)) {
        if (items.length <= 1) continue;
        // items[0] has the latest start date (kept active), rest get deactivated
        for (let i = 1; i < items.length; i++) {
            toDeactivate.push(items[i]);
        }
    }

    if (toDeactivate.length === 0) {
        console.log('No duplicate active authorizations found. Nothing to do.');
        return;
    }

    console.log(`Found ${toDeactivate.length} duplicate active auth(s) to deactivate:`);
    for (const a of toDeactivate) {
        const start = a.authorizationStartDate ? a.authorizationStartDate.toISOString().split('T')[0] : 'no-start';
        const end = a.authorizationEndDate ? a.authorizationEndDate.toISOString().split('T')[0] : 'no-end';
        console.log(`  - ID ${a.id}: ${a.client.clientName} / ${a.serviceCode} (${start} to ${end})`);
    }

    const result = await prisma.authorization.updateMany({
        where: { id: { in: toDeactivate.map(a => a.id) } },
        data: { manualStatus: 'inactive' },
    });

    console.log(`\nDone. Deactivated ${result.count} authorization(s).`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Test the script (dry-run check)**

Run: `cd server && node prisma/dedup-active-auths.js`
Expected: Either "No duplicate active authorizations found" or a list of deactivated records with a count.

- [ ] **Step 3: Commit**

```bash
git add server/prisma/dedup-active-auths.js
git commit -m "feat: add one-time script to dedup active authorizations"
```

---

### Task 5: Filter AuthorizationsPage drawer to active auths only

**Files:**
- Modify: `client/src/pages/AuthorizationsPage.jsx:1401-1426`

- [ ] **Step 1: Filter the auth list in the drawer**

Replace line 1412:

```javascript
{(drawerClient.authorizations || []).map(auth => (
```

With:

```javascript
{(drawerClient.authorizations || []).filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt).map(auth => (
```

- [ ] **Step 2: Update the empty state check**

Replace line 1401:

```javascript
{(drawerClient.authorizations || []).length === 0 ? (
```

With:

```javascript
{(drawerClient.authorizations || []).filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt).length === 0 ? (
```

- [ ] **Step 3: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/AuthorizationsPage.jsx
git commit -m "feat: filter auth drawer to show only active authorizations"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Auto-deactivate on create (Task 1)
- ✅ Auto-deactivate on update when serviceCode changes or status set to active (Task 2)
- ✅ Auto-deactivate on manual status change to active (Task 3)
- ✅ Auto-deactivate on restore (Task 3)
- ✅ Migration script for existing duplicates (Task 4)
- ✅ AuthorizationsPage drawer filtered to active only (Task 5)
- ✅ No changes needed to filterAuthsByWeek/payroll/PCA form/dashboard (already respect manualStatus)

**No gaps found.**
