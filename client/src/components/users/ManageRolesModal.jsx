import { useState, useEffect, useMemo, useCallback } from 'react';
import { PERMISSIONS } from '../../utils/permissions';
import * as api from '../../api';
import { useToast } from '../../hooks/useToast';
import Modal from '../common/Modal';
import ConfirmModal from '../common/ConfirmModal';
import Icons from '../common/Icons';

const EMPTY_DRAFT = { id: null, name: '', description: '', permissions: [] };

export default function ManageRolesModal({ open, onClose }) {
    const { showToast } = useToast();
    const [groups, setGroups] = useState([]);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const sectionedPermissions = useMemo(() => {
        const sections = {};
        for (const p of PERMISSIONS) {
            if (!sections[p.group]) sections[p.group] = [];
            sections[p.group].push(p);
        }
        return sections;
    }, []);

    const loadGroups = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.listPermissionGroups();
            setGroups(data);
        } catch (err) {
            showToast(err.message || 'Failed to load roles', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (open) loadGroups();
        else setDraft(EMPTY_DRAFT);
    }, [open, loadGroups]);

    const selectGroup = useCallback((g) => {
        setDraft({
            id: g.id,
            name: g.name,
            description: g.description || '',
            permissions: Array.isArray(g.permissions) ? [...g.permissions] : [],
        });
    }, []);

    const newDraft = useCallback(() => {
        setDraft({ ...EMPTY_DRAFT });
    }, []);

    const togglePerm = useCallback((key) => {
        setDraft(d => ({
            ...d,
            permissions: d.permissions.includes(key)
                ? d.permissions.filter(k => k !== key)
                : [...d.permissions, key],
        }));
    }, []);

    const selectAll = useCallback(() => {
        setDraft(d => ({ ...d, permissions: PERMISSIONS.map(p => p.key) }));
    }, []);

    const clearAll = useCallback(() => {
        setDraft(d => ({ ...d, permissions: [] }));
    }, []);

    const save = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!draft.name.trim()) {
            showToast('Name is required', 'error');
            return;
        }
        setSaving(true);
        try {
            const body = {
                name: draft.name.trim(),
                description: draft.description.trim(),
                permissions: draft.permissions,
            };
            if (draft.id) {
                await api.updatePermissionGroup(draft.id, body);
                showToast('Role updated');
            } else {
                const created = await api.createPermissionGroup(body);
                setDraft({
                    id: created.id,
                    name: created.name,
                    description: created.description || '',
                    permissions: created.permissions || [],
                });
                showToast('Role created');
            }
            await loadGroups();
        } catch (err) {
            showToast(err.message || 'Failed to save role', 'error');
        } finally {
            setSaving(false);
        }
    }, [draft, loadGroups, showToast]);

    const handleDelete = useCallback(async () => {
        const g = confirmDelete;
        if (!g) return;
        try {
            await api.archivePermissionGroup(g.id);
            showToast(`Role "${g.name}" deleted`);
            if (draft.id === g.id) setDraft(EMPTY_DRAFT);
            await loadGroups();
        } catch (err) {
            showToast(err.message || 'Failed to delete role', 'error');
        } finally {
            setConfirmDelete(null);
        }
    }, [confirmDelete, draft.id, loadGroups, showToast]);

    if (!open) return null;

    return (
        <>
            <Modal onClose={onClose} wide>
                <h2 className="modal__title">Manage Roles</h2>
                <p className="modal__desc">Create reusable permission groups and assign them to users on the Users page.</p>

                <div className="roles-modal">
                    <aside className="roles-modal__list">
                        <div className="roles-modal__list-header">
                            <span>Roles</span>
                            <button type="button" className="btn btn--ghost btn--xs" onClick={newDraft}>
                                {Icons.plus} New
                            </button>
                        </div>
                        {loading ? (
                            <div className="roles-modal__empty">Loading…</div>
                        ) : groups.length === 0 ? (
                            <div className="roles-modal__empty">No roles yet.</div>
                        ) : (
                            <ul className="roles-modal__list-items">
                                {groups.map(g => (
                                    <li
                                        key={g.id}
                                        className={`roles-modal__list-item ${draft.id === g.id ? 'roles-modal__list-item--active' : ''}`}
                                        onClick={() => selectGroup(g)}
                                    >
                                        <div className="roles-modal__list-item-text">
                                            <div className="roles-modal__list-item-name">{g.name}</div>
                                            <div className="roles-modal__list-item-meta">
                                                {g.userCount} user{g.userCount === 1 ? '' : 's'} · {g.permissions?.length || 0} permission{(g.permissions?.length || 0) === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn--ghost btn--icon btn--danger-ghost roles-modal__list-item-delete"
                                            title="Delete role"
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(g); }}
                                        >
                                            {Icons.trash}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </aside>

                    <form className="roles-modal__editor" onSubmit={save}>
                        <div className="form-group">
                            <label htmlFor="role-name">Role name</label>
                            <input
                                id="role-name"
                                type="text"
                                value={draft.name}
                                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                placeholder="e.g., Office Manager"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="role-description">Description</label>
                            <input
                                id="role-description"
                                type="text"
                                value={draft.description}
                                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                                placeholder="Optional"
                            />
                        </div>

                        <div className="form-group">
                            <div className="roles-modal__permissions-header">
                                <label>Permissions</label>
                                <div className="roles-modal__permissions-actions">
                                    <button type="button" className="btn btn--ghost btn--xs" onClick={selectAll}>Select all</button>
                                    <button type="button" className="btn btn--ghost btn--xs" onClick={clearAll}>Clear all</button>
                                </div>
                            </div>
                            <div className="roles-modal__permissions">
                                {Object.entries(sectionedPermissions).map(([section, perms]) => (
                                    <div key={section} className="roles-modal__permission-section">
                                        <div className="roles-modal__permission-section-title">{section}</div>
                                        <div className="roles-modal__permission-grid">
                                            {perms.map(p => (
                                                <label key={p.key} className="roles-modal__permission">
                                                    <input
                                                        type="checkbox"
                                                        checked={draft.permissions.includes(p.key)}
                                                        onChange={() => togglePerm(p.key)}
                                                    />
                                                    <span>{p.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={onClose}>Close</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !draft.name.trim()}>
                                {saving ? 'Saving…' : (draft.id ? 'Save changes' : 'Create role')}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {confirmDelete && (
                <ConfirmModal
                    title="Delete role"
                    message={
                        confirmDelete.userCount > 0
                            ? `Delete "${confirmDelete.name}"? ${confirmDelete.userCount} user${confirmDelete.userCount === 1 ? '' : 's'} currently assigned will become unrestricted (No restrictions) until you assign them a new role.`
                            : `Delete "${confirmDelete.name}"?`
                    }
                    confirmLabel="Delete"
                    confirmVariant="danger"
                    onConfirm={handleDelete}
                    onClose={() => setConfirmDelete(null)}
                />
            )}
        </>
    );
}
