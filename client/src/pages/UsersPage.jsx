import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';

export default function UsersPage({ showToast }) {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pca' });
    const [saving, setSaving] = useState(false);

    const fetchUsers = useCallback(async () => {
        try { setUsers(await api.getUsers()); } catch (err) { showToast(err.message, 'error'); }
    }, [showToast]);

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
        if (!confirm(`Delete user "${user.name}"?`)) return;
        try {
            await api.deleteUser(user.id);
            showToast('User deleted');
            fetchUsers();
        } catch (err) { showToast(err.message, 'error'); }
    };

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">User Management</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setShowModal(true)}>{Icons.plus} Add User</button>
                </div>
            </div>
            <div className="page-content">
                <div className="sheet-card">
                    <table className="data-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                                    <td>{u.email}</td>
                                    <td><span className={`ts-badge ts-badge--${u.role === 'admin' ? 'submitted' : 'draft'}`}>{u.role}</span></td>
                                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <button className="btn btn--outline btn--xs" style={{ color: 'hsl(0 84% 60%)' }} onClick={() => handleDelete(u)}>
                                            {Icons.trash}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {showModal && (
                <Modal onClose={() => setShowModal(false)}>
                    <h2 className="modal__title">Create User</h2>
                    <form onSubmit={handleCreate}>
                        <div className="form-group"><label>Name</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                        <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                        <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
                        <div className="form-group">
                            <label>Role</label>
                            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                                <option value="pca">PCA (Caregiver)</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
}
