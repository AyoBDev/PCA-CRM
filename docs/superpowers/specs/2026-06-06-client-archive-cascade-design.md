# Client Archive & Deactivate Cascade

## Goal

When a client is archived or deactivated, cascade the effect across all related entities (authorizations, shifts, timesheets, permanent links). Provide archive actions on both the client list page and client detail page, with confirmation modals and undo toasts.

## Architecture

Two distinct operations with different cascade depths:

1. **Archive** (soft-delete → trash drawer): full cascade, client disappears from all active views
2. **Deactivate** (status change → inactive/discharged/transferred): partial cascade, client remains visible but can't have new work created

Both operations are reversible: archive via trash drawer restore, deactivate via "Activate" status change.

---

## Backend: Archive Cascade

### `DELETE /api/clients/:id` (existing endpoint, enhanced)

When archiving a client (`archivedAt = now()`), cascade to:

| Entity | Action |
|--------|--------|
| Shifts | Set `archivedAt = now()` on all non-archived shifts |
| Timesheets | Set `archivedAt = now()` on all non-archived timesheets |
| Authorizations | Set `archivedAt = now()` on all non-archived authorizations |
| PermanentLinks | Set `archivedAt = now()` on all non-archived permanent links |

### `POST /api/clients/bulk-delete` (existing endpoint, enhanced)

Same cascade as single archive, applied to all IDs in the batch.

### `PUT /api/clients/:id/restore` (existing endpoint, enhanced)

Reverse all cascaded archives:

| Entity | Action |
|--------|--------|
| Shifts | Set `archivedAt = null` on shifts archived at the same time as client |
| Timesheets | Set `archivedAt = null` on timesheets archived at the same time as client |
| Authorizations | Set `archivedAt = null` on authorizations archived at the same time as client |
| PermanentLinks | Set `archivedAt = null` on permanent links archived at the same time as client |

Note: Use the client's `archivedAt` timestamp to identify which related records were archived as part of this cascade (vs. individually archived earlier). On restore, only restore records whose `archivedAt` matches the client's archived timestamp.

### `POST /api/clients/bulk-restore` (existing endpoint, enhanced)

Same restore cascade for each client in the batch.

---

## Backend: Deactivate Cascade

### `PATCH /api/clients/:id` when `clientStatus` changes to `inactive`/`discharged`/`transferred`

| Entity | Action |
|--------|--------|
| Authorizations | Set `manualStatus = 'inactive'` on all active authorizations |
| Shifts (future) | Set `archivedAt = now()` on shifts with `shiftDate > today` |

### `PATCH /api/clients/:id` when `clientStatus` changes back to `active`

| Entity | Action |
|--------|--------|
| Authorizations | Set `manualStatus = 'active'` on authorizations that were auto-deactivated |

Future shifts are NOT restored (user recreates schedule manually if needed).

---

## Frontend: Client List Page

### Per-row archive button
- Add a trash icon button on each client row (same pattern as employees page)
- Click shows a confirmation modal: "Archive [Client Name]? This will hide them from scheduling, timesheets, and authorizations."
- On confirm: call `DELETE /api/clients/:id`, refresh list, show undo toast
- Undo toast: "Archived [Client Name]" with "Undo" button that calls restore endpoint

### Bulk archive
- Add "Archive" option to the bulk actions dropdown
- Shows confirmation modal: "Archive [N] clients? This will hide them from scheduling, timesheets, and authorizations."
- On confirm: call `POST /api/clients/bulk-delete`, refresh list, show undo toast
- Undo toast: "Archived [N] client(s)" with "Undo" button that calls bulk restore

---

## Frontend: Client Detail Page

### Archive button in header
- Add "Archive Client" button (trash icon + text) in the page header actions area
- Click shows confirmation modal: "Archive [Client Name]? This will hide them from scheduling, timesheets, and authorizations. You can restore them from the trash."
- On confirm: call `DELETE /api/clients/:id`, navigate back to client list, show undo toast
- Undo toast: "Archived [Client Name]" with "Undo" button that restores and navigates back to detail

---

## Filtering: Pages That Exclude Archived Clients

### Authorization Page
- Already filters by `archivedAt: null` in the `getClients` query — archived clients won't appear. No change needed if the query already does this; verify.

### Scheduling Page
- Client dropdown for shift creation/editing: exclude clients where `archivedAt` is not null
- Existing shifts for archived clients should already be archived by the cascade

### PCA Form (`/pca-form/:token`)
- When loading a permanent link, if the link's `archivedAt` is set OR the linked client's `archivedAt` is set, return an error message: "This timesheet link is no longer active."

### Timesheet Creation
- Can't create new timesheets for archived clients (the permanent link will be deactivated)

---

## Confirmation Modal Pattern

Reuse the existing `ConfirmModal` component. Content:

**Single archive:**
> Archive [Client Name]?
>
> This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.

**Bulk archive:**
> Archive [N] clients?
>
> This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.

---

## Undo Toast Pattern

Follow the existing pattern used by Deactivate/Discharge/Transfer actions:
- Toast appears with message + "Undo" button
- Undo calls restore endpoint, re-fetches client list
- Toast auto-dismisses after 5 seconds (longer than standard 3s to give time to click undo)

---

## Scope Exclusions

- No "permanent delete" cascade changes needed (already handled by Prisma cascade deletes on FK relationships)
- No changes to payroll (payroll matches by name string, not FK — archived clients' historical visits remain)
- No email/notification sent on archive (silent operation)
