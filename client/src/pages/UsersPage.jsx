import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';

export default function UsersPage() {
    const { isAdmin } = useAuth();
    const { showToast } = useToast();
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pca' });
    const [saving, setSaving] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [resetUser, setResetUser] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(null);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(null);
    const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);

    const fetchUsers = useCallback(async () => {
        try { setUsers(await api.getUsers({ archived: showArchived })); } catch (err) { showToast(err.message, 'error'); }
    }, [showToast, showArchived]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name || !form.email || !form.password) return;
        setSaving(true);
        try {
            await api.registerUser(form);
            showToast('User created');
            setShowModal(false);
            setForm({ name: '', email: '', password: '', role: 'pca' });
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (user) => {
        try {
            await api.deleteUser(user.id);
            setConfirmArchive(null);
            showToast(`"${user.name}" archived`);
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestore = async (user) => {
        try {
            await api.restoreUser(user.id);
            showToast(`"${user.name}" restored`);
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (user) => {
        try {
            await api.permanentlyDeleteUser(user.id);
            setConfirmPermanentDelete(null);
            showToast('Item permanently deleted');
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeleteUsers();
            setConfirmBulkPermanentDelete(false);
            showToast(`${result.count} archived user(s) permanently deleted`);
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 4) return;
        setResetting(true);
        try {
            await api.resetUserPassword(resetUser.id, newPassword);
            showToast(`Password reset for "${resetUser.name}"`);
            setResetUser(null);
            setNewPassword('');
            setShowNewPassword(false);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setResetting(false); }
    };

    const handleToggleActive = async (user) => {
        try {
            await api.toggleUserActive(user.id);
            showToast(user.active ? `"${user.name}" deactivated` : `"${user.name}" activated`);
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">User Management</h1>
                <div className="content-header__actions">
                    {isAdmin && <ActivityButton entityType="User" />}
                    {!showArchived && (
                        <button className="archive-toggle" onClick={() => setShowArchived(true)}>
                            {Icons.archive} View Archived
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary btn--sm" onClick={() => setShowModal(true)}>{Icons.plus} Add User</button>
                    )}
                </div>
            </div>
            <div className="page-content">
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived users. Click "Restore" to bring items back.</span>
                        {users.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirmBulkPermanentDelete(true)}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}
                {users.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.users}</div>
                        <div className="empty-state__title">{showArchived ? 'No archived users' : 'No users yet'}</div>
                        <div className="empty-state__desc">{showArchived ? 'Archived users will appear here.' : 'Click "Add User" to create a staff or PCA account.'}</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td style={{ fontWeight: 500 }}>{u.name}</td>
                                        <td>{u.email}</td>
                                        <td><span className={`ts-badge ts-badge--${u.role === 'admin' ? 'submitted' : 'draft'}`}>{u.role}</span></td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${u.active ? 'submitted' : 'draft'}`}>
                                                {u.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            {showArchived ? (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn--restore" onClick={() => handleRestore(u)}>
                                                        {Icons.rotateCcw} Restore
                                                    </button>
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmPermanentDelete(u)} title="Delete permanently">{Icons.trash}</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    <button
                                                        className="btn btn--ghost btn--icon"
                                                        title={u.active ? 'Deactivate user' : 'Activate user'}
                                                        onClick={() => handleToggleActive(u)}
                                                    >
                                                        {u.active ? Icons.shieldCheck : Icons.checkCircle}
                                                    </button>
                                                    <button className="btn btn--ghost btn--icon" title="Reset password" onClick={() => { setResetUser(u); setNewPassword(''); setShowNewPassword(false); }}>
                                                        {Icons.key}
                                                    </button>
                                                    <button className="btn btn--danger-ghost btn--icon" title="Archive user" onClick={() => setConfirmArchive(u)}>
                                                        {Icons.trash}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {showModal && (
                <Modal onClose={() => setShowModal(false)}>
                    <h2 className="modal__title">Create User</h2>
                    <p className="modal__desc">Add a new staff or caregiver account.</p>
                    <form onSubmit={handleCreate}>
                        <div className="form-group"><label>Name</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required /></div>
                        <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" required /></div>
                        <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 4 characters" required minLength={4} /></div>
                        <div className="form-group">
                            <label>Role</label>
                            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                                <option value="pca">PCA (Caregiver)</option>
                                <option value="user">User (Staff)</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !form.name || !form.email || !form.password}>{saving ? 'Creating...' : 'Create User'}</button>
                        </div>
                    </form>
                </Modal>
            )}
            {resetUser && (
                <Modal onClose={() => setResetUser(null)}>
                    <h2 className="modal__title">Reset Password</h2>
                    <p className="modal__desc">Set a new password for <strong>{resetUser.name}</strong> ({resetUser.email})</p>
                    <form onSubmit={handleResetPassword}>
                        <div className="form-group">
                            <label>New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimum 4 characters"
                                    required
                                    minLength={4}
                                    autoFocus
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(v => !v)}
                                    title={showNewPassword ? 'Hide password' : 'Show password'}
                                    style={{
                                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                                        color: 'hsl(var(--muted-foreground))',
                                    }}
                                >
                                    {showNewPassword ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                            {newPassword.length > 0 && newPassword.length < 4 && (
                                <p style={{ color: 'hsl(var(--destructive))', fontSize: 12, margin: '4px 0 0' }}>Password must be at least 4 characters</p>
                            )}
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setResetUser(null)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={resetting || newPassword.length < 4}>{resetting ? 'Resetting...' : 'Reset Password'}</button>
                        </div>
                    </form>
                </Modal>
            )}
            {confirmArchive && (
                <ConfirmModal
                    title="Archive User"
                    message={`Are you sure you want to archive "${confirmArchive.name}"? They will no longer be able to log in.`}
                    confirmLabel="Archive"
                    confirmVariant="danger"
                    onConfirm={() => handleDelete(confirmArchive)}
                    onClose={() => setConfirmArchive(null)}
                />
            )}
            {confirmPermanentDelete && (
                <ConfirmModal
                    title="Permanently Delete User"
                    message={`Permanently delete "${confirmPermanentDelete.name}" (${confirmPermanentDelete.email})? This action cannot be undone.`}
                    confirmLabel="Delete Forever"
                    confirmVariant="danger"
                    onConfirm={() => handlePermanentDelete(confirmPermanentDelete)}
                    onClose={() => setConfirmPermanentDelete(null)}
                />
            )}
            {confirmBulkPermanentDelete && (
                <ConfirmModal
                    title="Delete All Archived Users"
                    message={`Permanently delete all ${users.length} archived user(s)? This action cannot be undone.`}
                    confirmLabel="Delete All Forever"
                    confirmVariant="danger"
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setConfirmBulkPermanentDelete(false)}
                />
            )}
        </>
    );
}
