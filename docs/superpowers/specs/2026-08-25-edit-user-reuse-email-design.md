# Edit User + Reuse Office Email on Inactive Account — Design

**Date:** 2026-08-25
**Status:** Approved (design), pending implementation plan

## Problem

The User module (`UsersPage.jsx` + `authController.js`) supports create, archive/restore,
reset-password, toggle-active, and permanent-delete — but there is **no way to edit an
existing user's name, email, role, phone, or permission group**.

The concrete need: an office position (e.g. `office.nevadabestpca@gmail.com`) is currently
held by an **inactive** user, Araceli Mongalvo. A new hire takes over the same position and
must reuse the same office email. Creating a new user fails with
`409 "A user with this email already exists"` because `User.email` is `@unique` and
Araceli's row still holds the address (inactive keeps the row; archived does too).

## Chosen approach: rename the account in place

Rather than freeing the email and creating a second row, the admin **edits Araceli's existing
(inactive) row**: change the name to the new hire, keep the same email, set a new password, and
reactivate — all in one dialog. One row, email stays unique, the unique-constraint conflict
never arises. History (audit log) stays attached to that account row.

This is delivered by adding a general **Edit User** capability, which also covers ordinary
edits (typo fixes, role changes, phone updates) — the reuse-email case is solved for free by it.

## Backend

### New endpoint: `PUT /api/auth/users/:id`
- Route in `server/src/routes/api.js`, guarded `requireRole('admin')` + `requirePermission('users')`
  (same guard as the other `/auth/users/:id` mutations).
- New `updateUser` handler in `server/src/controllers/authController.js`.

Accepts a partial body; any subset of:
`name`, `email`, `role`, `phone`, `permissionGroupId`, `password`, `active`.

**Behavior:**
1. **Load target** by `id`; `404` if not found.
2. **Email uniqueness (the core rule):** if `email` is provided, normalize
   (`toLowerCase().trim()`), then `findUnique` on it. If a row is found whose `id` is
   **different** from the target, return `409 "A user with this email already exists"`.
   If the email is unchanged, or resolves to the **same** target row, allow it — this is
   what makes reusing Araceli's own email on her own row safe (active OR archived, no
   difference: it's the same row).
3. **Role validation:** reuse the `['admin','user','pca']` guard from `register`; when the
   resulting role is `user` and `permissionGroupId` is an integer, validate the group exists
   and isn't archived (mirrors `register`). When role is not `user`, force
   `permissionGroupId` to `null`.
4. **Password:** if `password` provided (non-empty, min length 4), `bcrypt.hash` and update
   `passwordHash`.
5. **Force re-login on security change:** if `password` OR `role` OR `permissionGroupId`
   changes, bump `permissionsVersion` (`{ increment: 1 }`) so existing sessions for that user
   are invalidated — consistent with the existing reset-password / permission-change behavior
   (see `passwordChangeLogout.test.js`). (Confirm during implementation that reset-password
   currently bumps this; match whatever mechanism it uses.)
6. **Self-guard:** if `id === req.user.id`, reject changes to `role` or `active`
   (an admin must not demote or deactivate their own account through this endpoint), mirroring
   the self-guards on `deleteUser` / `toggleUserActive`. Editing one's own name/phone/email is
   allowed.
7. **Audit:** `audit.logAction(... action:'UPDATE', entityType:'User', entityId:id ...)` with
   `audit.diffFields(oldUser, newUser, ['name','email','role','phone','permissionGroupId','active'])`.
   Password change is recorded as a boolean flag in `metadata` (e.g. `{ passwordChanged: true }`),
   **never** the value or hash.
8. **Response:** return the safe public shape used elsewhere
   (`{ id, email, name, role, phone, active, permissionGroupId }`) — never `passwordHash`.

### API client helper
`client/src/api.js`:
```js
export const updateUser = (id, data) =>
    request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
```

## Frontend (must follow the app design system)

All UI reuses existing primitives and zinc design tokens — no bespoke styling. Match the
existing Create-User and Reset-Password modals in `UsersPage.jsx`.

### Edit action on each row
In the active-view actions cell of the users table, add an **Edit** icon button *before*
the existing activate / reset-password / archive buttons:
```jsx
<button className="btn btn--ghost btn--icon" title="Edit user" onClick={() => setEditUser(u)}>
  {Icons.edit}
</button>
```

### `EditUserModal`
Rendered with the shared `Modal` component (same as Create User). Prefilled from the row.

Fields (reusing `.form-group` / `.form-actions` / `.btn` classes exactly as the Create modal does):
- **Name** — text, required.
- **Email** — email, required. (Editable per decision; uniqueness enforced server-side.)
- **Role** — select: `PCA (Caregiver)` / `User (Staff)`. (Admin rows are excluded from the
  table already, so admin isn't offered.)
- **Permission Group** — select, shown only when role = `user` (same conditional as Create).
- **Phone** — text, optional.
- **Set new password** — optional. A collapsible field (blank = leave password unchanged),
  reusing the exact show/hide-password affordance from the Reset-Password modal
  (`showNewPassword` toggle + `Icons.eye`/`Icons.eyeOff`). Min length 4 when non-empty.
- **Reactivate account** — a checkbox shown only when the edited user is currently inactive
  (`!u.active`); checking it sends `active: true`. This makes the rename → new password →
  reactivate handover a single save.

Actions row: `Cancel` (`btn btn--outline`) + `Save Changes` (`btn btn--primary`, disabled
while saving or when required fields are empty / password is 1–3 chars).

### Save handler + mandatory undo/redo
`handleEditUser` in `UsersPage.jsx`:
1. **Snapshot** the old editable fields before the call:
   `const prev = { name, email, role, phone, permissionGroupId, active }` from the row.
2. Build the changed payload; `await api.updateUser(editUser.id, payload)`.
3. On success: success toast (`"User updated"`), close modal, `fetchUsers()`.
4. **`undoState.pushAction`** (required by the command-bar rule):
   - `undoFn`: `await api.updateUser(id, prev); fetchUsers();` (reverts every changed field).
     Note: password is intentionally **not** captured in the snapshot (we can't read the old
     hash); undo restores name/email/role/phone/permission/active but leaves the password as
     last set. The undo description makes this scope clear.
   - `redoFn`: `await api.updateUser(id, payload); fetchUsers();`
5. Let API errors propagate to the existing `catch (err) => showToast(err.message, 'error')`
   (so the `409` shows its message). Do not swallow.

## Data model

No migration. All fields (`name`, `email`, `role`, `phone`, `permissionGroupId`, `active`,
`permissionsVersion`, `passwordHash`) already exist on `User`.

## Testing (backend TDD — write failing tests first)

New `server/src/controllers/__tests__/updateUser.test.js` (supertest + real prisma, matching
the existing harness in that dir). Cases:
1. **Rename inactive user, same email** → `200`, name updated, email unchanged, no conflict.
2. **Reactivate + new password in same call** → `200`, `active` true, login with new password
   succeeds, login with old password fails.
3. **Email collision with a different user** (active target) → `409`.
4. **Email collision with a different *archived* user** → `409` (archived still holds the email).
5. **Same-email no-op** (email equals the user's own current email) → `200`, allowed.
6. **Role/permission change bumps `permissionsVersion`** → old token is rejected (forces re-login).
7. **Self-guard** → admin editing own row cannot set `role`/`active` (`400`), but can change
   own name/phone.
8. **Audit** → an `UPDATE`/`User` audit row is written with field diffs and no plaintext
   password/hash.
9. **Non-admin / missing `users` permission** → `403`.

## Manual verification (before "done")

Per the mandatory command-bar checklist, in the running app:
- Edit an inactive user → rename + reactivate + new password → save → they can log in; email
  unchanged and no `409`.
- Trigger `409` by trying to set an email that belongs to a different user.
- Undo enables after save and reverts the rename in UI **and** DB; Redo re-applies.
- Activity drawer for `User` shows the `UPDATE` entry.

## Out of scope (YAGNI)

- No separate "free the email / park old row" flow (rename-in-place chosen).
- No bulk edit.
- No changes to the admin's own-account management beyond the self-guard.

## Workflow note

All work happens in a git worktree `worktrees/edit-user-reuse-email` (branch of the same
name); the main branch and root working tree are not modified. `DECISIONS.md` gets a
build-vs-adopt entry (this is core in-app account management — built in-house, no external
library applies).
