# PCA Task Access — Design Spec

## Overview

Allow non-admin users (PCAs) to view and manage tasks assigned to them. PCAs can see their assigned tasks, update status (start, complete), and add notes. They cannot create, delete, reassign, or edit other task fields.

## Decisions

- **Scope:** PCAs see only tasks assigned to them (by userId or by role)
- **Allowed actions:** View, change status (open→in_progress, in_progress→completed), add/edit notes
- **Restricted actions:** Create tasks, cancel/delete tasks, edit title/description/urgency/dueDate/assignment, bulk actions, workflow trigger settings
- **No new pages or components** — reuses existing TasksPage with role-based visibility

## Backend Changes

### Route Access (`server/src/routes/api.js`)

Open to all authenticated staff:
- `GET /tasks` → `requireRole('admin', 'user', 'pca')`
- `GET /tasks/:id` → `requireRole('admin', 'user', 'pca')`
- `PATCH /tasks/:id` → `requireRole('admin', 'user', 'pca')`
- `GET /tasks/summary` → `requireRole('admin', 'user', 'pca')`

Keep admin-only:
- `POST /tasks` → `requireRole('admin')`
- `DELETE /tasks/:id` → `requireRole('admin')`
- `PATCH /tasks/bulk-update` → `requireRole('admin')`
- `GET /workflow-triggers` → `requireRole('admin')`
- `PATCH /workflow-triggers/:id` → `requireRole('admin')`

### Controller Filtering (`server/src/controllers/taskController.js`)

**`listTasks`:** If `req.user.role !== 'admin'`, add a WHERE clause:
```
OR: [
  { assignedToUserId: req.user.id },
  { assignedToRole: req.user.role }
]
```
This scopes the query so PCAs only see tasks assigned to them specifically or to their role.

**`getTask`:** If not admin, verify the task is assigned to the requesting user (by userId or role). Return 403 if not.

**`updateTask`:** If not admin, enforce:
1. Task must be assigned to the user (by userId or role)
2. Only `status` and `notes` fields are accepted — silently ignore or reject other fields
3. Status transitions limited to: `open` → `in_progress`, `in_progress` → `completed`, `open` → `completed`

**`getTaskSummary`:** If not admin, apply the same assignment filter to all count queries.

### Ownership Check Helper

Add a reusable function in the controller:
```javascript
function isTaskAssignedToUser(task, user) {
    return task.assignedToUserId === user.id || task.assignedToRole === user.role;
}
```

## Frontend Changes

### TasksPage (`client/src/pages/TasksPage.jsx`)

Use `useAuth()` to get `isAdmin`. Conditionally render:

- **Hide if not admin:**
  - "New Task" button
  - "Settings" button
  - Bulk action checkboxes and the select-all column
  - Filter by "Assigned To" (PCAs only see their own anyway)

- **3-dot menu (non-admin):**
  - Show: "Start" (if status is open), "Complete" (if open or in_progress)
  - Hide: "Edit", "Cancel"

- **3-dot menu (admin):**
  - Unchanged — shows all options

- **Task title click:** For non-admin, either open a read-only detail view or a simplified modal that only shows notes editing. Simplest approach: open the TaskModal but with fields disabled except notes, and hide the full form — just show task details + editable notes field + status buttons.

### TaskModal (`client/src/components/tasks/TaskModal.jsx`)

Add `readOnly` prop behavior:
- If `readOnly` (non-admin viewing): show all fields as read-only text (not inputs), except notes which remains editable. Show status action buttons (Start/Complete) at the bottom instead of the full form submit.
- If not `readOnly` (admin): unchanged behavior.

## File Changes Summary

| File | Change |
|------|--------|
| `server/src/routes/api.js` | Update requireRole on 4 task routes |
| `server/src/controllers/taskController.js` | Add assignment filtering in listTasks, getTask, updateTask, getTaskSummary |
| `client/src/pages/TasksPage.jsx` | Add isAdmin checks to hide admin-only UI |
| `client/src/components/tasks/TaskModal.jsx` | Add readOnly mode for non-admins |

## Out of Scope

- PCA creating tasks
- PCA cancelling/deleting tasks
- PCA reassigning tasks
- PCA editing workflow triggers
- Notification preferences per user
