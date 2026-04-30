import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import DrawerPanel from '../components/common/DrawerPanel';
import { fmtDate, daysClass } from '../utils/dates';
import { statusLabel } from '../utils/status';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton, EntityActivityButton } from '../components/common/ActivityDrawer';

// ── Client Form Modal ──
function ClientFormModal({ client, onSave, onClose, insuranceTypeNames }) {
    const [name, setName] = useState(client?.clientName || '');
    const [medicaidId, setMedicaidId] = useState(client?.medicaidId || '');
    const [insuranceType, setInsuranceType] = useState(client?.insuranceType || 'MEDICAID');
    const [address, setAddress] = useState(client?.address || '');
    const [phone, setPhone] = useState(client?.phone || '');
    const [gateCode, setGateCode] = useState(client?.gateCode || '');
    const [clientNotes, setClientNotes] = useState(client?.notes || '');
    const [enabledServices, setEnabledServices] = useState(() => {
        if (client?.enabledServices) {
            try {
                const parsed = JSON.parse(client.enabledServices);
                if (Array.isArray(parsed)) return parsed;
            } catch {}
        }
        return ['PAS', 'Homemaker'];
    });
    const isEdit = !!client;

    const toggleService = (svc) => {
        setEnabledServices((prev) =>
            prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
        );
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onSave({
            clientName: name.trim(),
            medicaidId: medicaidId.trim(),
            insuranceType,
            address,
            phone,
            gateCode,
            notes: clientNotes,
            enabledServices: JSON.stringify(enabledServices),
        });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Client' : 'Add New Client'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the client details below.' : 'Fill in the details to create a new client.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="clientName">Client Name</label>
                    <input id="clientName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter client name…" autoFocus required />
                </div>
                <div className="form-group">
                    <label htmlFor="medicaidId">Medicaid ID</label>
                    <input id="medicaidId" type="text" value={medicaidId} onChange={(e) => setMedicaidId(e.target.value)} placeholder="e.g. MED-001" />
                </div>
                <div className="form-group">
                    <label htmlFor="insuranceType">Insurance Type</label>
                    <select id="insuranceType" value={insuranceType} onChange={(e) => setInsuranceType(e.target.value)}>
                        {insuranceTypeNames.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="clientAddress">Address</label>
                        <input id="clientAddress" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address…" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="clientPhone">Phone</label>
                        <input id="clientPhone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone…" />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="clientGateCode">Gate Code</label>
                    <input id="clientGateCode" value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="Gate code…" />
                </div>
                <div className="form-group">
                    <label htmlFor="clientNotes">Notes</label>
                    <textarea id="clientNotes" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Notes…" rows={3} />
                </div>
                <div className="form-group">
                    <label>Enabled Services</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 4 }}>
                        {['PAS', 'Homemaker', 'Respite'].map((svc) => (
                            <label key={svc} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                                <input
                                    type="checkbox"
                                    checked={enabledServices.includes(svc)}
                                    onChange={() => toggleService(svc)}
                                />
                                {svc}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Client'}</button>
                </div>
            </form>
        </Modal>
    );
}

// ── Authorization Form Modal ──
function AuthFormModal({ auth, clientId, onSave, onClose }) {
    const [serviceCategory, setServiceCategory] = useState(auth?.serviceCategory || '');
    const [serviceCode, setServiceCode] = useState(auth?.serviceCode || 'PCS');
    const [serviceName, setServiceName] = useState(auth?.serviceName || '');
    const [authorizedUnits, setAuthorizedUnits] = useState(auth?.authorizedUnits || '');
    const [startDate, setStartDate] = useState(
        auth?.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : ''
    );
    const [endDate, setEndDate] = useState(
        auth?.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : ''
    );
    const [notes, setNotes] = useState(auth?.notes || '');
    const isEdit = !!auth;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            serviceCategory,
            serviceCode,
            serviceName,
            authorizedUnits: parseInt(authorizedUnits) || 0,
            authorizationStartDate: startDate || null,
            authorizationEndDate: endDate || null,
            notes,
        });
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{isEdit ? 'Edit Authorization' : 'Add Authorization'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the authorization details below.' : 'Fill in the service and date details.'}</p>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Service Category</label>
                        <input type="text" value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)} placeholder="PCS, WAIVER 58…" />
                    </div>
                    <div className="form-group">
                        <label>Service Code</label>
                        <select value={serviceCode} onChange={(e) => setServiceCode(e.target.value)}>
                            <option value="PCS">PCS</option>
                            <option value="SDPC">SDPC</option>
                            <option value="TIMESHEETS">TIMESHEETS</option>
                            <option value="S5125">S5125 — Attendant Care</option>
                            <option value="S5130">S5130 — Homemaker</option>
                            <option value="S5135">S5135 — Companion</option>
                            <option value="S5150">S5150 — Respite</option>
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <label>Service Name</label>
                    <input type="text" value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Personal Care Services" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Auth Units</label>
                        <input type="number" value={authorizedUnits} onChange={(e) => setAuthorizedUnits(e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                        <label>Auth Start</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Auth End</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                    </div>
                </div>
                <div className="form-group">
                    <label>Notes</label>
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Authorization'}</button>
                </div>
            </form>
        </Modal>
    );
}

// ── Bulk Import Modal ──
function BulkImportModal({ onImport, onClose }) {
    const fileRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('');

    const excelDateToString = (v, XLSXLib) => {
        if (!v && v !== 0) return '';
        if (typeof v === 'number' && XLSXLib) {
            const d = XLSXLib.SSF.parse_date_code(v);
            if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const str = String(v).trim();
        if (!str) return '';
        const dt = new Date(str);
        return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
    };

    const parseParentChildRows = (rawRows, XLSXLib) => {
        const clients = [];
        let current = null;

        for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            const hasContent = row.some(cell => cell !== '' && cell !== undefined && cell !== null);
            if (!hasContent) continue;

            const clientName = String(row[1] || '').trim();
            const medicaidId = String(row[2] || '').trim();
            const insuranceType = String(row[3] || '').trim();
            const serviceCategory = String(row[4] || '').trim();
            const serviceCode = String(row[5] || '').trim();
            const serviceName = String(row[6] || '').trim();
            const authorizedUnits = row[7];
            const authStart = row[8];
            const authEnd = row[9];
            const notes = String(row[12] || '').trim();

            if (clientName) {
                if (current) clients.push(current);
                current = {
                    clientName,
                    medicaidId,
                    insuranceType: insuranceType || 'MEDICAID',
                    authorizations: [],
                };
                continue;
            }

            if (current && serviceCode) {
                current.authorizations.push({
                    serviceCategory,
                    serviceCode,
                    serviceName: serviceName || serviceCode,
                    authorizedUnits: parseInt(authorizedUnits, 10) || 0,
                    authorizationStartDate: excelDateToString(authStart, XLSXLib),
                    authorizationEndDate: excelDateToString(authEnd, XLSXLib),
                    notes,
                });
            }
        }
        if (current) clients.push(current);
        return clients;
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'json') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
                    setPreview(parsed);
                    setError('');
                } catch (err) { setError('Invalid JSON: ' + err.message); setPreview(null); }
            };
            reader.readAsText(file);
        } else if (['csv', 'xlsx', 'xls'].includes(ext)) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const XLSX = await import('xlsx');
                    const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: false });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
                    if (!rawRows.length) throw new Error('Spreadsheet is empty');
                    const clients = parseParentChildRows(rawRows, XLSX);
                    if (!clients.length) throw new Error('No valid client rows found. Make sure column B has client names.');
                    setPreview(clients);
                    setError('');
                } catch (err) { setError(err.message); setPreview(null); }
            };
            reader.readAsArrayBuffer(file);
        } else {
            setError('Unsupported file type. Please use .csv, .xlsx, .xls, or .json');
            setPreview(null);
        }
    };

    const handleSubmit = () => {
        if (!preview) return;
        onImport(preview);
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Import Clients</h2>
            <p className="modal__desc">
                Upload a <strong>CSV</strong>, <strong>XLSX</strong>, or <strong>JSON</strong> file. Spreadsheets should have columns like: Client Name, Medicaid ID, Insurance Type, Service Code, Service Name, Authorized Units, Auth Start, Auth End.
            </p>

            <div className="form-group">
                <label>Choose File</label>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    onChange={handleFileUpload}
                    style={{ fontSize: 13 }}
                />
            </div>

            {fileName && !error && !preview && <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Parsing {fileName}…</p>}

            {error && <p style={{ color: 'hsl(0 84% 60%)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{Icons.alertCircle} {error}</p>}

            {preview && (
                <div style={{ marginBottom: 12 }}>
                    <p style={{ color: 'hsl(142 71% 45%)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        {Icons.checkCircle} {preview.length} client(s) ready to import ({preview.reduce((s, c) => s + (c.authorizations?.length || 0), 0)} authorization(s))
                    </p>
                    <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', fontSize: 12 }}>
                        <table className="data-table" style={{ fontSize: 12 }}>
                            <thead><tr><th>Client Name</th><th>Medicaid ID</th><th>Insurance</th><th>Authorizations</th></tr></thead>
                            <tbody>
                                {preview.slice(0, 20).map((c, i) => (
                                    <tr key={i}><td>{c.clientName}</td><td>{c.medicaidId}</td><td>{c.insuranceType}</td><td>{c.authorizations?.length || 0}</td></tr>
                                ))}
                                {preview.length > 20 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>…and {preview.length - 20} more</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="form-actions">
                <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button
                    className="btn btn--primary"
                    onClick={handleSubmit}
                    disabled={!preview}
                    style={{ opacity: preview ? 1 : 0.5 }}
                >
                    {Icons.upload} Import Data
                </button>
            </div>
        </Modal>
    );
}

// ── Client Notes Section (for Drawer) ──
function ClientNotesSection({ client, onSaved }) {
    const [address, setAddress] = useState(client.address || '');
    const [phone, setPhone] = useState(client.phone || '');
    const [gateCode, setGateCode] = useState(client.gateCode || '');
    const [notes, setNotes] = useState(client.notes || '');
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const hasChanges = address !== (client.address || '') || phone !== (client.phone || '')
        || gateCode !== (client.gateCode || '') || notes !== (client.notes || '');

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await api.patchClient(client.id, { address, phone, gateCode, notes });
            showToast('Client details saved');
            onSaved(updated);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="drawer-section">
            <h3 className="drawer-section__title">Client Details</h3>
            <div className="drawer-field">
                <label className="drawer-field__label">Address</label>
                <input className="drawer-field__input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Phone</label>
                <input className="drawer-field__input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Gate Code</label>
                <input className="drawer-field__input" value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="Gate code…" />
            </div>
            <div className="drawer-field">
                <label className="drawer-field__label">Notes</label>
                <textarea className="drawer-field__input drawer-field__textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…" />
            </div>
            {hasChanges && (
                <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Details'}
                </button>
            )}
        </div>
    );
}

// ── Clients Page ──
export default function ClientsPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const [clients, setClients] = useState([]);
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [statusFilter, setStatusFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [drawerClient, setDrawerClient] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showArchived, setShowArchived] = useState(false);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(null);
    const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);

    const fetchClients = useCallback(async () => {
        try {
            const data = await api.getClients({ archived: showArchived });
            setClients(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, showArchived]);

    const fetchInsuranceTypes = useCallback(async () => {
        try { setInsuranceTypes(await api.getInsuranceTypes()); }
        catch (_) { /* silent */ }
    }, []);

    useEffect(() => { fetchInsuranceTypes(); }, [fetchInsuranceTypes]);

    useEffect(() => { fetchClients(); }, [fetchClients]);

    const handleSaveClient = async (data) => {
        try {
            if (modal.client) {
                const updated = await api.updateClient(modal.client.id, data.clientName, data);
                showToast('Client updated');
                if (drawerClient?.id === modal.client.id) setDrawerClient(updated);
            } else {
                await api.createClient(data.clientName, data);
                showToast('Client created');
            }
            setModal(null);
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteClient = async (client) => {
        try {
            await api.deleteClient(client.id);
            setModal(null);
            fetchClients();
            showUndoToast(`"${client.clientName}" archived`, async () => {
                await api.restoreClient(client.id);
                fetchClients();
            });
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkDelete = async () => {
        try {
            const ids = [...selectedIds];
            await api.bulkDeleteClients(ids);
            setSelectedIds(new Set());
            setModal(null);
            fetchClients();
            showUndoToast(`${ids.length} client(s) archived`, async () => {
                for (const id of ids) await api.restoreClient(id);
                fetchClients();
            });
        } catch (err) { showToast(err.message, 'error'); }
    };

    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredClients.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredClients.map((c) => c.id)));
        }
    };

    const handleSaveAuth = async (data) => {
        try {
            if (modal.auth) {
                await api.updateAuthorization(modal.auth.id, data);
                showToast('Authorization updated');
            } else {
                await api.createAuthorization(modal.clientId, data);
                showToast('Authorization added');
            }
            setModal(null);
            const refreshed = await api.getClients();
            setClients(refreshed);
            if (drawerClient) {
                const updated = refreshed.find(c => c.id === drawerClient.id);
                if (updated) setDrawerClient(updated);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAuth = async (auth) => {
        try {
            await api.deleteAuthorization(auth.id);
            showToast('Authorization deleted');
            setModal(null);
            const refreshed = await api.getClients();
            setClients(refreshed);
            if (drawerClient) {
                const updated = refreshed.find(c => c.id === drawerClient.id);
                if (updated) setDrawerClient(updated);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestore = async (client) => {
        try {
            await api.restoreClient(client.id);
            showToast(`"${client.clientName}" restored`);
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (client) => {
        try {
            await api.permanentlyDeleteClient(client.id);
            setConfirmPermanentDelete(null);
            showToast('Item permanently deleted');
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeleteClients();
            setConfirmBulkPermanentDelete(false);
            showToast(`${result.count} archived client(s) permanently deleted`);
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkImport = async (rows) => {
        try {
            const result = await api.bulkImport(rows);
            showToast(`Imported ${result.imported} client(s)`);
            setClients(result.clients);
            setModal(null);
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Stats
    const totalAuths = clients.reduce((s, c) => s + c.authorizations.length, 0);
    const expiredCount = clients.filter((c) => c.overallStatus === 'Expired').length;
    const renewalCount = clients.filter((c) => c.overallStatus === 'Renewal Reminder').length;
    const okCount = clients.filter((c) => c.overallStatus === 'OK').length;

    // Filter + Search
    const searchLower = searchQuery.toLowerCase().trim();
    const filteredClients = clients.filter((c) => {
        const matchesStatus = statusFilter === 'All' || c.overallStatus === statusFilter;
        const matchesSearch = !searchLower || c.clientName.toLowerCase().includes(searchLower) || (c.medicaidId || '').toLowerCase().includes(searchLower);
        return matchesStatus && matchesSearch;
    });
    const displayedClients = filteredClients;

    const insuranceTypeNames = insuranceTypes.length > 0
        ? insuranceTypes.map((t) => t.name)
        : ['MEDICAID'];

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Clients</h1>
                <div className="content-header__actions">
                    {isAdmin && <ActivityButton entityType="Client" />}
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search clients…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {!showArchived && (
                        <button className="archive-toggle" onClick={() => { setShowArchived(true); setSelectedIds(new Set()); }}>
                            {Icons.archive} View Archived
                        </button>
                    )}
                    {!showArchived && selectedIds.size > 0 && (
                        <button className="btn btn--danger btn--sm" onClick={() => setModal({ type: 'confirmBulkDelete' })}>
                            {Icons.trash} Delete {selectedIds.size}
                        </button>
                    )}
                    {!showArchived && isAdmin && (
                        <button className="btn btn--outline btn--sm" onClick={() => setModal({ type: 'bulkImport' })}>
                            {Icons.download} Import
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'client' })}>
                            {Icons.plus} Add Client
                        </button>
                    )}
                </div>
            </div>

            <div className="page-content">
                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Total Clients</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value">{clients.length}</div>
                        <div className="card__description">Active client records</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Authorizations</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value">{totalAuths}</div>
                        <div className="card__description">Total service authorizations</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Expired</span>
                            {expiredCount > 0 && <span className="card__trend card__trend--down">{Icons.trendingDown} Needs attention</span>}
                        </div>
                        <div className="card__value" style={{ color: expiredCount > 0 ? 'hsl(0 84.2% 60.2%)' : undefined }}>{expiredCount}</div>
                        <div className="card__description">Clients with expired auths</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Active / OK</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value" style={{ color: okCount > 0 ? 'hsl(142 71% 45%)' : undefined }}>{okCount}</div>
                        <div className="card__description">{renewalCount > 0 ? `${renewalCount} renewal(s) due` : 'All auths current'}</div>
                    </div>
                </div>

                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived clients. Click "Restore" to bring items back.</span>
                        {clients.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirmBulkPermanentDelete(true)}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}

                {/* Master Sheet Table */}
                <div className="sheet-card">
                    <div className="sheet-card__header">
                        <div className="sheet-card__title">
                            {Icons.table} Master Sheet
                        </div>
                        <div className="sheet-card__actions" />
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="filter-bar">
                        {['All', 'OK', 'Renewal Reminder', 'Expired'].map((f) => {
                            const count = f === 'All' ? clients.length
                                : f === 'OK' ? okCount
                                    : f === 'Renewal Reminder' ? renewalCount
                                        : expiredCount;
                            return (
                                <button
                                    key={f}
                                    className={`filter-btn ${statusFilter === f ? 'filter-btn--active' : ''} ${f === 'Expired' ? 'filter-btn--danger' : f === 'Renewal Reminder' ? 'filter-btn--warning' : ''}`}
                                    onClick={() => setStatusFilter(f)}
                                >
                                    {f} <span className="filter-btn__count">{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {loading ? (
                        <div style={{ padding: 16 }}>
                            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />)}
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">{Icons.clipboard}</div>
                            <div className="empty-state__title">No clients yet</div>
                            <div className="empty-state__desc">Use "Import" to upload data or "Add Client" to create one.</div>
                        </div>
                    ) : (
                        <>
                            <div className="sheet-table-wrap">
                                <table className="sheet-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 36 }}>
                                                <input type="checkbox" checked={selectedIds.size === filteredClients.length && filteredClients.length > 0} onChange={toggleSelectAll} />
                                            </th>
                                            <th>Client Name</th>
                                            <th>Medicaid ID</th>
                                            <th>Insurance Type</th>
                                            <th>Status</th>
                                            <th>Days to Expire</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedClients.map((client) => {
                                            const minDays = client.authorizations.length > 0
                                                ? Math.min(...client.authorizations.map(a => a.daysToExpire).filter(d => d != null))
                                                : null;
                                            const isOpen = expandedIds.has(client.id);
                                            return (
                                                <Fragment key={client.id}>
                                                    <tr
                                                        className={`row-client row-client--${client.statusColor}`}
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => setDrawerClient(client)}
                                                    >
                                                        <td onClick={(e) => e.stopPropagation()}>
                                                            <input type="checkbox" checked={selectedIds.has(client.id)} onChange={() => toggleSelect(client.id)} />
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <button
                                                                    className={`row-client__toggle ${isOpen ? 'row-client__toggle--open' : ''}`}
                                                                    onClick={(e) => { e.stopPropagation(); setExpandedIds(prev => { const next = new Set(prev); next.has(client.id) ? next.delete(client.id) : next.add(client.id); return next; }); }}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'hsl(var(--muted-foreground))' }}
                                                                    title={isOpen ? 'Collapse' : 'Expand services'}
                                                                >
                                                                    {Icons.chevronRight}
                                                                </button>
                                                                <span className="row-client__client-name">{client.clientName}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ color: 'hsl(240 3.8% 46.1%)', fontSize: 12 }}>{client.medicaidId || '—'}</td>
                                                        <td><span className="insurance-badge">{client.insuranceType}</span></td>
                                                        <td>
                                                            <span className={`status-cell status-cell--${client.statusColor}`}>
                                                                {statusLabel(client.overallStatus)}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`days-cell ${daysClass(minDays)}`}>
                                                                {minDays != null && isFinite(minDays) ? minDays : '—'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                                {showArchived ? (
                                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                                        <button className="btn btn--restore" onClick={() => handleRestore(client)} title="Restore client">
                                                                            {Icons.rotateCcw} Restore
                                                                        </button>
                                                                        <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmPermanentDelete(client)} title="Delete permanently">{Icons.trash}</button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'client', client })} title="Edit client">
                                                                            {Icons.edit}
                                                                        </button>
                                                                        <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDeleteClient', client })} title="Delete client">
                                                                            {Icons.trash}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {isOpen && client.authorizations.map((auth) => (
                                                        <tr key={`a-${auth.id}`} className="row-auth">
                                                            <td style={{ paddingLeft: 36 }}>
                                                                <span style={{ color: 'hsl(var(--muted-foreground))', marginRight: 6 }}>└</span>
                                                                <span style={{ fontWeight: 600 }}>{auth.serviceCode}</span>
                                                                {auth.serviceName ? <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12, marginLeft: 6 }}>{auth.serviceName}</span> : null}
                                                            </td>
                                                            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{auth.authorizedUnits || 0} units</td>
                                                            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                                {fmtDate(auth.authorizationStartDate)} – {fmtDate(auth.authorizationEndDate)}
                                                            </td>
                                                            <td>
                                                                <span className={`status-cell status-cell--${auth.statusColor}`}>
                                                                    {statusLabel(auth.status)}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`days-cell ${daysClass(auth.daysToExpire)}`}>
                                                                    {auth.daysToExpire ?? '—'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div className="row-actions">
                                                                    <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'auth', auth, clientId: client.id })} title="Edit authorization">
                                                                        {Icons.edit}
                                                                    </button>
                                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDeleteAuth', auth })} title="Delete authorization">
                                                                        {Icons.trash}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {isOpen && client.authorizations.length === 0 && (
                                                        <tr className="row-auth">
                                                            <td colSpan={6} style={{ paddingLeft: 36, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', fontSize: 13 }}>
                                                                No services yet
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="table-info-bar">
                                <span>
                                    Showing {filteredClients.length} client(s)
                                    {statusFilter !== 'All' && ` (filtered: ${statusFilter})`}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            {modal?.type === 'client' && (
                <ClientFormModal client={modal.client} onSave={handleSaveClient} onClose={() => setModal(null)} insuranceTypeNames={insuranceTypeNames} />
            )}
            {modal?.type === 'auth' && (
                <AuthFormModal auth={modal.auth} clientId={modal.clientId} onSave={handleSaveAuth} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'bulkImport' && (
                <BulkImportModal onImport={handleBulkImport} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDeleteClient' && (
                <ConfirmModal
                    title="Delete Client"
                    message={`This will permanently delete "${modal.client.clientName}" and all associated authorizations. This action cannot be undone.`}
                    onConfirm={() => handleDeleteClient(modal.client)}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === 'confirmBulkDelete' && (
                <ConfirmModal
                    title="Delete Selected Clients"
                    message={`This will permanently delete ${selectedIds.size} client(s) and all their associated authorizations. This action cannot be undone.`}
                    onConfirm={handleBulkDelete}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === 'confirmDeleteAuth' && (
                <ConfirmModal
                    title="Delete Authorization"
                    message={`This will permanently delete this ${modal.auth.serviceCode} authorization. This action cannot be undone.`}
                    onConfirm={() => handleDeleteAuth(modal.auth)}
                    onClose={() => setModal(null)}
                />
            )}
            {confirmPermanentDelete && (
                <ConfirmModal
                    title="Permanently Delete Client"
                    message={`Permanently delete "${confirmPermanentDelete.clientName}" and all associated authorizations? This action cannot be undone.`}
                    confirmLabel="Delete Forever"
                    confirmVariant="danger"
                    onConfirm={() => handlePermanentDelete(confirmPermanentDelete)}
                    onClose={() => setConfirmPermanentDelete(null)}
                />
            )}
            {confirmBulkPermanentDelete && (
                <ConfirmModal
                    title="Delete All Archived Clients"
                    message={`Permanently delete all ${clients.length} archived client(s) and their authorizations? This action cannot be undone.`}
                    confirmLabel="Delete All Forever"
                    confirmVariant="danger"
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setConfirmBulkPermanentDelete(false)}
                />
            )}

            {/* Drawer Panel */}
            {drawerClient && (
                <DrawerPanel onClose={() => setDrawerClient(null)}>
                    <div className="drawer-header">
                        <h2 className="drawer-header__name">{drawerClient.clientName}</h2>
                        <div className="drawer-header__meta">
                            <span>{drawerClient.medicaidId}</span>
                            <span className="insurance-badge">{drawerClient.insuranceType}</span>
                        </div>
                        <button className="btn btn--outline btn--sm" style={{ marginTop: 8 }}
                            onClick={() => { setModal({ type: 'client', client: drawerClient }); }}>
                            {Icons.edit} Edit Client
                        </button>
                        {isAdmin && <EntityActivityButton entityType="Client" entityId={drawerClient.id} />}
                    </div>

                    <ClientNotesSection client={drawerClient} onSaved={(updated) => {
                        setDrawerClient(updated);
                        fetchClients();
                    }} />

                    <div className="drawer-section">
                        <h3 className="drawer-section__title">Authorizations</h3>
                        {(drawerClient.authorizations || []).length === 0 ? (
                            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>No authorizations yet.</p>
                        ) : (
                            <table className="drawer-auth-table">
                                <thead>
                                    <tr>
                                        <th>Service</th><th>Code</th><th>Units</th>
                                        <th>Start</th><th>End</th><th>Status</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(drawerClient.authorizations || []).map(auth => (
                                        <tr key={auth.id}>
                                            <td>{auth.serviceCategory || '—'}</td>
                                            <td>{auth.serviceCode}</td>
                                            <td>{auth.authorizedUnits}</td>
                                            <td>{fmtDate(auth.authorizationStartDate)}</td>
                                            <td>{fmtDate(auth.authorizationEndDate)}</td>
                                            <td><span className={`status-cell status-cell--${auth.statusColor}`}>{statusLabel(auth.status)}</span></td>
                                            <td>
                                                <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'auth', auth, clientId: drawerClient.id })} title="Edit">{Icons.edit}</button>
                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDeleteAuth', auth })} title="Delete" style={{ marginLeft: 4 }}>{Icons.trash}</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <button className="btn btn--outline btn--sm" style={{ marginTop: 10 }}
                            onClick={() => setModal({ type: 'auth', clientId: drawerClient.id })}>
                            + Add Authorization
                        </button>
                    </div>
                </DrawerPanel>
            )}
        </>
    );
}
