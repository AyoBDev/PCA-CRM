# Edit User + Reuse Office Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to edit an existing user (name, email, role, phone, permission group, optional password + reactivate) so an inactive account's office email can be reused by renaming that account in place.

**Architecture:** One new admin-only `PUT /api/auth/users/:id` endpoint (`updateUser`) in the existing `authController.js`, with an email-uniqueness rule that only conflicts when the email belongs to a *different* user row. Frontend adds an `EditUserModal` on `UsersPage.jsx` built entirely from existing design-system primitives, with mandatory undo/redo wiring. Backend built test-first.

**Tech Stack:** Express + Prisma (PostgreSQL) + bcryptjs on the server; Jest + supertest for tests; React 19 + Vite on the client using the shared `Modal`, `.form-group`/`.btn` classes, and zinc design tokens.

## Global Constraints

- Work happens only in the worktree `worktrees/edit-user-reuse-email` (branch `feat/edit-user-reuse-email`); never modify `main` or the root working tree.
- No AI attribution in any commit message.
- Backend logic is built test-first (write failing test → run → implement → run → commit).
- Frontend must follow the app design system: reuse `Modal`, `.form-group`, `.form-actions`, `.btn`/`.btn--primary`/`.btn--outline`/`.btn--ghost`/`.btn--icon`, `Icons.*`, and zinc tokens (`hsl(var(--...))`). No bespoke styling.
- Every mutation wires `undoState.pushAction(description, undoFn, redoFn)`; `onSave`/handlers must let API errors propagate (never swallow).
- Passwords/hashes are never returned in responses, never logged in audit values.
- Run all backend commands from the `server/` directory. Test run prefix: `TZ=UTC npx jest <file> --verbose`.
- New audit `entityType` is `User` (already registered in `HistoryPage.jsx` `ENTITY_TYPES` — no change needed).

---

### Task 1: Backend `updateUser` endpoint (TDD)

**Files:**
- Modify: `server/src/controllers/authController.js` (add `updateUser`; add to `module.exports` at line 410)
- Modify: `server/src/routes/api.js` (import `updateUser` in the destructure at lines 74–84; add route near line 280)
- Test: `server/src/controllers/__tests__/updateUser.test.js` (create)

**Interfaces:**
- Consumes: existing `prisma` (`server/src/lib/prisma.js`), `bcrypt` (bcryptjs), `audit` (`auditService`: `logAction`, `diffFields`), middleware `requireRole('admin')` + `requirePermission('users')`.
- Produces: `PUT /api/auth/users/:id` accepting JSON `{ name?, email?, role?, phone?, permissionGroupId?, password?, active? }`, returning `{ id, email, name, role, phone, active, permissionGroupId }`. Consumed by the frontend `api.updateUser(id, data)` in Task 2.

- [ ] **Step 1: Write the failing test file**

Create `server/src/controllers/__tests__/updateUser.test.js`. Model the harness on `passwordChangeLogout.test.js` (supertest + real prisma; unique emails; clean up in `afterAll`).

```js
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'updateuser-admin@test.com';
const OFFICE_EMAIL = 'updateuser-office@test.com';
const OTHER_EMAIL = 'updateuser-other@test.com';
const ARCHIVED_EMAIL = 'updateuser-archived@test.com';
const ADMIN_PW = 'secret123';

let adminToken, adminId, officeUser, otherUser, archivedUser;

async function login(email, password) {
    return (await request(app).post('/api/auth/login').send({ email, password })).body.token;
}

beforeEach(async () => {
    const adminHash = await bcrypt.hash(ADMIN_PW, 10);
    const inactiveHash = await bcrypt.hash('oldpass1', 10);
    const admin = await prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: adminHash, name: 'UU Admin', role: 'admin', active: true } });
    adminId = admin.id;
    officeUser = await prisma.user.create({ data: { email: OFFICE_EMAIL, passwordHash: inactiveHash, name: 'Araceli Mongalvo', role: 'user', active: false } });
    otherUser = await prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: inactiveHash, name: 'Other Person', role: 'user', active: true } });
    archivedUser = await prisma.user.create({ data: { email: ARCHIVED_EMAIL, passwordHash: inactiveHash, name: 'Archived Person', role: 'user', active: true, archivedAt: new Date() } });
    adminToken = await login(ADMIN_EMAIL, ADMIN_PW);
});

afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, OFFICE_EMAIL, OTHER_EMAIL, ARCHIVED_EMAIL] } } });
});

const put = (id, body, token = adminToken) =>
    request(app).put(`/api/auth/users/${id}`).set('Authorization', `Bearer ${token}`).send(body);

describe('PUT /api/auth/users/:id', () => {
    test('renames an inactive user, same email, no conflict', async () => {
        const res = await put(officeUser.id, { name: 'New Hire' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Hire');
        expect(res.body.email).toBe(OFFICE_EMAIL);
    });

    test('reactivate + new password in one call lets the new hire log in', async () => {
        const res = await put(officeUser.id, { name: 'New Hire', password: 'brandnew1', active: true });
        expect(res.status).toBe(200);
        expect(res.body.active).toBe(true);
        expect((await login(OFFICE_EMAIL, 'brandnew1'))).toBeTruthy();
        expect((await login(OFFICE_EMAIL, 'oldpass1'))).toBeFalsy();
    });

    test('409 when new email belongs to a different active user', async () => {
        const res = await put(officeUser.id, { email: OTHER_EMAIL });
        expect(res.status).toBe(409);
    });

    test('409 when new email belongs to a different archived user', async () => {
        const res = await put(officeUser.id, { email: ARCHIVED_EMAIL });
        expect(res.status).toBe(409);
    });

    test('allows setting email to the user own current email (no-op)', async () => {
        const res = await put(officeUser.id, { email: OFFICE_EMAIL.toUpperCase() });
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(OFFICE_EMAIL);
    });

    test('role change bumps permissionsVersion (forces re-login)', async () => {
        const before = await prisma.user.findUnique({ where: { id: officeUser.id } });
        await put(officeUser.id, { role: 'pca' });
        const after = await prisma.user.findUnique({ where: { id: officeUser.id } });
        expect(after.permissionsVersion).toBe(before.permissionsVersion + 1);
    });

    test('self-guard: admin cannot change own role or active, but can change own name', async () => {
        expect((await put(adminId, { role: 'user' })).status).toBe(400);
        expect((await put(adminId, { active: false })).status).toBe(400);
        expect((await put(adminId, { name: 'Renamed Admin' })).status).toBe(200);
    });

    test('writes an UPDATE audit row with no plaintext password', async () => {
        await put(officeUser.id, { name: 'Audited Hire', password: 'brandnew1' });
        const log = await prisma.auditLog.findFirst({
            where: { entityType: 'User', entityId: officeUser.id, action: 'UPDATE' },
            orderBy: { createdAt: 'desc' },
        });
        expect(log).toBeTruthy();
        expect(JSON.stringify(log)).not.toContain('brandnew1');
    });

    test('403 for a non-admin caller', async () => {
        const pcaHash = await bcrypt.hash('pcapass1', 10);
        const pca = await prisma.user.create({ data: { email: 'uu-pca@test.com', passwordHash: pcaHash, name: 'PCA', role: 'pca', active: true } });
        const pcaToken = await login('uu-pca@test.com', 'pcapass1');
        const res = await put(officeUser.id, { name: 'Nope' }, pcaToken);
        expect(res.status).toBe(403);
        await prisma.user.delete({ where: { id: pca.id } });
    });
});
```

> Note: verify the AuditLog model accessor name during Step 2 — if `prisma.auditLog` is wrong, grep `server/prisma/schema.prisma` for the audit model's `@@map`/name and adjust the two audit-assertion lines. Also confirm the audit-log timestamp field is `createdAt`; if the model uses a different name, fix the `orderBy`.

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `TZ=UTC npx jest src/controllers/__tests__/updateUser.test.js --verbose`
Expected: FAIL — the route returns 404 (no `PUT /api/auth/users/:id` yet), so most assertions fail.

- [ ] **Step 3: Implement `updateUser` in `authController.js`**

Add this function above the `module.exports` line (line 410):

```js
// PUT /api/auth/users/:id  (admin only — edit user fields, optional password/reactivate)
async function updateUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { name, email, role, phone, permissionGroupId, password, active } = req.body;
        const isSelf = id === req.user.id;

        // Self-guard: an admin cannot demote or deactivate their own account here.
        if (isSelf && role !== undefined && role !== user.role) {
            return res.status(400).json({ error: 'You cannot change your own role' });
        }
        if (isSelf && active !== undefined && active !== user.active) {
            return res.status(400).json({ error: 'You cannot change your own active status' });
        }

        const data = {};

        if (name !== undefined) {
            if (!String(name).trim()) return res.status(400).json({ error: 'Name is required' });
            data.name = String(name).trim();
        }

        if (email !== undefined) {
            const normalized = String(email).toLowerCase().trim();
            if (!normalized) return res.status(400).json({ error: 'Email is required' });
            const existing = await prisma.user.findUnique({ where: { email: normalized } });
            if (existing && existing.id !== id) {
                return res.status(409).json({ error: 'A user with this email already exists' });
            }
            data.email = normalized;
        }

        let validRole = user.role;
        if (role !== undefined) {
            validRole = ['admin', 'user', 'pca'].includes(role) ? role : user.role;
            data.role = validRole;
        }

        // Permission group only applies to the 'user' role; validate when provided, clear otherwise.
        if (validRole !== 'user') {
            data.permissionGroupId = null;
        } else if (permissionGroupId !== undefined) {
            if (Number.isInteger(permissionGroupId)) {
                const group = await prisma.permissionGroup.findUnique({ where: { id: permissionGroupId } });
                if (!group || group.archivedAt) return res.status(400).json({ error: 'Invalid permission group' });
                data.permissionGroupId = permissionGroupId;
            } else {
                data.permissionGroupId = null;
            }
        }

        if (phone !== undefined) data.phone = String(phone || '').trim();
        if (active !== undefined) data.active = !!active;

        let passwordChanged = false;
        if (password !== undefined && password !== '') {
            if (String(password).length < 4) {
                return res.status(400).json({ error: 'Password must be at least 4 characters' });
            }
            data.passwordHash = await bcrypt.hash(String(password), 10);
            passwordChanged = true;
        }

        // Bump permissionsVersion on any security-affecting change so existing tokens are rejected.
        const roleChanged = data.role !== undefined && data.role !== user.role;
        const groupChanged = data.permissionGroupId !== undefined && data.permissionGroupId !== user.permissionGroupId;
        if (passwordChanged || roleChanged || groupChanged) {
            data.permissionsVersion = { increment: 1 };
        }

        const updated = await prisma.user.update({ where: { id }, data });

        res.json({
            id: updated.id, email: updated.email, name: updated.name,
            role: updated.role, phone: updated.phone, active: updated.active,
            permissionGroupId: updated.permissionGroupId,
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'User', entityId: id, entityName: updated.name,
            changes: audit.diffFields(user, updated, ['name', 'email', 'role', 'phone', 'permissionGroupId', 'active']),
            metadata: passwordChanged ? { passwordChanged: true } : undefined,
        });
    } catch (err) { next(err); }
}
```

Then add `updateUser` to the exports at line 410:
```js
module.exports = { login, employeeLogin, getMe, register, listUsers, deleteUser, restoreUser, resetPassword, permanentlyDeleteUser, bulkPermanentlyDeleteUsers, forgotPassword, resetPasswordWithToken, toggleUserActive, updateUser };
```

- [ ] **Step 4: Wire the route in `api.js`**

Add `updateUser` to the `authController` destructure (lines 74–84, alongside `toggleUserActive`):
```js
    toggleUserActive,
    updateUser,
} = require('../controllers/authController');
```

Add the route immediately after the `toggle-active` route (line 280). Order matters: it must come **after** the more specific `/auth/users/:id/...` routes but the bare `:id` PUT does not collide with them, so placing it here is safe:
```js
router.put('/auth/users/:id', requireRole('admin'), requirePermission('users'), updateUser);
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `server/`): `TZ=UTC npx jest src/controllers/__tests__/updateUser.test.js --verbose`
Expected: PASS — all cases green. If the audit-model accessor differed, fix per the Step 1 note and re-run.

- [ ] **Step 6: Run the broader auth suite to check for regressions**

Run (from `server/`): `TZ=UTC npx jest src/controllers/__tests__/passwordChangeLogout.test.js src/controllers/__tests__/updateUser.test.js --verbose`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/authController.js server/src/routes/api.js server/src/controllers/__tests__/updateUser.test.js
git commit -m "feat(users): add PUT /auth/users/:id to edit users and reuse inactive emails"
```

---

### Task 2: Frontend `api.updateUser` + Edit modal + undo wiring

**Files:**
- Modify: `client/src/api.js` (add `updateUser` after `toggleUserActive`, ~line 126)
- Modify: `client/src/pages/UsersPage.jsx` (add Edit button, `EditUserModal`, `editUser` state, `handleEditUser`)

**Interfaces:**
- Consumes: `PUT /api/auth/users/:id` from Task 1; existing `Modal`, `Icons.edit`/`Icons.eye`/`Icons.eyeOff`, `useUndoStack`, `useToast`, `permissionGroups` state already loaded in `UsersPage`.
- Produces: an in-app Edit User dialog on the Users page.

- [ ] **Step 1: Add the API helper**

In `client/src/api.js`, after the `toggleUserActive` export (~line 126):
```js
export const updateUser = (id, data) =>
    request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
```

- [ ] **Step 2: Add edit state to `UsersPage`**

Near the other `useState` declarations (after line 30, and before any early return — none exist here, but keep it with the rest):
```jsx
    const [editUser, setEditUser] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [showEditPassword, setShowEditPassword] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
```

Add an effect that seeds the edit form when a user is chosen (place beside the other effects):
```jsx
    useEffect(() => {
        if (!editUser) { setEditForm(null); return; }
        setEditForm({
            name: editUser.name || '',
            email: editUser.email || '',
            role: editUser.role,
            phone: editUser.phone || '',
            permissionGroupId: editUser.permissionGroupId ?? null,
            password: '',
            reactivate: false,
        });
        setShowEditPassword(false);
    }, [editUser]);
```

- [ ] **Step 3: Add the `handleEditUser` save handler with undo/redo**

Add near `handleToggleActive` (~line 129):
```jsx
    const handleEditUser = async (e) => {
        e.preventDefault();
        if (!editForm?.name || !editForm?.email) return;
        setSavingEdit(true);
        const prev = {
            name: editUser.name, email: editUser.email, role: editUser.role,
            phone: editUser.phone || '', permissionGroupId: editUser.permissionGroupId ?? null,
            active: editUser.active,
        };
        const payload = {
            name: editForm.name.trim(),
            email: editForm.email.trim(),
            role: editForm.role,
            phone: editForm.phone.trim(),
            permissionGroupId: editForm.role === 'user' ? editForm.permissionGroupId : null,
        };
        if (editForm.password) payload.password = editForm.password;
        if (!editUser.active && editForm.reactivate) payload.active = true;
        try {
            await api.updateUser(editUser.id, payload);
            showToast('User updated');
            const id = editUser.id;
            setEditUser(null);
            fetchUsers();
            undoState.pushAction(`Edited user "${payload.name}"`,
                async () => { await api.updateUser(id, prev); fetchUsers(); },
                async () => { await api.updateUser(id, payload); fetchUsers(); }
            );
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSavingEdit(false); }
    };
```

- [ ] **Step 4: Add the Edit button to the active-row actions**

In the non-archived actions cell (~line 230, inside the `<div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>`), add as the **first** button:
```jsx
                                                    <button className="btn btn--ghost btn--icon" title="Edit user" onClick={() => setEditUser(u)}>
                                                        {Icons.edit}
                                                    </button>
```

- [ ] **Step 5: Add the `EditUserModal` JSX**

Add after the Create-User `{showModal && (...)}` block (~line 291), matching that modal's structure and classes exactly:
```jsx
            {editUser && editForm && (
                <Modal onClose={() => setEditUser(null)}>
                    <h2 className="modal__title">Edit User</h2>
                    <p className="modal__desc">Update account details for <strong>{editUser.name}</strong>.</p>
                    <form onSubmit={handleEditUser}>
                        <div className="form-group"><label>Name</label><input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Full name" required /></div>
                        <div className="form-group"><label>Email</label><input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="user@example.com" required /></div>
                        <div className="form-group">
                            <label>Role</label>
                            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                                <option value="pca">PCA (Caregiver)</option>
                                <option value="user">User (Staff)</option>
                            </select>
                        </div>
                        {editForm.role === 'user' && (
                            <div className="form-group">
                                <label className="form-label">Permission Group</label>
                                <select
                                    className="form-input"
                                    value={editForm.permissionGroupId ?? ''}
                                    onChange={(e) => setEditForm({ ...editForm, permissionGroupId: e.target.value === '' ? null : parseInt(e.target.value) })}
                                >
                                    <option value="">No restrictions</option>
                                    {permissionGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="form-group"><label>Phone</label><input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Optional" /></div>
                        <div className="form-group">
                            <label>New Password <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>(leave blank to keep current)</span></label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showEditPassword ? 'text' : 'password'}
                                    value={editForm.password}
                                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                    placeholder="Minimum 4 characters"
                                    minLength={4}
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowEditPassword(v => !v)}
                                    title={showEditPassword ? 'Hide password' : 'Show password'}
                                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'hsl(var(--muted-foreground))' }}
                                >
                                    {showEditPassword ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                            {editForm.password.length > 0 && editForm.password.length < 4 && (
                                <p style={{ color: 'hsl(var(--destructive))', fontSize: 12, margin: '4px 0 0' }}>Password must be at least 4 characters</p>
                            )}
                        </div>
                        {!editUser.active && (
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input id="edit-reactivate" type="checkbox" checked={editForm.reactivate} onChange={(e) => setEditForm({ ...editForm, reactivate: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
                                <label htmlFor="edit-reactivate" style={{ margin: 0 }}>Reactivate this account (allow login)</label>
                            </div>
                        )}
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setEditUser(null)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={savingEdit || !editForm.name || !editForm.email || (editForm.password.length > 0 && editForm.password.length < 4)}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </form>
                </Modal>
            )}
```

- [ ] **Step 6: Build the client to verify it compiles**

Run (from `client/`): `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/api.js client/src/pages/UsersPage.jsx
git commit -m "feat(users): edit user modal with password reset, reactivate, and undo"
```

---

### Task 3: Manual verification + DECISIONS.md entry

**Files:**
- Modify: `DECISIONS.md` (append build-vs-adopt entry) — force-add if `docs`/root ignore rules apply (they don't for `DECISIONS.md`; it's tracked).

- [ ] **Step 1: Run the app and verify the full handover flow**

Start server (`cd server && npm run dev`) and client (`cd client && npm run dev`), log in as admin, go to Users.
Verify, in order:
1. An inactive user shows an **Edit** (pencil) button. Click it → modal prefilled.
2. Change the name, leave email unchanged, set a new password, check **Reactivate** → Save → toast "User updated"; the row shows the new name and **Active**.
3. Log out and log in with the office email + new password → succeeds.
4. Edit again and set the email to another existing user's email → Save → error toast "A user with this email already exists" (no change persisted).
5. After a successful edit, the **Undo** button in the GlobalToolbar is enabled; click it → the name/role/phone/active revert in the UI and (refresh to confirm) in the DB; **Redo** re-applies.
6. Open the **Activity** drawer → the `UPDATE` entry for this user appears.

Record the outcome of each check. If any fails, fix before proceeding (do not mark the feature done on a disabled/no-op Undo).

- [ ] **Step 2: Append the build-vs-adopt entry to `DECISIONS.md`**

Add at the top of the entries (match the file's existing format):
```markdown
## 2026-08-25 — Edit User + reuse office email on inactive account
- **Options considered:** (a) build in-house edit endpoint + modal; (b) adopt an off-the-shelf admin/user-management library (e.g. AdminJS, react-admin).
- **Choice:** Build in-house.
- **Why:** User accounts here are a bespoke domain (custom roles, permission groups, PHI-adjacent audit logging, JWT `permissionsVersion` session invalidation) tightly coupled to existing Express/Prisma controllers. An off-the-shelf admin panel would duplicate auth, fight our schema, and add a heavy dependency for a single dialog + one endpoint. The edit path reuses existing `Modal`/design-system primitives and the established audit + undo patterns.
```

- [ ] **Step 3: Commit**

```bash
git add DECISIONS.md
git commit -m "docs(decisions): record build-vs-adopt for edit-user feature"
```

---

## Self-Review

**Spec coverage:**
- Endpoint + email-uniqueness rule → Task 1 (impl + tests 1,3,4,5). ✓
- Role validation / permission group / self-guard / permissionsVersion bump / audit → Task 1 (impl + tests 6,7,8). ✓
- `api.updateUser` helper → Task 2 Step 1. ✓
- EditUserModal on design system (Modal, form classes, show/hide password, reactivate checkbox) → Task 2 Steps 5. ✓
- Mandatory undo/redo → Task 2 Step 3 (`undoState.pushAction`). ✓
- Backend TDD → Task 1 written test-first. ✓
- Manual verification checklist → Task 3 Step 1. ✓
- DECISIONS.md entry → Task 3 Step 2. ✓
- No migration → none present. ✓

**Placeholder scan:** No TBD/TODO; all code blocks concrete. The one conditional ("verify audit model accessor") is a named verification with a fallback, not a placeholder. ✓

**Type consistency:** `updateUser(id, data)` payload keys (`name,email,role,phone,permissionGroupId,password,active`) match between server handler, api helper, and `handleEditUser` payload. Undo `prev` uses the same keys the server accepts. Response shape (`id,email,name,role,phone,active,permissionGroupId`) matches what `fetchUsers`/rows already consume. ✓
