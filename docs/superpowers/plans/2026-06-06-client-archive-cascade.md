# Client Archive Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a client is archived or deactivated, cascade the effect to all related entities (authorizations, shifts, timesheets, permanent links) with confirmation modals and undo toasts.

**Architecture:** Enhance existing `deleteClient`/`bulkDelete`/`restoreClient` backend endpoints to also cascade to authorizations and permanent links. Add archive UI actions (per-row menu item + bulk action) on the client list page and an "Archive" button on the client detail page. Guard the PCA form against archived clients.

**Tech Stack:** Express.js + Prisma (backend), React (frontend), existing `ConfirmModal` + `showUndoToast` patterns.

---

### Task 1: Enhance Backend Archive Cascade

**Files:**
- Modify: `server/src/controllers/clientController.js` (deleteClient, bulkDelete, restoreClient, restoreClients, updateClient)

- [ ] **Step 1: Update `deleteClient` to cascade to authorizations and permanent links**

In `server/src/controllers/clientController.js`, find the `deleteClient` function (around line 234) and add cascades for authorizations and permanent links:

```javascript
// DELETE /api/clients/:id  (soft-delete → archive)
async function deleteClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        await prisma.authorization.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        await prisma.permanentLink.updateMany({ where: { clientId: id, active: true }, data: { active: false } });
        const archived = await prisma.client.update({ where: { id }, data: { archivedAt: now }, include: { authorizations: true } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Client', entityId: id, entityName: client.clientName });
        res.json(archived);
    } catch (err) {
        next(err);
    }
}
```

- [ ] **Step 2: Update `bulkDelete` to cascade to authorizations and permanent links**

Find `bulkDelete` (around line 251) and add the same cascades:

```javascript
// POST /api/clients/bulk-delete  (soft-delete → archive)
async function bulkDelete(req, res, next) {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }
        const numericIds = ids.map(Number).filter(n => !isNaN(n));
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.authorization.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.permanentLink.updateMany({ where: { clientId: { in: numericIds }, active: true }, data: { active: false } });
        await prisma.client.updateMany({ where: { id: { in: numericIds } }, data: { archivedAt: now } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Client', entityId: 0, metadata: { count: numericIds.length } });
        res.json({ archived: numericIds.length });
    } catch (err) {
        next(err);
    }
}
```

- [ ] **Step 3: Update `restoreClient` to reverse authorization and permanent link cascades**

Find `restoreClient` (around line 270) and restore authorizations + reactivate permanent links:

```javascript
// PUT /api/clients/:id/restore
async function restoreClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        const clientArchivedAt = client.archivedAt;
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: clientArchivedAt }, data: { archivedAt: null } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: clientArchivedAt }, data: { archivedAt: null } });
        await prisma.authorization.updateMany({ where: { clientId: id, archivedAt: clientArchivedAt }, data: { archivedAt: null } });
        await prisma.permanentLink.updateMany({ where: { clientId: id, active: false }, data: { active: true } });
        const restored = await prisma.client.update({
            where: { id }, data: { archivedAt: null },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Client', entityId: id, entityName: restored.clientName });
        res.json(enrichClient(restored));
    } catch (err) {
        next(err);
    }
}
```

- [ ] **Step 4: Update `restoreClients` (bulk restore) to include cascades**

Find the `restoreClients` function and update similarly — restore authorizations and reactivate permanent links for each client using their individual `archivedAt` timestamp.

- [ ] **Step 5: Enhance deactivate cascade to archive future shifts**

In `updateClient`/`patchClient`, find where `clientStatus === 'inactive'` is handled (around line 212). Extend to also handle `discharged` and `transferred`, and archive future shifts:

```javascript
if (clientStatus === 'inactive' || clientStatus === 'discharged' || clientStatus === 'transferred') {
    await prisma.authorization.updateMany({
        where: { clientId: id, archivedAt: null, manualStatus: 'active' },
        data: { manualStatus: 'inactive' },
    });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.shift.updateMany({
        where: { clientId: id, archivedAt: null, shiftDate: { gt: today } },
        data: { archivedAt: new Date() },
    });
}
```

- [ ] **Step 6: When setting back to active, reactivate authorizations**

After the existing deactivate cascade block, add:

```javascript
if (clientStatus === 'active' && oldClient.client_status !== 'active') {
    await prisma.authorization.updateMany({
        where: { clientId: id, manualStatus: 'inactive', archivedAt: null },
        data: { manualStatus: 'active' },
    });
}
```

- [ ] **Step 7: Verify server loads without errors**

Run: `cd server && node -e "require('./src/controllers/clientController.js')"`
Expected: No output (success)

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/clientController.js
git commit -m "feat: cascade archive/deactivate to authorizations, permanent links, and future shifts"
```

---

### Task 2: Add Archive to Client List Page

**Files:**
- Modify: `client/src/pages/ClientsListPage.jsx`

- [ ] **Step 1: Add "Archive" to bulk actions dropdown**

Find the `<select>` for bulk actions (around line 236) and add an Archive option:

```jsx
<option value="Archive">Archive</option>
```

Add it after "Discharge" in the options list.

- [ ] **Step 2: Add archive handler in the bulk action onChange**

In the same `onChange` handler, add a case for 'Archive' (after the 'Discharge' case):

```jsx
} else if (action === 'Archive') {
    setConfirmArchive(selected);
}
```

- [ ] **Step 3: Add state for confirmArchive**

Add state near other state declarations (around line 47):

```jsx
const [confirmArchive, setConfirmArchive] = useState(null);
```

- [ ] **Step 4: Add single-row archive to the per-row dropdown menu**

Find the per-row menu dropdown (around line 368) and add an Archive option after "Edit Client":

```jsx
<button className="cl-row-menu__item cl-row-menu__item--danger" onClick={() => { setConfirmArchive([c]); setMenuOpenId(null); }}>
    {Icons.trash} Archive
</button>
```

- [ ] **Step 5: Add the archive handler function**

Add this handler function in the component:

```jsx
const handleArchive = async () => {
    try {
        const toArchive = confirmArchive;
        if (toArchive.length === 1) {
            await api.deleteClient(toArchive[0].id);
        } else {
            await api.bulkDeleteClients(toArchive.map(c => c.id));
        }
        setConfirmArchive(null);
        setSelectedIds(new Set());
        fetchClients();
        showUndoToast(`Archived ${toArchive.length} client${toArchive.length > 1 ? 's' : ''}`, async () => {
            if (toArchive.length === 1) {
                await api.restoreClient(toArchive[0].id);
            } else {
                await api.bulkRestoreClients(toArchive.map(c => c.id));
            }
            fetchClients();
        });
    } catch (err) {
        showToast(err.message, 'error');
    }
};
```

- [ ] **Step 6: Add ConfirmModal for archive confirmation**

Add the modal render near the other modals at the bottom of the JSX (import `ConfirmModal` if not already imported):

```jsx
{confirmArchive && (
    <ConfirmModal
        title={confirmArchive.length === 1 ? 'Archive Client' : `Archive ${confirmArchive.length} Clients`}
        message={confirmArchive.length === 1
            ? `Archive "${confirmArchive[0].clientName}"? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`
            : `Archive ${confirmArchive.length} clients? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={handleArchive}
        onClose={() => setConfirmArchive(null)}
    />
)}
```

- [ ] **Step 7: Import ConfirmModal if not already imported**

Check the imports at the top. If `ConfirmModal` is not imported, add:

```jsx
import ConfirmModal from '../components/common/ConfirmModal';
```

- [ ] **Step 8: Verify the page builds**

Run: `cd client && npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/ClientsListPage.jsx
git commit -m "feat: add archive action with confirmation and undo to client list page"
```

---

### Task 3: Add Archive to Client Detail Page

**Files:**
- Modify: `client/src/pages/ClientDetailPage.jsx`

- [ ] **Step 1: Add state for archive confirmation**

Add near other state declarations:

```jsx
const [confirmArchiveClient, setConfirmArchiveClient] = useState(false);
```

- [ ] **Step 2: Add Archive button in header actions**

Find the `content-header__actions` div (around line 655) and add an archive button after the "Edit Client" button:

```jsx
<button className="btn btn--danger-ghost btn--sm" onClick={() => setConfirmArchiveClient(true)}>
    {Icons.trash} Archive
</button>
```

- [ ] **Step 3: Add the archive handler**

Add this function in the component:

```jsx
const handleArchiveClient = async () => {
    try {
        await api.deleteClient(client.id);
        setConfirmArchiveClient(false);
        navigate('/clients');
        showToast(`"${client.clientName}" archived`);
    } catch (err) {
        showToast(err.message, 'error');
    }
};
```

- [ ] **Step 4: Add ConfirmModal for the archive action**

Add at the bottom of the JSX with the other modals:

```jsx
{confirmArchiveClient && (
    <ConfirmModal
        title="Archive Client"
        message={`Archive "${client.clientName}"? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={handleArchiveClient}
        onClose={() => setConfirmArchiveClient(false)}
    />
)}
```

- [ ] **Step 5: Ensure ConfirmModal is imported**

Check if `ConfirmModal` is imported. If not, add:

```jsx
import ConfirmModal from '../components/common/ConfirmModal';
```

- [ ] **Step 6: Verify the page builds**

Run: `cd client && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ClientDetailPage.jsx
git commit -m "feat: add archive button with confirmation to client detail page"
```

---

### Task 4: Guard PCA Form Against Archived Clients

**Files:**
- Modify: `server/src/controllers/pcaFormController.js`

- [ ] **Step 1: Add archived check after link lookup in GET handler**

In the `getPcaForm` function (around line 130), after the existing `!link.active` check, add:

```javascript
if (!link) return res.status(404).json({ error: 'Invalid link' });
if (!link.active) return res.status(403).json({ error: 'This link has been deactivated' });
if (link.client.archivedAt) return res.status(403).json({ error: 'This client is no longer active. The timesheet link has been disabled.' });
```

- [ ] **Step 2: Add the same check in the PUT handler**

In the `updatePcaForm` function, after the link lookup and active check, add:

```javascript
if (link.client.archivedAt) return res.status(403).json({ error: 'This client is no longer active. The timesheet link has been disabled.' });
```

- [ ] **Step 3: Verify server loads**

Run: `cd server && node -e "require('./src/controllers/pcaFormController.js')"`
Expected: No output (success)

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/pcaFormController.js
git commit -m "feat: guard PCA form against archived clients"
```

---

### Task 5: Filter Archived Clients from Scheduling Page

**Files:**
- Modify: `server/src/controllers/schedulingController.js` (if client dropdown data comes from here) OR verify the client list used by scheduling already excludes archived clients.

- [ ] **Step 1: Check how scheduling page loads its client list**

The scheduling page likely uses the same `GET /api/clients` endpoint which already filters `archivedAt: null`. Verify by checking the frontend:

```bash
grep -n "getClients\|fetchClients\|clients" client/src/pages/SchedulingPage.jsx | head -10
```

If it uses `api.getClients()` — no backend change needed (already filters archived). If it uses a different endpoint, add the `archivedAt: null` filter.

- [ ] **Step 2: Verify client dropdowns in shift creation exclude archived**

Check the `SearchableSelect` for clients in the scheduling page. The options should come from the filtered client list (no archived clients). If they do, no change needed.

- [ ] **Step 3: Commit (if changes were needed)**

```bash
git add server/src/controllers/schedulingController.js
git commit -m "fix: exclude archived clients from scheduling client dropdown"
```

---

### Task 6: Build and Push

**Files:**
- Modify: `client/dist/` (rebuild)

- [ ] **Step 1: Build the client**

```bash
cd client && npm run build
```

- [ ] **Step 2: Push all changes**

```bash
git add -f client/dist/
git commit -m "build: rebuild client dist"
git push
```
