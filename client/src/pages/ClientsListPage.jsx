import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

export default function ClientsListPage() {
    const { isAdmin } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState('');
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

    const filtered = clients.filter(c =>
        c.clientName.toLowerCase().includes(search.toLowerCase()) ||
        c.medicaidId.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Clients</h1>
                <div className="content-header__actions">
                    <div className="search-input" style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }}>{Icons.search}</span>
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: 36 }}
                        />
                    </div>
                    <button className="btn btn--primary btn--sm" onClick={() => setShowCreateModal(true)}>
                        {Icons.plus} Add Client
                    </button>
                </div>
            </div>
            <div className="page-content">
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
                                    <th>Client Name</th>
                                    <th>Medicaid ID</th>
                                    <th>Insurance Type</th>
                                    <th>Phone</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${c.id}`)}>
                                        <td style={{ fontWeight: 500 }}>
                                            {c.clientName}
                                            {c.critical && <span className="ts-badge ts-badge--critical" style={{ marginLeft: 6 }}>Critical</span>}
                                        </td>
                                        <td>{c.medicaidId || '\u2014'}</td>
                                        <td><span className="ts-badge ts-badge--draft">{c.insuranceType}</span></td>
                                        <td>{c.phone || '\u2014'}</td>
                                        <td>
                                            <button
                                                className="btn btn--ghost btn--icon"
                                                title="View care plan"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}
                                            >
                                                {Icons.eye}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
