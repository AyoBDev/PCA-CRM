import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { useToast } from '../hooks/useToast';
import { useUndoStack } from '../hooks/useUndoStack';

const EMPTY_FORM = { name: '', slug: '', adminEmail: '', adminName: '' };

export default function PlatformPage() {
    const { showToast } = useToast();
    const undoState = useUndoStack();
    const [agencies, setAgencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [confirmSuspend, setConfirmSuspend] = useState(null);
    const [confirmReactivate, setConfirmReactivate] = useState(null);

    const fetchAgencies = useCallback(async () => {
        try {
            setAgencies(await api.listPlatformAgencies());
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchAgencies(); }, [fetchAgencies]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name || !form.slug || !form.adminEmail || !form.adminName) return;
        setSaving(true);
        try {
            await api.createPlatformAgency(form);
            showToast(`Agency "${form.name}" created`);
            setShowModal(false);
            setForm(EMPTY_FORM);
            fetchAgencies();
            // Creation seeds an agency + admin user; undoing would require a
            // full deletion path that doesn't exist yet. Skipped intentionally.
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSuspend = async (agency) => {
        try {
            await api.suspendAgency(agency.id);
            setConfirmSuspend(null);
            showToast(`"${agency.name}" suspended`);
            fetchAgencies();
            undoState.pushAction(`Suspended "${agency.name}"`,
                async () => { await api.reactivateAgency(agency.id); fetchAgencies(); },
                async () => { await api.suspendAgency(agency.id); fetchAgencies(); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleReactivate = async (agency) => {
        try {
            await api.reactivateAgency(agency.id);
            setConfirmReactivate(null);
            showToast(`"${agency.name}" reactivated`);
            fetchAgencies();
            undoState.pushAction(`Reactivated "${agency.name}"`,
                async () => { await api.suspendAgency(agency.id); fetchAgencies(); },
                async () => { await api.reactivateAgency(agency.id); fetchAgencies(); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleImpersonate = async (agency) => {
        try {
            const { token, subdomainUrl } = await api.impersonateAgency(agency.id);
            window.open(`${subdomainUrl}?impersonate=${token}`, '_blank', 'noopener');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const filtered = agencies.filter((a) =>
        !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.slug.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <GlobalToolbar
                title="Platform"
                subtitle="Manage agencies across the platform"
                icon={Icons.building}
                activityEntity="Agency"
                undoState={undoState}
            />
            <ContextBar>
                <ContextBar.Left>
                    <input
                        type="text"
                        className="context-bar__input"
                        placeholder="Search agencies..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </ContextBar.Left>
                <ContextBar.Right>
                    <button className="btn btn--primary" onClick={() => setShowModal(true)}>
                        {Icons.plus} New Agency
                    </button>
                </ContextBar.Right>
            </ContextBar>
            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.building}</div>
                        <div className="empty-state__title">No agencies found</div>
                        <div className="empty-state__desc">
                            {search ? 'Try adjusting your search.' : 'Click "New Agency" to onboard your first tenant.'}
                        </div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <div className="table-scroll">
                            <table className="data-table data-table--sheet data-table--dark-header">
                                <thead>
                                    <tr>
                                        <th scope="col">Name</th>
                                        <th scope="col">Subdomain</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Users</th>
                                        <th scope="col">Clients</th>
                                        <th scope="col">Created</th>
                                        <th scope="col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((agency) => (
                                        <tr key={agency.id}>
                                            <td style={{ fontWeight: 500 }}>{agency.name}</td>
                                            <td>{agency.slug}</td>
                                            <td>
                                                <span className={`ts-badge ts-badge--${agency.status === 'active' ? 'success' : 'danger'}`}>
                                                    {agency.status}
                                                </span>
                                            </td>
                                            <td>{agency.userCount}</td>
                                            <td>{agency.clientCount}</td>
                                            <td>{new Date(agency.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    {agency.status === 'active' ? (
                                                        <button
                                                            className="btn btn--danger-ghost btn--sm"
                                                            onClick={() => setConfirmSuspend(agency)}
                                                        >
                                                            Suspend
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn btn--restore btn--sm"
                                                            onClick={() => setConfirmReactivate(agency)}
                                                        >
                                                            {Icons.rotateCcw} Reactivate
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn--ghost btn--sm"
                                                        title="Impersonate an admin at this agency"
                                                        onClick={() => handleImpersonate(agency)}
                                                    >
                                                        {Icons.externalLink} Impersonate
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {showModal && (
                <Modal onClose={() => setShowModal(false)}>
                    <h2 className="modal__title">New Agency</h2>
                    <p className="modal__desc">Create a new tenant agency and its first admin account.</p>
                    <form onSubmit={handleCreate}>
                        <div className="form-group">
                            <label htmlFor="platform-agency-name">Agency Name</label>
                            <input
                                id="platform-agency-name"
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Acme Care"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="platform-agency-slug">Subdomain</label>
                            <input
                                id="platform-agency-slug"
                                type="text"
                                value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                placeholder="acme"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="platform-admin-email">Admin Email</label>
                            <input
                                id="platform-admin-email"
                                type="email"
                                value={form.adminEmail}
                                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                                placeholder="admin@acme.com"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="platform-admin-name">Admin Name</label>
                            <input
                                id="platform-admin-name"
                                type="text"
                                value={form.adminName}
                                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                                placeholder="Full name"
                                required
                            />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancel</button>
                            <button
                                type="submit"
                                className="btn btn--primary"
                                disabled={saving || !form.name || !form.slug || !form.adminEmail || !form.adminName}
                            >
                                {saving ? 'Creating...' : 'Create Agency'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
            {confirmSuspend && (
                <ConfirmModal
                    title="Suspend Agency"
                    message={`Are you sure you want to suspend "${confirmSuspend.name}"? Users at this agency will be unable to log in until it is reactivated.`}
                    confirmLabel="Suspend"
                    confirmVariant="danger"
                    onConfirm={() => handleSuspend(confirmSuspend)}
                    onClose={() => setConfirmSuspend(null)}
                />
            )}
            {confirmReactivate && (
                <ConfirmModal
                    title="Reactivate Agency"
                    message={`Reactivate "${confirmReactivate.name}"? Users will be able to log in again.`}
                    confirmLabel="Reactivate"
                    confirmVariant="primary"
                    onConfirm={() => handleReactivate(confirmReactivate)}
                    onClose={() => setConfirmReactivate(null)}
                />
            )}
        </>
    );
}
