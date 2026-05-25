import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';


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
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [form, setForm] = useState({
        clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '',
        dob: '', gender: '', paNumber: '', doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '', critical: false,
    });
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [saving, setSaving] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [sortOrder, setSortOrder] = useState('az');
    const [previewClient, setPreviewClient] = useState(null);

    const handleDatePaste = (field) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setForm(prev => ({ ...prev, [field]: parsed }));
        }
    };

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

    useEffect(() => { fetchClients(); fetchInsuranceTypes(); }, [fetchClients, fetchInsuranceTypes]);

    useEffect(() => {
        if (!menuOpenId) return;
        const close = () => setMenuOpenId(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [menuOpenId]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.clientName.trim()) return;
        setSaving(true);
        try {
            const client = await api.createClient(form.clientName, {
                medicaidId: form.medicaidId,
                insuranceType: form.insuranceType,
                address: form.address,
                phone: form.phone,
                gender: form.gender,
                dob: form.dob || null,
                doctorName: form.doctorName,
                doctorPhone: form.doctorPhone,
            });
            showToast(`"${client.clientName}" created`);
            setShowCreateModal(false);
            setForm({
                clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '',
                dob: '', paNumber: '', doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '', critical: false,
            });
            navigate(`/clients/${client.id}`);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const getEffectiveStatus = (c) => c.critical ? 'inactive' : (c.clientStatus || 'active');

    const filtered = clients.filter(c => {
        if (statusFilter !== 'all' && getEffectiveStatus(c) !== statusFilter) return false;
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
                    <input
                        type="text"
                        className="page-hero__search"
                        placeholder="Search by name or Medicaid ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="btn btn--primary" onClick={() => setShowCreateModal(true)}>
                        {Icons.plus} Add Client
                    </button>
                </div>
            </div>
            <div className="page-content">
                <div className="sheet-card">
                    <div className="filter-pills">
                        {[
                            { key: 'active', color: 'green', label: 'Active', count: clients.filter(c => getEffectiveStatus(c) === 'active').length },
                            { key: 'inactive', color: 'orange', label: 'Inactive', count: clients.filter(c => getEffectiveStatus(c) === 'inactive').length },
                            { key: 'discharged', color: 'red', label: 'Discharged', count: clients.filter(c => getEffectiveStatus(c) === 'discharged').length },
                            { key: 'transferred', color: '', label: 'Transferred', count: clients.filter(c => getEffectiveStatus(c) === 'transferred').length },
                            { key: 'all', color: '', label: 'All', count: clients.length },
                        ].map(({ key, color, label, count }) => (
                            <button
                                key={key}
                                className={`filter-pill ${color ? `filter-pill--${color}` : ''} ${statusFilter === key ? 'filter-pill--active' : ''}`}
                                onClick={() => setStatusFilter(key)}
                            >
                                <span className="filter-pill__dot" />
                                {label}
                                <span className="filter-pill__count">{count}</span>
                            </button>
                        ))}
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
                        <div className="sheet-table-wrap">
                            <table className="sheet-table">
                            <thead>
                                <tr>
                                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortOrder(sortOrder === 'az' ? 'za' : 'az')}>
                                        <span className="th-content">Client {sortOrder === 'az' ? '↑' : '↓'}</span>
                                    </th>
                                    <th><span className="th-content">Client ID</span></th>
                                    <th><span className="th-content">Gender</span></th>
                                    <th><span className="th-content">DOB</span></th>
                                    <th><span className="th-content">Services</span></th>
                                    <th><span className="th-content">Last Visit</span></th>
                                    <th><span className="th-content">Status</span></th>
                                    <th style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => {
                                    const services = getServiceCodes(c);
                                    const effectiveStatus = getEffectiveStatus(c);
                                    const clientStatusStyle = CLIENT_STATUS_STYLES[effectiveStatus] || CLIENT_STATUS_STYLES.active;
                                    return (
                                        <tr key={c.id} className={c.critical ? 'cl-row--critical' : ''} style={{ cursor: 'pointer' }} onClick={() => setPreviewClient(c)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="client-avatar" style={{ background: getAvatarColor(c.clientName) }}>{getInitials(c.clientName)}</div>
                                                    <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{c.clientName}</div>
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{c.medicaidId || '\u2014'}</td>
                                            <td style={{ fontSize: 12 }}>{c.gender || '\u2014'}</td>
                                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatShortDate(c.dob)}</td>
                                            <td>
                                                {services.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {services.map(s => (
                                                            <span key={s} className="cp-service-chip cp-service-chip--sm">{s}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>{'\u2014'}</span>
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
                                                        {Icons.moreVertical || '\u22ee'}
                                                    </button>
                                                    {menuOpenId === c.id && (
                                                        <div className="cl-row-menu__dropdown" onClick={(e) => e.stopPropagation()}>
                                                            <button className="cl-row-menu__item" onClick={() => { navigate(`/clients/${c.id}`); setMenuOpenId(null); }}>
                                                                {Icons.eye} View Details
                                                            </button>
                                                            <button className="cl-row-menu__item" onClick={() => { navigate(`/clients/${c.id}`); setMenuOpenId(null); }}>
                                                                {Icons.edit} Edit Client
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

            {showCreateModal && (
                <Modal onClose={() => setShowCreateModal(false)}>
                    <h2 className="modal__title">Add Client</h2>
                    <p className="modal__desc">Enter the client's basic information. Authorization details can be added later in the Authorization section.</p>
                    <form onSubmit={handleCreate}>
                        <div className="form-group">
                            <label>Client Name <span style={{ color: '#dc2626' }}>*</span></label>
                            <input type="text" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Full name" required />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Medicaid ID</label>
                                <input type="text" value={form.medicaidId} onChange={(e) => setForm({ ...form, medicaidId: e.target.value })} placeholder="e.g. 00002399084" />
                            </div>
                            <div className="form-group">
                                <label>Insurance Type</label>
                                <select value={form.insuranceType} onChange={(e) => setForm({ ...form, insuranceType: e.target.value })}>
                                    {insuranceTypes.length > 0 ? insuranceTypes.map(t => (
                                        <option key={t.id} value={t.name}>{t.name}</option>
                                    )) : <option value="MEDICAID">MEDICAID</option>}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Phone</label>
                                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
                            </div>
                            <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} onPaste={handleDatePaste('dob')} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Gender</label>
                                <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                                    <option value="">— Select —</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Doctor Name</label>
                                <input type="text" value={form.doctorName} onChange={(e) => setForm({ ...form, doctorName: e.target.value })} placeholder="Optional" />
                            </div>
                            <div className="form-group">
                                <label>Doctor Phone</label>
                                <input type="text" value={form.doctorPhone} onChange={(e) => setForm({ ...form, doctorPhone: e.target.value })} placeholder="Optional" />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !form.clientName.trim()}>
                                {saving ? 'Creating...' : 'Create Client'}
                            </button>
                        </div>
                    </form>
                </Modal>
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
                                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono, monospace)' }}>
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
        </>
    );
}
