import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

const STATUS_STYLES = {
    Expired: { bg: 'hsl(0 84% 95%)', color: 'hsl(0 72% 45%)', border: 'hsl(0 72% 85%)' },
    'Renewal Reminder': { bg: 'hsl(38 100% 95%)', color: 'hsl(32 95% 40%)', border: 'hsl(38 92% 80%)' },
    OK: { bg: 'hsl(142 76% 94%)', color: 'hsl(142 60% 30%)', border: 'hsl(142 60% 80%)' },
};

function parseServices(enabledServices) {
    try { return JSON.parse(enabledServices || '[]'); } catch { return []; }
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
        dob: '', paNumber: '', doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '', critical: false,
    });
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [saving, setSaving] = useState(false);

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
                dob: form.dob || null,
                paNumber: form.paNumber,
                doctorName: form.doctorName,
                doctorPhone: form.doctorPhone,
                backupDoctorName: form.backupDoctorName,
                backupDoctorPhone: form.backupDoctorPhone,
                critical: form.critical,
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
    });

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Clients</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setShowCreateModal(true)}>
                        {Icons.plus} Add Client
                    </button>
                </div>
            </div>
            <div className="page-content">
                <div className="cl-filters">
                    <div className="cl-filters__search">
                        <span className="cl-filters__search-icon">{Icons.search}</span>
                        <input
                            type="text"
                            className="cl-filters__search-input"
                            placeholder="Search by name or Medicaid ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button className="cl-filters__search-clear" onClick={() => setSearch('')}>&times;</button>
                        )}
                    </div>
                    <div className="cl-filters__tabs">
                        {[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' },
                            { value: 'discharged', label: 'Discharged' },
                            { value: 'transferred', label: 'Transferred' },
                            { value: 'all', label: 'All' },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                className={`cl-filters__tab ${statusFilter === opt.value ? 'cl-filters__tab--active' : ''}`}
                                onClick={() => setStatusFilter(opt.value)}
                            >
                                {opt.label}
                                {opt.value !== 'all' && (
                                    <span className="cl-filters__tab-count">
                                        {clients.filter(c => getEffectiveStatus(c) === opt.value).length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
                {loading ? (
                    <div className="empty-state">
                        <div className="empty-state__desc">Loading clients...</div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.users}</div>
                        <div className="empty-state__title">{search ? 'No matching clients' : 'No clients yet'}</div>
                        <div className="empty-state__desc">{search ? 'Try a different search term.' : 'Click "Add Client" to create one.'}</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Status</th>
                                    <th>Program</th>
                                    <th>Medicaid ID</th>
                                    <th>Services</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => {
                                    const services = parseServices(c.enabledServices);
                                    const statusStyle = STATUS_STYLES[c.overallStatus] || STATUS_STYLES.OK;
                                    return (
                                        <tr key={c.id} className={c.critical ? 'cl-row--critical' : ''} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${c.id}`)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="cl-avatar cl-avatar--sm">{(c.clientName || 'U').charAt(0).toUpperCase()}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 500, lineHeight: 1.3 }}>
                                                            {c.clientName}
                                                        </div>
                                                        {c.phone && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{c.phone}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span
                                                    className="ts-badge"
                                                    style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
                                                >
                                                    {c.overallStatus || 'OK'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="ts-badge ts-badge--draft">{c.insuranceType || '\u2014'}</span>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{c.medicaidId || '\u2014'}</td>
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
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <Modal onClose={() => setShowCreateModal(false)}>
                    <h2 className="modal__title">Add Client</h2>
                    <p className="modal__desc">Create a new client record.</p>
                    <form onSubmit={handleCreate}>
                        <div className="form-group">
                            <label>Client Name</label>
                            <input type="text" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Full name" required />
                        </div>
                        <div className="form-group">
                            <label>Medicaid ID</label>
                            <input type="text" value={form.medicaidId} onChange={(e) => setForm({ ...form, medicaidId: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Insurance Type</label>
                            <select value={form.insuranceType} onChange={(e) => setForm({ ...form, insuranceType: e.target.value })}>
                                {insuranceTypes.length > 0 ? insuranceTypes.map(t => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                )) : <option value="MEDICAID">MEDICAID</option>}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Date of Birth</label>
                            <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>PA#</label>
                            <input type="text" value={form.paNumber} onChange={(e) => setForm({ ...form, paNumber: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Doctor Name</label>
                            <input type="text" value={form.doctorName} onChange={(e) => setForm({ ...form, doctorName: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Doctor Phone</label>
                            <input type="text" value={form.doctorPhone} onChange={(e) => setForm({ ...form, doctorPhone: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Backup Doctor Name</label>
                            <input type="text" value={form.backupDoctorName} onChange={(e) => setForm({ ...form, backupDoctorName: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label>Backup Doctor Phone</label>
                            <input type="text" value={form.backupDoctorPhone} onChange={(e) => setForm({ ...form, backupDoctorPhone: e.target.value })} placeholder="Optional" />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={form.critical} onChange={(e) => setForm({ ...form, critical: e.target.checked })} />
                                Critical List
                            </label>
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
        </>
    );
}
