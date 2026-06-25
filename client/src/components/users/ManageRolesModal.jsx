import { useState, useEffect, useMemo, useCallback } from 'react';
import { PERMISSIONS } from '../../utils/permissions';
import * as api from '../../api';
import { useToast } from '../../hooks/useToast';

const EMPTY_DRAFT = { id: null, name: '', description: '', permissions: [] };

export default function ManageRolesModal({ open, onClose }) {
    const { showToast } = useToast();
    const [groups, setGroups] = useState([]);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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

    if (!open) return null;

    function selectGroup(g) {
        setDraft({
            id: g.id,
            name: g.name,
            description: g.description || '',
            permissions: Array.isArray(g.permissions) ? [...g.permissions] : [],
        });
    }

    function newDraft() {
        setDraft({ ...EMPTY_DRAFT });
    }

    function togglePerm(key) {
        setDraft(d => ({
            ...d,
            permissions: d.permissions.includes(key)
                ? d.permissions.filter(k => k !== key)
                : [...d.permissions, key],
        }));
    }

    function selectAll() {
        setDraft(d => ({ ...d, permissions: PERMISSIONS.map(p => p.key) }));
    }

    function clearAll() {
        setDraft(d => ({ ...d, permissions: [] }));
    }

    async function save() {
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
    }

    async function archive(g) {
        const msg = g.userCount > 0
            ? `Delete '${g.name}'? ${g.userCount} user${g.userCount === 1 ? '' : 's'} currently assigned will become unrestricted (No restrictions) until you assign them a new role.`
            : `Delete '${g.name}'?`;
        if (!window.confirm(msg)) return;
        try {
            await api.archivePermissionGroup(g.id);
            showToast(`Role '${g.name}' deleted`);
            if (draft.id === g.id) setDraft(EMPTY_DRAFT);
            await loadGroups();
        } catch (err) {
            showToast(err.message || 'Failed to delete role', 'error');
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal modal--wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
                <div className="modal__header">
                    <h2 className="modal__title">Manage Roles</h2>
                    <button className="modal__close" onClick={onClose}>×</button>
                </div>
                <div className="manage-roles__body" style={{ display: 'flex', gap: 16, minHeight: 360 }}>
                    <div className="manage-roles__list" style={{ flex: '0 0 220px', borderRight: '1px solid hsl(var(--border))', paddingRight: 12 }}>
                        {loading ? (
                            <div>Loading…</div>
                        ) : (
                            <>
                                {groups.length === 0 && <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>No roles yet.</div>}
                                {groups.map(g => (
                                    <div
                                        key={g.id}
                                        className={`manage-roles__list-item ${draft.id === g.id ? 'manage-roles__list-item--active' : ''}`}
                                        onClick={() => selectGroup(g)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 4, background: draft.id === g.id ? 'hsl(var(--muted))' : 'transparent' }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{g.userCount} user{g.userCount === 1 ? '' : 's'}</div>
                                        </div>
                                        <button
                                            className="btn--icon"
                                            title="Delete"
                                            onClick={(e) => { e.stopPropagation(); archive(g); }}
                                            style={{ color: 'hsl(var(--destructive))' }}
                                        >×</button>
                                    </div>
                                ))}
                                <button className="btn btn--ghost btn--sm" onClick={newDraft} style={{ marginTop: 8 }}>+ New Role</button>
                            </>
                        )}
                    </div>
                    <div className="manage-roles__editor" style={{ flex: 1 }}>
                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <input className="form-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g., Office Manager" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <input className="form-input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <label className="form-label">Permissions</label>
                                <div>
                                    <button type="button" className="btn btn--ghost btn--sm" onClick={selectAll}>Select all</button>
                                    <button type="button" className="btn btn--ghost btn--sm" onClick={clearAll} style={{ marginLeft: 8 }}>Clear all</button>
                                </div>
                            </div>
                            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: 12 }}>
                                {Object.entries(sectionedPermissions).map(([section, perms]) => (
                                    <div key={section} style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>{section}</div>
                                        {perms.map(p => (
                                            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={draft.permissions.includes(p.key)}
                                                    onChange={() => togglePerm(p.key)}
                                                />
                                                {p.label}
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="modal__footer">
                    <button className="btn btn--ghost" onClick={onClose}>Close</button>
                    <button className="btn btn--primary" onClick={save} disabled={saving || !draft.name.trim()}>
                        {saving ? 'Saving…' : (draft.id ? 'Save' : 'Create')}
                    </button>
                </div>
            </div>
        </div>
    );
}
