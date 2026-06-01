import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import DrawerPanel from '../components/common/DrawerPanel';
import ClientCreationWizard from '../components/ClientCreationWizard';
import { fmtDate, daysClass } from '../utils/dates';
import { statusLabel } from '../utils/status';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton, EntityActivityButton } from '../components/common/ActivityDrawer';

// ── Client Row 3-dot Menu (status + actions) ──
function ClientRowMenu({ client, onSetActive, onSetPending, onSetInactive, onEdit, onDelete }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const status = client.clientStatus || 'active';
    return (
        <div className="pa-three-dot" ref={ref} onClick={(e) => e.stopPropagation()}>
            <button className="pa-three-dot__btn" onClick={() => setOpen(!open)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {open && (
                <div className="pa-three-dot__menu">
                    <button className="pa-three-dot__item" onClick={() => { setOpen(false); onEdit(); }}>
                        {Icons.edit} Edit Client
                    </button>
                    <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '4px 0' }} />
                    {status !== 'active' && (
                        <button className="pa-three-dot__item" style={{ color: '#16a34a' }} onClick={() => { setOpen(false); onSetActive(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#16a34a" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                            Mark as Active
                        </button>
                    )}
                    {status !== 'pending' && (
                        <button className="pa-three-dot__item" style={{ color: '#d97706' }} onClick={() => { setOpen(false); onSetPending(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#d97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            Mark as Pending
                        </button>
                    )}
                    {status !== 'inactive' && (
                        <button className="pa-three-dot__item" style={{ color: '#dc2626' }} onClick={() => { setOpen(false); onSetInactive(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
                            Mark as Inactive
                        </button>
                    )}
                    <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '4px 0' }} />
                    <button className="pa-three-dot__item pa-three-dot__item--danger" onClick={() => { setOpen(false); onDelete(); }}>
                        {Icons.trash} Delete
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Auth Row 3-dot Menu ──
function AuthRowMenu({ onEdit, onMarkInactive, onMarkExpired, onDelete }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (
        <div className="pa-three-dot" ref={ref} onClick={(e) => e.stopPropagation()}>
            <button className="pa-three-dot__btn" onClick={() => setOpen(!open)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {open && (
                <div className="pa-three-dot__menu">
                    <button className="pa-three-dot__item" onClick={() => { setOpen(false); onEdit(); }}>
                        {Icons.edit} Edit
                    </button>
                    <button className="pa-three-dot__item" onClick={() => { setOpen(false); onMarkInactive(); }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
                        Mark as Inactive
                    </button>
                    <button className="pa-three-dot__item" style={{ color: '#d97706' }} onClick={() => { setOpen(false); onMarkExpired(); }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        <span style={{ color: '#d97706' }}>Mark as Expired</span>
                    </button>
                    <button className="pa-three-dot__item pa-three-dot__item--danger" onClick={() => { setOpen(false); onDelete(); }}>
                        {Icons.trash} Delete
                    </button>
                </div>
            )}
        </div>
    );
}

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
const ACCOUNT_NUMBER_OPTIONS = ['71040', '71120', '71119', '71635'];
const DEFAULT_ACCOUNT_BY_CODE = { PCS: '71040', SDPC: '71119', S5130: '71120', S5150: '71635' };
const SERVICE_CODE_COLORS = {
    PCS: '#22c55e',
    SDPC: '#8b5cf6',
    S5125: '#3b82f6',
    S5130: '#f59e0b',
    S5135: '#ec4899',
    S5150: '#06b6d4',
    TIMESHEETS: '#64748b',
};

function AuthFormModal({ auth, clientId, onSave, onClose, onRenewal, isRenewal }) {
    const [serviceCategory, setServiceCategory] = useState(auth?.serviceCategory || '');
    const [serviceCode, setServiceCode] = useState(auth?.serviceCode || 'PCS');
    const [serviceName, setServiceName] = useState(auth?.serviceName || '');
    const [authorizedUnits, setAuthorizedUnits] = useState(isRenewal ? '' : (auth?.authorizedUnits || ''));
    const [authorizationNumber, setAuthorizationNumber] = useState(isRenewal ? '' : (auth?.authorizationNumber || ''));
    const [accountNumber, setAccountNumber] = useState(auth?.accountNumber || DEFAULT_ACCOUNT_BY_CODE[auth?.serviceCode || 'PCS'] || '');
    const [startDate, setStartDate] = useState(
        !isRenewal && auth?.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : ''
    );
    const [endDate, setEndDate] = useState(
        !isRenewal && auth?.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : ''
    );
    const [notes, setNotes] = useState('');
    const [manualStatus, setManualStatus] = useState(isRenewal ? 'active' : (auth?.manualStatus || 'active'));
    const [files, setFiles] = useState([]);
    const isEdit = !!auth?.id;

    // Parse pasted date text into YYYY-MM-DD for date inputs
    const handleDatePaste = (setter) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        // Try YYYY-MM-DD or YYYY/MM/DD
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        // Try MM/DD/YYYY or MM-DD-YYYY
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        // Try Month DD, YYYY or Mon DD, YYYY (e.g. "May 8, 2026" or "January 15, 2026")
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setter(parsed);
        }
    };

    const handleServiceCodeChange = (newCode) => {
        setServiceCode(newCode);
        if (!accountNumber || Object.values(DEFAULT_ACCOUNT_BY_CODE).includes(accountNumber)) {
            setAccountNumber(DEFAULT_ACCOUNT_BY_CODE[newCode] || '');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (manualStatus === 'renewal' && isEdit && onRenewal) {
            onRenewal({
                oldAuthId: auth.id,
                clientId: auth.clientId || clientId,
                serviceCategory,
                serviceCode,
                serviceName,
                accountNumber,
            });
            return;
        }
        onSave({
            serviceCategory,
            serviceCode,
            serviceName,
            authorizationNumber,
            authorizedUnits: parseInt(authorizedUnits) || 0,
            authorizationStartDate: startDate || null,
            authorizationEndDate: endDate || null,
            notes,
            accountNumber,
            manualStatus,
            files,
        });
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{isRenewal ? 'Renew Authorization' : isEdit ? 'Edit Authorization' : 'Add Authorization'}</h2>
            <p className="modal__desc">{isRenewal ? 'Create a new authorization to replace the previous one.' : isEdit ? 'Update the authorization details below.' : 'Fill in the service and date details.'}</p>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Service Category</label>
                        <input type="text" value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)} placeholder="PCS, WAIVER 58…" />
                    </div>
                    <div className="form-group">
                        <label>Service Code</label>
                        <select value={serviceCode} onChange={(e) => handleServiceCodeChange(e.target.value)}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Service Name</label>
                        <input type="text" value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Personal Care Services" />
                    </div>
                    <div className="form-group">
                        <label>Account Number</label>
                        <select value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}>
                            <option value="">— Select —</option>
                            {ACCOUNT_NUMBER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Authorization Number</label>
                        <input type="text" value={authorizationNumber} onChange={(e) => setAuthorizationNumber(e.target.value)} placeholder="e.g. 45268348457" />
                    </div>
                    <div className="form-group">
                        <label>Auth Units</label>
                        <input type="number" value={authorizedUnits} onChange={(e) => setAuthorizedUnits(e.target.value)} placeholder="0" />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Auth Start</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onPaste={handleDatePaste(setStartDate)} />
                    </div>
                    <div className="form-group">
                        <label>Auth End</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onPaste={handleDatePaste(setEndDate)} required />
                    </div>
                </div>
                <div className="form-group">
                    <label>Notes</label>
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
                </div>
                <div className="form-group">
                    <label>Status</label>
                    <div className="auth-status-cards">
                        <label className={`auth-status-card ${manualStatus === 'active' ? 'auth-status-card--active' : ''}`}>
                            <input type="radio" name="authStatus" value="active" checked={manualStatus === 'active'} onChange={() => setManualStatus('active')} />
                            <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                            <span className="auth-status-card__label">Active</span>
                            <span className="auth-status-card__desc">Authorization is currently valid and in use.</span>
                        </label>
                        {isEdit && !isRenewal && (
                        <label className={`auth-status-card ${manualStatus === 'renewal' ? 'auth-status-card--renewal' : ''}`}>
                            <input type="radio" name="authStatus" value="renewal" checked={manualStatus === 'renewal'} onChange={() => setManualStatus('renewal')} />
                            <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                            <span className="auth-status-card__label" style={{ color: '#2563eb' }}>Renewal</span>
                            <span className="auth-status-card__desc">Move to history and create a new authorization.</span>
                        </label>
                        )}
                        <label className={`auth-status-card ${manualStatus === 'inactive' ? 'auth-status-card--inactive' : ''}`}>
                            <input type="radio" name="authStatus" value="inactive" checked={manualStatus === 'inactive'} onChange={() => setManualStatus('inactive')} />
                            <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                            <span className="auth-status-card__label">Inactive</span>
                            <span className="auth-status-card__desc">Authorization is no longer in use.</span>
                        </label>
                    </div>
                </div>
                <div className="form-group">
                    <label>Upload PA / Care Plan Documents</label>
                    <input
                        type="file"
                        multiple
                        onChange={(e) => setFiles(Array.from(e.target.files))}
                        style={{ fontSize: 13 }}
                    />
                    {files.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                            {files.length} file{files.length !== 1 ? 's' : ''} selected
                        </div>
                    )}
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
    const [file, setFile] = useState(null);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(ext)) {
            setError('Unsupported file type. Please use .xlsx, .xls, or .csv');
            setFile(null);
            return;
        }
        setFile(f);
        setError('');
    };

    const handleSubmit = async () => {
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            await onImport(file);
        } catch (err) {
            setError(err.message || 'Import failed');
        }
        setUploading(false);
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Import Clients & Authorizations</h2>
            <p className="modal__desc">
                Upload an <strong>XLSX</strong> or <strong>CSV</strong> file with the standard format (Client Name, Medicaid ID, Insurance Type, Service Code, etc.).
                Existing clients are matched by Medicaid ID and updated. New clients are created automatically.
            </p>

            <div className="form-group">
                <label>Choose File</label>
                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    style={{ fontSize: 13 }}
                />
            </div>

            {file && !error && (
                <p style={{ color: 'hsl(142 71% 45%)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex' }}>{Icons.checkCircle}</span> {file.name} selected — ready to import
                </p>
            )}

            {error && <p style={{ color: 'hsl(0 84% 60%)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex' }}>{Icons.alertCircle}</span> {error}</p>}

            <div className="form-actions">
                <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button
                    className="btn btn--primary"
                    onClick={handleSubmit}
                    disabled={!file || uploading}
                    style={{ opacity: file && !uploading ? 1 : 0.5 }}
                >
                    {Icons.upload} {uploading ? 'Importing...' : 'Import'}
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

// ── Inline Auth Note Editor ──
function AuthNoteIcon({ client, onClick }) {
    const hasNote = !!(client.notes && client.notes.trim());
    return (
        <span
            className={`auth-note-icon ${hasNote ? 'auth-note-icon--has-note' : 'auth-note-icon--empty'}`}
            onClick={(e) => { e.stopPropagation(); onClick(client); }}
            title={!hasNote ? 'Add note' : undefined}
        >
            {Icons.fileText}
            {hasNote && <span className="auth-note-tooltip">{client.notes}</span>}
        </span>
    );
}

function NoteDrawer({ client, onClose, onSaved }) {
    const [value, setValue] = useState(client.notes || '');
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const hasChanges = value !== (client.notes || '');

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await api.patchClient(client.id, { notes: value.trim() });
            onSaved(updated);
            showToast('Note saved');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <DrawerPanel onClose={onClose}>
            <div className="drawer-header">
                <h2 className="drawer-header__name">{client.clientName}</h2>
                <div className="drawer-header__meta">
                    <span>Authorization Note</span>
                </div>
            </div>
            <div className="drawer-section">
                <h3 className="drawer-section__title">Note</h3>
                <textarea
                    className="drawer-field__input drawer-field__textarea"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. Submitted on 05/01/2026"
                    rows={5}
                />
                {hasChanges && (
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ marginTop: 10 }}
                    >
                        {saving ? 'Saving…' : 'Save Note'}
                    </button>
                )}
            </div>
        </DrawerPanel>
    );
}

// ── Authorizations Page ──
export default function AuthorizationsPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const navigate = useNavigate();
    const [showCreateWizard, setShowCreateWizard] = useState(false);
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
    const [noteDrawerClient, setNoteDrawerClient] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState('clientName');
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
        setCurrentPage(1);
    };

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

    useEffect(() => { setCurrentPage(1); }, [statusFilter, searchQuery]);

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

    const handleDownloadDoc = async (doc) => {
        try {
            const blob = await api.downloadAuthDocument(doc.id);
            const url = URL.createObjectURL(blob);
            if (doc.mimeType === 'application/pdf' || doc.fileName?.toLowerCase().endsWith('.pdf')) {
                window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) { showToast('Failed to download file', 'error'); }
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
            const { files, ...authData } = data;
            let savedAuth;
            if (modal.auth) {
                savedAuth = await api.updateAuthorization(modal.auth.id, authData);
                showToast('Authorization updated');
            } else {
                savedAuth = await api.createAuthorization(modal.clientId, authData);
                showToast('Authorization added');
            }
            if (files && files.length > 0) {
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('file', file);
                    await api.uploadAuthDocument(savedAuth.id, formData);
                }
                showToast(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
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

    const handleMarkStatus = async (auth, newStatus) => {
        try {
            await api.updateAuthManualStatus(auth.id, newStatus);
            showToast(`Authorization marked as ${newStatus}`);
            const refreshed = await api.getClients();
            setClients(refreshed);
            if (drawerClient) {
                const updated = refreshed.find(c => c.id === drawerClient.id);
                if (updated) setDrawerClient(updated);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleClientStatus = async (client, newStatus) => {
        try {
            await api.patchClient(client.id, { clientStatus: newStatus });
            showToast(`Client marked as ${newStatus}`);
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

    const handleBulkImport = async (file) => {
        try {
            const result = await api.bulkImport(file);
            showToast(`Import complete: ${result.clientsCreated} new clients, ${result.clientsUpdated} updated, ${result.authsCreated} new authorizations`);
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
    const insuranceTypeNames = insuranceTypes.length > 0
        ? insuranceTypes.map((t) => t.name)
        : ['MEDICAID'];

    // Sorting
    const STATUS_SORT_RANK = { 'Expired': 0, 'Renewal Reminder': 1, 'OK': 2 };
    const getMinDays = (c) => {
        const days = c.authorizations.map(a => a.daysToExpire).filter(d => d != null);
        return days.length > 0 ? Math.min(...days) : Infinity;
    };
    const sortedClients = [...filteredClients].sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
            case 'clientName':
                cmp = (a.clientName || '').localeCompare(b.clientName || '');
                break;
            case 'medicaidId':
                cmp = (a.medicaidId || '').localeCompare(b.medicaidId || '');
                break;
            case 'insuranceType':
                cmp = (a.insuranceType || '').localeCompare(b.insuranceType || '');
                break;
            case 'status':
                cmp = (STATUS_SORT_RANK[a.overallStatus] ?? 3) - (STATUS_SORT_RANK[b.overallStatus] ?? 3);
                break;
            case 'daysToExpire':
                cmp = getMinDays(a) - getMinDays(b);
                break;
            default:
                cmp = 0;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    // Pagination
    const totalPages = Math.ceil(sortedClients.length / rowsPerPage);
    const paginatedClients = sortedClients.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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

    const renderPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + maxVisible - 1);
        if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

        if (start > 1) {
            pages.push(<button key={1} className="pagination-bar__page" onClick={() => setCurrentPage(1)}>1</button>);
            if (start > 2) pages.push(<span key="ds" className="pagination-bar__page pagination-bar__page--dots">...</span>);
        }
        for (let i = start; i <= end; i++) {
            pages.push(
                <button key={i} className={`pagination-bar__page ${i === currentPage ? 'pagination-bar__page--active' : ''}`} onClick={() => setCurrentPage(i)}>{i}</button>
            );
        }
        if (end < totalPages) {
            if (end < totalPages - 1) pages.push(<span key="de" className="pagination-bar__page pagination-bar__page--dots">...</span>);
            pages.push(<button key={totalPages} className="pagination-bar__page" onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>);
        }
        return pages;
    };

    return (
        <>
            {/* Page Hero Header */}
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">
                        {Icons.clipboard}
                    </div>
                    <div>
                        <div className="page-hero__title">Master Sheet</div>
                        <div className="page-hero__subtitle">Manage and track all client information</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    <input
                        type="text"
                        className="page-hero__search"
                        placeholder="Search client name, Medicaid ID, or status..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {isAdmin && <ActivityButton entityType="Client" />}
                    {!showArchived && (
                        <button className="btn btn--outline" onClick={() => { setShowArchived(true); setSelectedIds(new Set()); }}>
                            {Icons.archive} Archived
                        </button>
                    )}
                    {!showArchived && selectedIds.size > 0 && (
                        <button className="btn btn--danger btn--sm" onClick={() => setModal({ type: 'confirmBulkDelete' })}>
                            {Icons.trash} Delete {selectedIds.size}
                        </button>
                    )}
                    {!showArchived && isAdmin && (
                        <button className="btn btn--outline" onClick={() => setModal({ type: 'bulkImport' })}>
                            {Icons.upload} Import
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary" onClick={() => setShowCreateWizard(true)}>
                            {Icons.plus} Add Client
                        </button>
                    )}
                </div>
            </div>

            <div className="page-content">
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

                {!showArchived && (
                    <div className="stats-grid">
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Total Clients</span>
                                <span className="card__icon">{Icons.users}</span>
                            </div>
                            <div className="card__value">{clients.length}</div>
                            <div className="card__description">{totalAuths} active authorizations</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">OK</span>
                                <span className="card__icon text-success">{Icons.checkCircle}</span>
                            </div>
                            <div className="card__value text-success">{okCount}</div>
                            <div className="card__description">Authorizations current</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Renewal Reminder</span>
                                <span className="card__icon text-warning">{Icons.alertTriangle}</span>
                            </div>
                            <div className="card__value text-warning">{renewalCount}</div>
                            <div className="card__description">Due for renewal soon</div>
                        </div>
                        <div className="card">
                            <div className="card__header">
                                <span className="card__title">Expired</span>
                                <span className="card__icon text-destructive">{Icons.alertTriangle}</span>
                            </div>
                            <div className="card__value text-destructive">{expiredCount}</div>
                            <div className="card__description">Requires immediate action</div>
                        </div>
                    </div>
                )}

                {/* Master Sheet Table */}
                <div className="sheet-card">
                    {/* Filter Pills */}
                    <div className="filter-pills">
                        {[
                            { key: 'All', color: '', count: clients.length },
                            { key: 'OK', color: 'green', count: okCount },
                            { key: 'Renewal Reminder', color: 'orange', count: renewalCount },
                            { key: 'Expired', color: 'red', count: expiredCount },
                        ].map(({ key, color, count }) => (
                            <button
                                key={key}
                                className={`filter-pill ${color ? `filter-pill--${color}` : ''} ${statusFilter === key ? 'filter-pill--active' : ''}`}
                                onClick={() => setStatusFilter(key)}
                            >
                                <span className="filter-pill__dot" />
                                {key}
                                <span className="filter-pill__count">{count}</span>
                            </button>
                        ))}
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
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col" style={{ width: 36 }}>
                                                <input type="checkbox" checked={selectedIds.size === filteredClients.length && filteredClients.length > 0} onChange={toggleSelectAll} />
                                            </th>
                                            <th scope="col" onClick={() => handleSort('clientName')} style={{ cursor: 'pointer' }}>
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                                    Client Name
                                                    <span className={`th-sort${sortField === 'clientName' ? ' th-sort--active' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortField === 'clientName' && sortDir === 'asc' ? <path d="M7 9l5-5 5 5"/> : sortField === 'clientName' && sortDir === 'desc' ? <path d="M7 15l5 5 5-5"/> : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}</svg></span>
                                                </span>
                                            </th>
                                            <th scope="col" onClick={() => handleSort('medicaidId')} style={{ cursor: 'pointer' }}>
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h4"/></svg>
                                                    Medicaid ID
                                                    <span className={`th-sort${sortField === 'medicaidId' ? ' th-sort--active' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortField === 'medicaidId' && sortDir === 'asc' ? <path d="M7 9l5-5 5 5"/> : sortField === 'medicaidId' && sortDir === 'desc' ? <path d="M7 15l5 5 5-5"/> : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}</svg></span>
                                                </span>
                                            </th>
                                            <th scope="col" onClick={() => handleSort('insuranceType')} style={{ cursor: 'pointer' }}>
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                                    Insurance Type
                                                    <span className={`th-sort${sortField === 'insuranceType' ? ' th-sort--active' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortField === 'insuranceType' && sortDir === 'asc' ? <path d="M7 9l5-5 5 5"/> : sortField === 'insuranceType' && sortDir === 'desc' ? <path d="M7 15l5 5 5-5"/> : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}</svg></span>
                                                </span>
                                            </th>
                                            <th scope="col" onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                                    Status
                                                    <span className={`th-sort${sortField === 'status' ? ' th-sort--active' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortField === 'status' && sortDir === 'asc' ? <path d="M7 9l5-5 5 5"/> : sortField === 'status' && sortDir === 'desc' ? <path d="M7 15l5 5 5-5"/> : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}</svg></span>
                                                </span>
                                            </th>
                                            <th scope="col" onClick={() => handleSort('daysToExpire')} style={{ cursor: 'pointer' }}>
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                                    Days to Expire
                                                    <span className={`th-sort${sortField === 'daysToExpire' ? ' th-sort--active' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortField === 'daysToExpire' && sortDir === 'asc' ? <path d="M7 9l5-5 5 5"/> : sortField === 'daysToExpire' && sortDir === 'desc' ? <path d="M7 15l5 5 5-5"/> : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}</svg></span>
                                                </span>
                                            </th>
                                            <th scope="col">
                                                <span className="th-content">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                                                    Actions
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedClients.map((client) => {
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
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <div className="client-avatar" style={{ background: getAvatarColor(client.clientName) }}>
                                                                    {getInitials(client.clientName)}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <button
                                                                        className={`row-client__toggle ${isOpen ? 'row-client__toggle--open' : ''}`}
                                                                        onClick={(e) => { e.stopPropagation(); setExpandedIds(prev => { const next = new Set(prev); next.has(client.id) ? next.delete(client.id) : next.add(client.id); return next; }); }}
                                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'hsl(var(--muted-foreground))' }}
                                                                        title={isOpen ? 'Collapse' : 'Expand services'}
                                                                    >
                                                                        {Icons.chevronRight}
                                                                    </button>
                                                                    <span className={`row-client__client-name ${client.notes?.trim() ? 'row-client__client-name--has-note' : ''}`}>
                                                                        {client.clientName}
                                                                    </span>
                                                                    <AuthNoteIcon client={client} onClick={setNoteDrawerClient} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ color: 'hsl(240 3.8% 46.1%)', fontSize: 13 }}>{client.medicaidId || '—'}</td>
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
                                                                        <button
                                                                            className="btn btn--ghost btn--icon"
                                                                            onClick={() => setModal({ type: 'client', client })}
                                                                            title="Edit client"
                                                                        >
                                                                            {Icons.edit}
                                                                        </button>
                                                                        <ClientRowMenu
                                                                            client={client}
                                                                            onEdit={() => setModal({ type: 'client', client })}
                                                                            onSetActive={() => handleClientStatus(client, 'active')}
                                                                            onSetPending={() => handleClientStatus(client, 'pending')}
                                                                            onSetInactive={() => handleClientStatus(client, 'inactive')}
                                                                            onDelete={() => setModal({ type: 'confirmDeleteClient', client })}
                                                                        />
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {isOpen && (() => {
                                                        const activeAuths = client.authorizations.filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt);
                                                        if (activeAuths.length === 0) return (
                                                            <tr className="row-auth">
                                                                <td colSpan={7} style={{ paddingLeft: 36, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', fontSize: 13 }}>
                                                                    No active authorizations
                                                                </td>
                                                            </tr>
                                                        );
                                                        return (
                                                            <>
                                                                <tr className="row-auth row-auth--title">
                                                                    <td></td>
                                                                    <td colSpan={6} style={{ fontSize: 12, fontWeight: 700, padding: '8px 0 4px' }}>
                                                                        Active Authorizations ({activeAuths.length})
                                                                    </td>
                                                                </tr>
                                                                <tr className="row-auth row-auth--header">
                                                                    <td colSpan={1}></td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Service Code</td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Authorization #</td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Service Dates</td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Units</td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Attachment</td>
                                                                    <td style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Added On</td>
                                                                    <td></td>
                                                                </tr>
                                                                {activeAuths.map((auth) => (
                                                                    <tr key={`a-${auth.id}`} className="row-auth">
                                                                        <td></td>
                                                                        <td style={{ fontSize: 12, fontWeight: 700, color: SERVICE_CODE_COLORS[auth.serviceCode] || '#64748b' }}>{auth.serviceCode}</td>
                                                                        <td style={{ fontSize: 13, fontWeight: 500 }}>
                                                                            {auth.authorizationNumber || '—'}
                                                                        </td>
                                                                        <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                                            {fmtDate(auth.authorizationStartDate)} - {fmtDate(auth.authorizationEndDate)}
                                                                        </td>
                                                                        <td style={{ fontSize: 13, fontWeight: 500 }}>{auth.authorizedUnits || 0}</td>
                                                                        <td>
                                                                            {(auth.documents || []).length > 0 ? (
                                                                                <span
                                                                                    className="auth-attachment-link"
                                                                                    title={(auth.documents || []).map(d => d.fileName).join(', ')}
                                                                                    onClick={(e) => { e.stopPropagation(); handleDownloadDoc((auth.documents || [])[0]); }}
                                                                                    style={{ cursor: 'pointer' }}
                                                                                >
                                                                                    {Icons.paperclip} {(() => {
                                                                                        const name = (auth.documents || [])[0]?.fileName || 'file';
                                                                                        const withoutExt = name.replace(/\.[^.]+$/, '');
                                                                                        return withoutExt.replace(/[_-]/g, ' ');
                                                                                    })()}
                                                                                    {(auth.documents || []).length > 1 && (
                                                                                        <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>+{(auth.documents || []).length - 1}</span>
                                                                                    )}
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>—</span>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                                            {fmtDate(auth.createdAt)}
                                                                        </td>
                                                                        <td>
                                                                            <AuthRowMenu
                                                                                onEdit={() => setModal({ type: 'auth', auth, clientId: client.id })}
                                                                                onMarkInactive={() => handleMarkStatus(auth, 'inactive')}
                                                                                onMarkExpired={() => handleMarkStatus(auth, 'expired')}
                                                                                onDelete={() => setModal({ type: 'confirmDeleteAuth', auth })}
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </>
                                                        );
                                                    })()}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Bar */}
                            <div className="pagination-bar">
                                <div className="pagination-bar__info">
                                    Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredClients.length)} of {filteredClients.length} clients
                                </div>
                                <div className="pagination-bar__controls">
                                    <div className="pagination-bar__pages">
                                        <button className="pagination-bar__nav" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                                        </button>
                                        {renderPageNumbers()}
                                        <button className="pagination-bar__nav" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    </div>
                                    <div className="pagination-bar__rpp">
                                        Rows per page
                                        <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            {showCreateWizard && (
                <ClientCreationWizard
                    onClose={() => setShowCreateWizard(false)}
                    onCreated={(client) => { setShowCreateWizard(false); navigate(`/clients/${client.id}`); }}
                    insuranceTypes={insuranceTypes}
                />
            )}
            {modal?.type === 'client' && modal.client && (
                <ClientFormModal client={modal.client} onSave={handleSaveClient} onClose={() => setModal(null)} insuranceTypeNames={insuranceTypeNames} />
            )}
            {modal?.type === 'auth' && (
                <AuthFormModal
                    auth={modal.auth}
                    clientId={modal.clientId}
                    isRenewal={modal.isRenewal}
                    onSave={handleSaveAuth}
                    onClose={() => setModal(null)}
                    onRenewal={async ({ oldAuthId, clientId: cId, serviceCategory, serviceCode, serviceName, accountNumber }) => {
                        try {
                            await api.updateAuthManualStatus(oldAuthId, 'inactive');
                            showToast('Previous authorization moved to history');
                            const refreshed = await api.getClients();
                            setClients(refreshed);
                            if (drawerClient) {
                                const updated = refreshed.find(c => c.id === drawerClient.id);
                                if (updated) setDrawerClient(updated);
                            }
                            setModal({
                                type: 'auth',
                                auth: { serviceCategory, serviceCode, serviceName, accountNumber, manualStatus: 'active' },
                                clientId: cId,
                                isRenewal: true,
                            });
                        } catch (err) { showToast(err.message, 'error'); }
                    }}
                />
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
                            <table className="data-table data-table--compact">
                                <thead>
                                    <tr>
                                        <th scope="col">Service</th><th scope="col">Code</th><th scope="col">Units</th>
                                        <th scope="col">Start</th><th scope="col">End</th><th scope="col">Status</th><th scope="col"></th>
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

            {noteDrawerClient && (
                <NoteDrawer
                    client={noteDrawerClient}
                    onClose={() => setNoteDrawerClient(null)}
                    onSaved={(updated) => {
                        setClients(prev => prev.map(c => c.id === updated.id ? { ...c, notes: updated.notes } : c));
                        if (drawerClient?.id === updated.id) setDrawerClient(prev => ({ ...prev, notes: updated.notes }));
                        setNoteDrawerClient(prev => ({ ...prev, notes: updated.notes }));
                    }}
                />
            )}
        </>
    );
}
