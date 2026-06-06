import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import ClientCreationWizard from '../components/ClientCreationWizard';
import TrashDrawer from '../components/common/TrashDrawer';


function getServiceCodes(client) {
    const auths = client.authorizations || [];
    return [...new Set(auths.filter(a => !a.archivedAt).map(a => a.serviceCode).filter(Boolean))];
}

const CLIENT_STATUS_STYLES = {
    active: { bg: 'hsl(142 76% 94%)', color: 'hsl(142 60% 30%)', label: 'Active' },
    inactive: { bg: 'hsl(38 100% 95%)', color: 'hsl(32 95% 40%)', label: 'Inactive' },
    discharged: { bg: 'hsl(0 84% 95%)', color: 'hsl(0 72% 45%)', label: 'Discharged' },
    transferred: { bg: 'hsl(217 91% 95%)', color: 'hsl(217 70% 40%)', label: 'Transferred' },
};

function formatShortDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function ClientsListPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [showCreateWizard, setShowCreateWizard] = useState(false);
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [sortOrder, setSortOrder] = useState('az');
    const [previewClient, setPreviewClient] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkNoteModal, setBulkNoteModal] = useState(false);
    const [bulkAssignModal, setBulkAssignModal] = useState(false);
    const [allEmployees, setAllEmployees] = useState([]);
    const [trashOpen, setTrashOpen] = useState(false);
    const [archivedClients, setArchivedClients] = useState([]);
    const [confirmArchive, setConfirmArchive] = useState(null);

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getClients();
            setClients(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const fetchInsuranceTypes = useCallback(async () => {
        try {
            setInsuranceTypes(await api.getInsuranceTypes());
        } catch (err) { /* ignore */ }
    }, []);

    useEffect(() => { fetchClients(); fetchInsuranceTypes(); api.getEmployees().then(setAllEmployees).catch(() => {}); }, [fetchClients, fetchInsuranceTypes]);

    const fetchArchivedClients = useCallback(async () => {
        try {
            const data = await api.listArchivedClients();
            setArchivedClients(data);
        } catch {}
    }, []);

    useEffect(() => {
        if (trashOpen) fetchArchivedClients();
    }, [trashOpen, fetchArchivedClients]);

    useEffect(() => {
        if (!menuOpenId) return;
        const close = () => setMenuOpenId(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [menuOpenId]);

    useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, serviceFilter, search]);

    const handleClientCreated = (client) => {
        setShowCreateWizard(false);
        navigate(`/clients/${client.id}`);
    };

    const handleArchive = async () => {
        try {
            const toArchive = confirmArchive;
            if (toArchive.length === 1) {
                await api.deleteClient(toArchive[0].id);
            } else {
                await api.bulkDeleteClients(toArchive.map(c => c.id));
            }
            setConfirmArchive(null);
            setSelectedIds(new Set());
            fetchClients();
            showUndoToast(`Archived ${toArchive.length} client${toArchive.length > 1 ? 's' : ''}`, async () => {
                if (toArchive.length === 1) {
                    await api.restoreClient(toArchive[0].id);
                } else {
                    await api.bulkRestoreClients(toArchive.map(c => c.id));
                }
                fetchClients();
            });
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const getEffectiveStatus = (c) => c.clientStatus || 'active';

    const allServiceCodes = [...new Set(clients.flatMap(c => getServiceCodes(c)))].sort();

    const filtered = clients.filter(c => {
        if (statusFilter !== 'all' && getEffectiveStatus(c) !== statusFilter) return false;
        if (serviceFilter !== 'all' && !getServiceCodes(c).includes(serviceFilter)) return false;
        if (!search) return true;
        const s = search.toLowerCase();
        return c.clientName.toLowerCase().includes(s) || (c.medicaidId || '').toLowerCase().includes(s);
    }).sort((a, b) => {
        const nameA = (a.clientName || '').toLowerCase();
        const nameB = (b.clientName || '').toLowerCase();
        return sortOrder === 'az' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    };
    const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
    const getAvatarColor = (name) => {
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    };

    const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(c => c.id)));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.users}</div>
                    <div>
                        <div className="page-hero__title">Clients</div>
                        <div className="page-hero__subtitle">Manage client profiles and service records</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    <button
                        className="btn btn--outline btn--sm"
                        onClick={() => setTrashOpen(true)}
                        title="View deleted clients"
                    >
                        {Icons.trash}
                    </button>
                    <input
                        type="text"
                        className="page-hero__search"
                        placeholder="Search by name or Medicaid ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="btn btn--primary" onClick={() => setShowCreateWizard(true)}>
                        {Icons.plus} Add Client
                    </button>
                </div>
            </div>
            <div className="page-content">
                <div className="sheet-card">
                    <div className="table-toolbar">
                        <div className="table-toolbar__left">
                            <input
                                type="checkbox"
                                className="bulk-checkbox"
                                checked={allSelected}
                                onChange={toggleSelectAll}
                            />
                            <span className="table-toolbar__selected">{selectedIds.size} selected</span>
                            <select
                                className="table-toolbar__select"
                                value=""
                                onChange={async (e) => {
                                    const action = e.target.value;
                                    if (!action) return;
                                    e.target.value = '';
                                    if (selectedIds.size === 0) { showToast('Select clients first', 'error'); return; }
                                    const selected = clients.filter(c => selectedIds.has(c.id));
                                    if (action === 'Discharge') {
                                        const prevStatuses = selected.map(c => ({ id: c.id, status: c.clientStatus || 'active' }));
                                        await Promise.all(selected.map(c => api.patchClient(c.id, { clientStatus: 'discharged' })));
                                        setSelectedIds(new Set());
                                        fetchClients();
                                        showUndoToast(`Discharged ${selected.length} client(s)`, async () => {
                                            await Promise.all(prevStatuses.map(s => api.patchClient(s.id, { clientStatus: s.status })));
                                            fetchClients();
                                        });
                                    } else if (action === 'Transfer') {
                                        const prevStatuses = selected.map(c => ({ id: c.id, status: c.clientStatus || 'active' }));
                                        await Promise.all(selected.map(c => api.patchClient(c.id, { clientStatus: 'transferred' })));
                                        setSelectedIds(new Set());
                                        fetchClients();
                                        showUndoToast(`Transferred ${selected.length} client(s)`, async () => {
                                            await Promise.all(prevStatuses.map(s => api.patchClient(s.id, { clientStatus: s.status })));
                                            fetchClients();
                                        });
                                    } else if (action === 'Deactivate') {
                                        const prevStatuses = selected.map(c => ({ id: c.id, status: c.clientStatus || 'active' }));
                                        await Promise.all(selected.map(c => api.patchClient(c.id, { clientStatus: 'inactive' })));
                                        setSelectedIds(new Set());
                                        fetchClients();
                                        showUndoToast(`Deactivated ${selected.length} client(s)`, async () => {
                                            await Promise.all(prevStatuses.map(s => api.patchClient(s.id, { clientStatus: s.status })));
                                            fetchClients();
                                        });
                                    } else if (action === 'Activate') {
                                        const prevStatuses = selected.map(c => ({ id: c.id, status: c.clientStatus || 'active' }));
                                        await Promise.all(selected.map(c => api.patchClient(c.id, { clientStatus: 'active' })));
                                        setSelectedIds(new Set());
                                        fetchClients();
                                        showUndoToast(`Activated ${selected.length} client(s)`, async () => {
                                            await Promise.all(prevStatuses.map(s => api.patchClient(s.id, { clientStatus: s.status })));
                                            fetchClients();
                                        });
                                    } else if (action === 'Archive') {
                                        setConfirmArchive(selected);
                                    } else if (action === 'Add Note') {
                                        setBulkNoteModal(true);
                                    } else if (action === 'Assign Caregiver') {
                                        setBulkAssignModal(true);
                                    }
                                }}
                            >
                                <option value="">Bulk Actions</option>
                                <option value="Activate">Activate</option>
                                <option value="Deactivate">Deactivate</option>
                                <option value="Add Note">Add Note</option>
                                <option value="Assign Caregiver">Assign Caregiver</option>
                                <option value="Transfer">Transfer</option>
                                <option value="Discharge">Discharge</option>
                                <option value="Archive">Archive</option>
                            </select>
                        </div>
                        <div className="table-toolbar__right">
                            <button className="table-toolbar__filter-btn">
                                {Icons.filter} Filters
                            </button>
                            <select
                                className="table-toolbar__filter"
                                value={serviceFilter}
                                onChange={(e) => setServiceFilter(e.target.value)}
                            >
                                <option value="all">All Services</option>
                                {allServiceCodes.map(code => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                            <select
                                className="table-toolbar__filter"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="discharged">Discharged</option>
                                <option value="transferred">Transferred</option>
                            </select>
                            {(statusFilter !== 'active' || serviceFilter !== 'all') && (
                                <button className="table-toolbar__reset" onClick={() => { setStatusFilter('active'); setServiceFilter('all'); }}>
                                    {Icons.rotateCcw} Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: 16 }}>
                            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">{Icons.users}</div>
                            <div className="empty-state__title">{search ? 'No matching clients' : 'No clients yet'}</div>
                            <div className="empty-state__desc">{search ? 'Try a different search term.' : 'Click "Add Client" to create one.'}</div>
                        </div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table data-table--sheet data-table--dark-header">
                            <thead>
                                <tr>
                                    <th scope="col" style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            className="bulk-checkbox bulk-checkbox--light"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th scope="col" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortOrder(sortOrder === 'az' ? 'za' : 'az')}>
                                        <span className="th-content">Client {sortOrder === 'az' ? '↑' : '↓'}</span>
                                    </th>
                                    <th scope="col"><span className="th-content">Client ID</span></th>
                                    <th scope="col"><span className="th-content">Gender</span></th>
                                    <th scope="col"><span className="th-content">DOB</span></th>
                                    <th scope="col"><span className="th-content">Services</span></th>
                                    <th scope="col"><span className="th-content">Last Visit</span></th>
                                    <th scope="col"><span className="th-content">Status</span></th>
                                    <th scope="col" style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => {
                                    const services = getServiceCodes(c);
                                    const effectiveStatus = getEffectiveStatus(c);
                                    const clientStatusStyle = CLIENT_STATUS_STYLES[effectiveStatus] || CLIENT_STATUS_STYLES.active;
                                    const rowColor = effectiveStatus === 'active' ? 'BLUE' : effectiveStatus === 'discharged' ? 'RED' : effectiveStatus === 'inactive' ? 'ORANGE' : 'BLUE';
                                    return (
                                        <tr key={c.id} className={`row-client row-client--${rowColor}`}>
                                            <td onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="bulk-checkbox"
                                                    checked={selectedIds.has(c.id)}
                                                    onChange={() => toggleSelect(c.id)}
                                                />
                                            </td>
                                            <td style={{ cursor: 'pointer' }} onClick={() => setPreviewClient(c)}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="client-avatar" style={{ background: getAvatarColor(c.clientName) }}>{getInitials(c.clientName)}</div>
                                                    <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{c.clientName}</div>
                                                </div>
                                            </td>
                                            <td style={{ fontSize: 12 }}>{c.medicaidId || '—'}</td>
                                            <td style={{ fontSize: 12 }}>{c.gender || '—'}</td>
                                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatShortDate(c.dob)}</td>
                                            <td>
                                                {services.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {services.map(s => (
                                                            <span key={s} className="cp-service-chip cp-service-chip--sm">{s}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>{'—'}</span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatShortDate(c.lastVisit)}</td>
                                            <td>
                                                <span
                                                    className="cl-status-chip"
                                                    style={{ background: clientStatusStyle.bg, color: clientStatusStyle.color }}
                                                >
                                                    {clientStatusStyle.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="cl-row-menu" style={{ position: 'relative' }}>
                                                    <button
                                                        className="btn btn--ghost btn--icon btn--xs"
                                                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }}
                                                        title="Actions"
                                                    >
                                                        {Icons.moreVertical || '⋮'}
                                                    </button>
                                                    {menuOpenId === c.id && (
                                                        <div className="cl-row-menu__dropdown" onClick={(e) => e.stopPropagation()}>
                                                            <button className="cl-row-menu__item" onClick={() => { navigate(`/clients/${c.id}`); setMenuOpenId(null); }}>
                                                                {Icons.eye} View Details
                                                            </button>
                                                            <button className="cl-row-menu__item" onClick={() => { navigate(`/clients/${c.id}`); setMenuOpenId(null); }}>
                                                                {Icons.edit} Edit Client
                                                            </button>
                                                            <button className="cl-row-menu__item cl-row-menu__item--danger" onClick={() => { setConfirmArchive([c]); setMenuOpenId(null); }}>
                                                                {Icons.trash} Archive
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                    )}
                </div>
            </div>

            {showCreateWizard && (
                <ClientCreationWizard
                    onClose={() => setShowCreateWizard(false)}
                    onCreated={handleClientCreated}
                    insuranceTypes={insuranceTypes}
                />
            )}

            {previewClient && (
                <Modal onClose={() => setPreviewClient(null)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div className="cl-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
                            {(previewClient.clientName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="modal__title" style={{ margin: 0 }}>{previewClient.clientName}</h2>
                            {previewClient.medicaidId && (
                                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                    ID: {previewClient.medicaidId}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 20 }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>Status</div>
                            <span
                                className="cl-status-chip"
                                style={{
                                    background: (CLIENT_STATUS_STYLES[getEffectiveStatus(previewClient)] || CLIENT_STATUS_STYLES.active).bg,
                                    color: (CLIENT_STATUS_STYLES[getEffectiveStatus(previewClient)] || CLIENT_STATUS_STYLES.active).color,
                                }}
                            >
                                {(CLIENT_STATUS_STYLES[getEffectiveStatus(previewClient)] || CLIENT_STATUS_STYLES.active).label}
                            </span>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>DOB</div>
                            <div style={{ fontSize: 13 }}>{formatShortDate(previewClient.dob)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>Gender</div>
                            <div style={{ fontSize: 13 }}>{previewClient.gender || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>Phone</div>
                            <div style={{ fontSize: 13 }}>{previewClient.phone || '—'}</div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>Address</div>
                            <div style={{ fontSize: 13 }}>{previewClient.address || '—'}</div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 2 }}>Services</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                {getServiceCodes(previewClient).length > 0
                                    ? getServiceCodes(previewClient).map(s => (
                                        <span key={s} className="cp-service-chip cp-service-chip--sm">{s}</span>
                                    ))
                                    : <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{'—'}</span>
                                }
                            </div>
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setPreviewClient(null)}>Close</button>
                        <button className="btn btn--primary" onClick={() => { setPreviewClient(null); navigate(`/clients/${previewClient.id}`); }}>
                            {Icons.eye} View Full Details
                        </button>
                    </div>
                </Modal>
            )}
            {bulkNoteModal && (
                <BulkNoteModal
                    count={selectedIds.size}
                    onSave={async (note) => {
                        const selected = clients.filter(c => selectedIds.has(c.id));
                        const prevNotes = selected.map(c => ({ id: c.id, notes: c.notes || '' }));
                        await Promise.all(selected.map(c =>
                            api.patchClient(c.id, { notes: c.notes ? `${c.notes}\n${note}` : note })
                        ));
                        setBulkNoteModal(false);
                        setSelectedIds(new Set());
                        fetchClients();
                        showUndoToast(`Added note to ${selected.length} client(s)`, async () => {
                            await Promise.all(prevNotes.map(s => api.patchClient(s.id, { notes: s.notes })));
                            fetchClients();
                        });
                    }}
                    onClose={() => setBulkNoteModal(false)}
                />
            )}
            {bulkAssignModal && (
                <BulkAssignModal
                    employees={allEmployees.filter(e => e.active)}
                    count={selectedIds.size}
                    onSave={async (employeeId) => {
                        const emp = allEmployees.find(e => e.id === employeeId);
                        const selected = clients.filter(c => selectedIds.has(c.id));
                        const clientNames = selected.map(c => c.clientName).join(', ');
                        const prevAssignment = emp?.clientAssignment || '';
                        const newAssignment = prevAssignment
                            ? `${prevAssignment}, ${clientNames}`
                            : clientNames;
                        await api.updateEmployee(employeeId, { clientAssignment: newAssignment });
                        setBulkAssignModal(false);
                        setSelectedIds(new Set());
                        showUndoToast(`Assigned ${selected.length} client(s) to ${emp?.name}`, async () => {
                            await api.updateEmployee(employeeId, { clientAssignment: prevAssignment });
                        });
                    }}
                    onClose={() => setBulkAssignModal(false)}
                />
            )}
            {confirmArchive && (
                <ConfirmModal
                    title={confirmArchive.length === 1 ? 'Archive Client' : `Archive ${confirmArchive.length} Clients`}
                    message={confirmArchive.length === 1
                        ? `Archive "${confirmArchive[0].clientName}"? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`
                        : `Archive ${confirmArchive.length} clients? This will remove them from authorizations, scheduling, and timesheets. You can restore from the trash drawer.`}
                    confirmLabel="Archive"
                    confirmVariant="danger"
                    onConfirm={handleArchive}
                    onClose={() => setConfirmArchive(null)}
                />
            )}
            <TrashDrawerWrapper
                open={trashOpen}
                archivedClients={archivedClients}
                onClose={() => setTrashOpen(false)}
                onRestore={async (ids) => {
                    await api.bulkRestoreClients(ids);
                    fetchClients();
                    fetchArchivedClients();
                    showToast(`Restored ${ids.length} client${ids.length !== 1 ? 's' : ''}`);
                }}
                onPermanentDelete={async (ids) => {
                    await api.bulkPermanentlyDeleteClients(ids);
                    fetchArchivedClients();
                    showToast(`Permanently deleted ${ids.length} client${ids.length !== 1 ? 's' : ''}`);
                }}
            />
        </>
    );
}

function BulkNoteModal({ count, onSave, onClose }) {
    const [note, setNote] = useState('');
    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">Add Note to {count} Client(s)</h2>
            <p className="modal__desc">This note will be appended to each selected client's notes.</p>
            <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSave(note.trim()); }}>
                <div className="form-group">
                    <label htmlFor="bulkNote">Note</label>
                    <textarea
                        id="bulkNote"
                        rows={4}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Enter note..."
                        autoFocus
                    />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={!note.trim()}>Add Note</button>
                </div>
            </form>
        </Modal>
    );
}

function BulkAssignModal({ employees, count, onSave, onClose }) {
    const [selectedEmp, setSelectedEmp] = useState('');
    const [search, setSearch] = useState('');
    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase())
    );
    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">Assign Caregiver to {count} Client(s)</h2>
            <p className="modal__desc">Select a caregiver to assign to the selected clients.</p>
            <form onSubmit={(e) => { e.preventDefault(); if (selectedEmp) onSave(Number(selectedEmp)); }}>
                <div className="form-group">
                    <label htmlFor="empSearch">Search Employee</label>
                    <input
                        id="empSearch"
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Type to filter..."
                        autoFocus
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="empSelect">Employee</label>
                    <select id="empSelect" value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)}>
                        <option value="">Select an employee...</option>
                        {filtered.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={!selectedEmp}>Assign</button>
                </div>
            </form>
        </Modal>
    );
}

function TrashDrawerWrapper({ open, archivedClients, onClose, onRestore, onPermanentDelete }) {
    if (!open) return null;
    return (
        <TrashDrawer
            items={archivedClients}
            batches={[]}
            onRestore={onRestore}
            onRestoreBatch={() => {}}
            onPermanentDelete={onPermanentDelete}
            onClose={onClose}
            entityLabel="clients"
        />
    );
}
