# PCA Task Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow PCAs to view tasks assigned to them, update status (start/complete), and edit notes — while keeping create/delete/bulk/settings admin-only.

**Architecture:** Open 4 existing task routes to all staff roles, add assignment-scoped filtering in the controller for non-admins, restrict updateable fields for non-admins, and add `isAdmin` conditional rendering in the React frontend.

**Tech Stack:** Express.js, Prisma ORM, React 19, existing `useAuth` hook

---

## File Structure

| File | Change |
|------|--------|
| `server/src/routes/api.js` | Modify: widen requireRole on 4 task routes |
| `server/src/controllers/taskController.js` | Modify: add assignment filtering + field restrictions |
| `client/src/pages/TasksPage.jsx` | Modify: add isAdmin checks to hide admin-only UI |
| `client/src/components/tasks/TaskModal.jsx` | Modify: add readOnly mode for non-admins |

---

### Task 1: Open task routes to all staff roles

**Files:**
- Modify: `server/src/routes/api.js:357-363`

- [ ] **Step 1: Update route middleware**

In `server/src/routes/api.js`, change the task route section from:

```javascript
// Tasks (admin only)
router.get('/tasks/summary', requireRole('admin'), getTaskSummary);
router.get('/tasks', requireRole('admin'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin'), getTask);
router.post('/tasks', requireRole('admin'), createTask);
router.patch('/tasks/:id', requireRole('admin'), updateTask);
router.delete('/tasks/:id', requireRole('admin'), deleteTask);
```

To:

```javascript
// Tasks
router.get('/tasks/summary', requireRole('admin', 'user', 'pca'), getTaskSummary);
router.get('/tasks', requireRole('admin', 'user', 'pca'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin', 'user', 'pca'), getTask);
router.post('/tasks', requireRole('admin'), createTask);
router.patch('/tasks/:id', requireRole('admin', 'user', 'pca'), updateTask);
router.delete('/tasks/:id', requireRole('admin'), deleteTask);
```

- [ ] **Step 2: Verify server starts**

Run: `cd server && node -e "require('./src/routes/api')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/api.js
git commit -m "feat: open task routes to pca and user roles"
```

---

### Task 2: Add assignment-scoped filtering in controller

**Files:**
- Modify: `server/src/controllers/taskController.js:4-54,217-255`

- [ ] **Step 1: Add helper function**

At the top of `server/src/controllers/taskController.js` (after the require statements on lines 1-2), add:

```javascript
function assignmentFilter(user) {
    if (user.role === 'admin') return {};
    return {
        OR: [
            { assignedToUserId: user.id },
            { assignedToRole: user.role },
        ],
    };
}
```

- [ ] **Step 2: Scope `listTasks` for non-admins**

In the `listTasks` function, after line 10 (`const where = {};`), add the scoping logic:

```javascript
const scope = assignmentFilter(req.user);
if (scope.OR) where.AND = [{ OR: scope.OR }];
```

This merges the assignment filter with the existing query filters.

- [ ] **Step 3: Scope `getTask` for non-admins**

In the `getTask` function, after the `if (!task)` check (line 49), add:

```javascript
if (req.user.role !== 'admin') {
    if (task.assignedToUserId !== req.user.id && task.assignedToRole !== req.user.role) {
        return res.status(403).json({ error: 'Access denied' });
    }
}
```

- [ ] **Step 4: Scope `getTaskSummary` for non-admins**

In the `getTaskSummary` function, add a base filter. Replace the 5 `Promise.all` queries to include assignment scoping:

After line 224 (`weekEnd.setDate(weekEnd.getDate() + 7);`), add:

```javascript
const baseWhere = { status: { in: ['open', 'in_progress'] } };
const scope = assignmentFilter(req.user);
if (scope.OR) baseWhere.AND = [{ OR: scope.OR }];
```

Then update the 5 queries to use `baseWhere` merged with their date conditions:

```javascript
const [overdue, dueToday, dueThisWeek, totalOpen, byUrgency] = await Promise.all([
    prisma.task.count({
        where: { ...baseWhere, dueDate: { lt: todayStart } },
    }),
    prisma.task.count({
        where: { ...baseWhere, dueDate: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.task.count({
        where: { ...baseWhere, dueDate: { gte: todayStart, lt: weekEnd } },
    }),
    prisma.task.count({
        where: baseWhere,
    }),
    prisma.task.groupBy({
        by: ['urgency'],
        where: baseWhere,
        _count: true,
    }),
]);
```

- [ ] **Step 5: Verify server starts**

Run: `cd server && node -e "require('./src/controllers/taskController')"`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/taskController.js
git commit -m "feat: scope task queries to assigned user for non-admins"
```

---

### Task 3: Restrict update fields for non-admins

**Files:**
- Modify: `server/src/controllers/taskController.js:96-145`

- [ ] **Step 1: Add field restriction and ownership check in `updateTask`**

In the `updateTask` function, after the `if (!existing)` check (line 100), add:

```javascript
if (req.user.role !== 'admin') {
    if (existing.assignedToUserId !== req.user.id && existing.assignedToRole !== req.user.role) {
        return res.status(403).json({ error: 'Access denied' });
    }
}
```

Then replace the field extraction block (lines 102-110) with role-aware logic:

```javascript
const data = {};
if (req.user.role === 'admin') {
    const { title, description, notes, status, urgency, dueDate, assignedToUserId, assignedToRole } = req.body;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (notes !== undefined) data.notes = notes;
    if (urgency !== undefined) data.urgency = urgency;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (assignedToUserId !== undefined) data.assignedToUserId = assignedToUserId ? Number(assignedToUserId) : null;
    if (assignedToRole !== undefined) data.assignedToRole = assignedToRole || null;
    if (status !== undefined) data.status = status;
} else {
    const { notes, status } = req.body;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) {
        const allowed = { open: ['in_progress', 'completed'], in_progress: ['completed'] };
        if (!allowed[existing.status]?.includes(status)) {
            return res.status(400).json({ error: `Cannot change status from ${existing.status} to ${status}` });
        }
        data.status = status;
    }
}
```

Keep the existing `completedAt` logic that follows (lines 112-120) — it operates on `data.status` which is set by either branch above.

- [ ] **Step 2: Verify server starts**

Run: `cd server && node -e "require('./src/controllers/taskController')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/taskController.js
git commit -m "feat: restrict task update fields to status+notes for non-admins"
```

---

### Task 4: Add isAdmin checks to TasksPage

**Files:**
- Modify: `client/src/pages/TasksPage.jsx`

- [ ] **Step 1: Import useAuth and get isAdmin**

Add import at the top:

```javascript
import { useAuth } from '../hooks/useAuth';
```

Inside the component, at the start of the function body (after `const { showToast } = useToast();`):

```javascript
const { isAdmin } = useAuth();
```

- [ ] **Step 2: Hide admin-only elements**

Wrap the following in `{isAdmin && ...}`:

1. The "Settings" button in the page-hero
2. The "New Task" button in the page-hero
3. The "Assigned To" filter field in the ts-filter-bar
4. The checkbox column header and all row checkboxes (bulk selection)
5. The bulk actions bar
6. The workflow triggers settings section

- [ ] **Step 3: Update 3-dot menu for non-admins**

Replace the 3-dot menu dropdown content with role-aware options:

```jsx
<div className="cl-row-menu__dropdown">
    {isAdmin && (
        <button className="cl-row-menu__item" onClick={() => { setEditingTask(task); setModalOpen(true); setMenuOpenId(null); }}>
            {Icons.edit} Edit
        </button>
    )}
    {task.status === 'open' && (
        <button className="cl-row-menu__item" onClick={() => { handleStatusChange(task, 'in_progress'); setMenuOpenId(null); }}>
            {Icons.chevronRight} Start
        </button>
    )}
    {(task.status === 'open' || task.status === 'in_progress') && (
        <button className="cl-row-menu__item" onClick={() => { handleStatusChange(task, 'completed'); setMenuOpenId(null); }}>
            {Icons.checkCircle} Complete
        </button>
    )}
    {isAdmin && (task.status === 'open' || task.status === 'in_progress') && (
        <button className="cl-row-menu__item cl-row-menu__item--danger" onClick={() => { handleDelete(task); setMenuOpenId(null); }}>
            {Icons.x} Cancel
        </button>
    )}
    {!isAdmin && (
        <button className="cl-row-menu__item" onClick={() => { setEditingTask(task); setModalOpen(true); setMenuOpenId(null); }}>
            {Icons.fileText} View / Notes
        </button>
    )}
</div>
```

- [ ] **Step 4: Update task title click for non-admins**

The title `link-btn` click should open the modal in view/notes mode for non-admins. The existing `onClick` already opens the modal with `setEditingTask(task)` — the modal itself will handle read-only mode (Task 5).

- [ ] **Step 5: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TasksPage.jsx
git commit -m "feat: hide admin-only task UI for non-admin users"
```

---

### Task 5: Add readOnly mode to TaskModal

**Files:**
- Modify: `client/src/components/tasks/TaskModal.jsx`

- [ ] **Step 1: Accept readOnly prop and add status handlers**

Update the component signature and imports:

```javascript
import { useState } from 'react';
import { createTask, updateTask } from '../../api';
import { useToast } from '../../hooks/useToast';
import Modal from '../common/Modal';

export default function TaskModal({ task, users, onClose, onSaved, readOnly }) {
```

- [ ] **Step 2: Add a notes-only save handler for readOnly mode**

After the existing `handleSubmit`, add:

```javascript
const handleNotesUpdate = async () => {
    if (!task) return;
    setSaving(true);
    try {
        await updateTask(task.id, { notes: form.notes.trim() });
        showToast('Notes updated');
        onSaved();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setSaving(false);
    }
};

const handleStatusAction = async (newStatus) => {
    if (!task) return;
    setSaving(true);
    try {
        await updateTask(task.id, { status: newStatus });
        showToast(`Task marked as ${newStatus === 'in_progress' ? 'In Progress' : 'Completed'}`);
        onSaved();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setSaving(false);
    }
};
```

- [ ] **Step 3: Render read-only view when `readOnly` is true**

Replace the return statement with a conditional:

```javascript
if (readOnly && task) {
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{task.title}</h2>
            <p className="modal__desc">{task.description || 'No description'}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group">
                    <label>Status</label>
                    <div style={{ fontSize: 13, padding: '8px 0' }}>{task.status.replace('_', ' ')}</div>
                </div>
                <div className="form-group">
                    <label>Urgency</label>
                    <div style={{ fontSize: 13, padding: '8px 0' }}>{task.urgency}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group">
                    <label>Due Date</label>
                    <div style={{ fontSize: 13, padding: '8px 0' }}>{fmtDate(task.dueDate)}</div>
                </div>
                <div className="form-group">
                    <label>Assigned To</label>
                    <div style={{ fontSize: 13, padding: '8px 0' }}>{task.assignedToUser?.name || task.assignedToRole || '—'}</div>
                </div>
            </div>

            <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Add notes..." />
            </div>

            <div className="form-actions">
                {task.status === 'open' && (
                    <button type="button" className="btn btn--outline" disabled={saving} onClick={() => handleStatusAction('in_progress')}>
                        Start Task
                    </button>
                )}
                {(task.status === 'open' || task.status === 'in_progress') && (
                    <button type="button" className="btn btn--success" disabled={saving} onClick={() => handleStatusAction('completed')}>
                        Mark Complete
                    </button>
                )}
                <button type="button" className="btn btn--primary" disabled={saving} onClick={handleNotesUpdate}>
                    {saving ? 'Saving...' : 'Save Notes'}
                </button>
            </div>
        </Modal>
    );
}

return (
    <Modal onClose={onClose}>
        {/* ... existing admin form below ... */}
```

Keep the existing admin form as-is (the full `<Modal>` with the form). The `readOnly` branch returns early.

- [ ] **Step 4: Pass readOnly from TasksPage**

In `client/src/pages/TasksPage.jsx`, update the `<TaskModal>` usage to pass `readOnly={!isAdmin}`:

```jsx
{modalOpen && (
    <TaskModal
        task={editingTask}
        users={users}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSaved={handleSaved}
        readOnly={!isAdmin}
    />
)}
```

- [ ] **Step 5: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/tasks/TaskModal.jsx client/src/pages/TasksPage.jsx
git commit -m "feat: add read-only task modal for non-admin users with notes and status actions"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Routes opened to PCA/user (Task 1)
- ✅ Assignment-scoped filtering in listTasks, getTask, getTaskSummary (Task 2)
- ✅ Field restriction + ownership check in updateTask (Task 3)
- ✅ Hide New Task, Settings, bulk actions, assignee filter for non-admins (Task 4)
- ✅ 3-dot menu shows only Start/Complete/View for non-admins (Task 4)
- ✅ Read-only modal with notes editing and status buttons (Task 5)
- ✅ Status transitions restricted: open→in_progress, open→completed, in_progress→completed (Task 3)

**No gaps found.**
