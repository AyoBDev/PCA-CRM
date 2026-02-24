import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';

// ────────────────────────────────────────
// Constants
// ────────────────────────────────────────

// ────────────────────────────────────────
// SVG Icons (Lucide-style)
// ────────────────────────────────────────
const Icons = {
    clipboard: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
    ),
    layoutDashboard: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
    ),
    users: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    shieldCheck: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
        </svg>
    ),
    fileText: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
        </svg>
    ),
    settings: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
        </svg>
    ),
    helpCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
        </svg>
    ),
    search: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
    ),
    plus: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
    ),
    download: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
        </svg>
    ),
    edit: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        </svg>
    ),
    trash: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
    ),
    checkCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
        </svg>
    ),
    alertCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
    ),
    trendingUp: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
    ),
    trendingDown: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />
        </svg>
    ),
    chevronRight: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
        </svg>
    ),
    upload: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
        </svg>
    ),
    table: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" />
        </svg>
    ),
    user: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
    ),
    logOut: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
        </svg>
    ),
    share: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
        </svg>
    ),
    copy: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
    ),
};

// ────────────────────────────────────────
// Utilities
// ────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric', month: 'numeric', day: 'numeric',
    });
}

function daysClass(days) {
    if (days < 0) return 'days-cell--expired';
    if (days <= 60) return 'days-cell--warning';
    return 'days-cell--positive';
}

function statusLabel(s) {
    if (s === 'OK') return 'OK';
    if (s === 'Renewal Reminder') return 'Renewal Reminder';
    if (s === 'Expired') return 'Expired';
    return s;
}

// ────────────────────────────────────────
// Toast
// ────────────────────────────────────────
function Toast({ message, type, onClose }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3000);
        return () => clearTimeout(t);
    }, [onClose]);
    return (
        <div className={`toast toast--${type}`}>
            {type === 'success' ? Icons.checkCircle : Icons.alertCircle}
            {message}
        </div>
    );
}

// ────────────────────────────────────────
// Modal
// ────────────────────────────────────────
function Modal({ children, onClose, wide }) {
    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`modal${wide ? ' modal--wide' : ''}`}>{children}</div>
        </div>
    );
}

// ────────────────────────────────────────
// Client Form Modal
// ────────────────────────────────────────
function ClientFormModal({ client, onSave, onClose, insuranceTypeNames }) {
    const [name, setName] = useState(client?.clientName || '');
    const [medicaidId, setMedicaidId] = useState(client?.medicaidId || '');
    const [insuranceType, setInsuranceType] = useState(client?.insuranceType || 'MEDICAID');
    const isEdit = !!client;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onSave({ clientName: name.trim(), medicaidId: medicaidId.trim(), insuranceType });
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
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Client'}</button>
                </div>
            </form>
        </Modal>
    );
}

// ────────────────────────────────────────
// Authorization Form Modal
// ────────────────────────────────────────
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
        if (!endDate) return;
        onSave({
            serviceCategory,
            serviceCode,
            serviceName,
            authorizedUnits: parseInt(authorizedUnits) || 0,
            authorizationStartDate: startDate || null,
            authorizationEndDate: endDate,
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

// ────────────────────────────────────────
// Bulk Import Modal
// ────────────────────────────────────────
function BulkImportModal({ onImport, onClose }) {
    const fileRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('');

    // Column-name aliases so we can accept many header variations
    const colMap = {
        'clientname': 'clientName', 'client name': 'clientName', 'client': 'clientName', 'name': 'clientName',
        'medicaidid': 'medicaidId', 'medicaid id': 'medicaidId', 'medicaid': 'medicaidId', 'medicaid_id': 'medicaidId',
        'insurancetype': 'insuranceType', 'insurance type': 'insuranceType', 'insurance': 'insuranceType', 'insurance_type': 'insuranceType',
        'servicecategory': 'serviceCategory', 'service category': 'serviceCategory', 'service_category': 'serviceCategory', 'category': 'serviceCategory',
        'servicecode': 'serviceCode', 'service code': 'serviceCode', 'service_code': 'serviceCode', 'code': 'serviceCode',
        'servicename': 'serviceName', 'service name': 'serviceName', 'service_name': 'serviceName', 'service': 'serviceName',
        'authorizedunits': 'authorizedUnits', 'authorized units': 'authorizedUnits', 'authorized_units': 'authorizedUnits', 'units': 'authorizedUnits', 'auth units': 'authorizedUnits',
        'authorizationstartdate': 'authorizationStartDate', 'authorization start date': 'authorizationStartDate', 'auth start': 'authorizationStartDate', 'start date': 'authorizationStartDate', 'auth_start': 'authorizationStartDate', 'authstart': 'authorizationStartDate',
        'authorizationenddate': 'authorizationEndDate', 'authorization end date': 'authorizationEndDate', 'auth end': 'authorizationEndDate', 'end date': 'authorizationEndDate', 'auth_end': 'authorizationEndDate', 'authend': 'authorizationEndDate',
        'notes': 'notes',
    };

    const normalizeKey = (k) => colMap[(k || '').trim().toLowerCase()] || k;

    const excelDateToString = (v) => {
        if (!v) return '';
        if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v);
            if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        return String(v);
    };

    // Group flat rows by clientName → array of authorizations
    const rowsToClients = (rows) => {
        const map = {};
        for (const raw of rows) {
            const row = {};
            for (const [k, v] of Object.entries(raw)) { row[normalizeKey(k)] = v; }
            const name = (row.clientName || '').toString().trim();
            if (!name) continue;
            if (!map[name]) map[name] = { clientName: name, medicaidId: (row.medicaidId || '').toString().trim(), insuranceType: (row.insuranceType || 'MEDICAID').toString().trim(), authorizations: [] };
            if (row.serviceCode || row.serviceCategory || row.serviceName) {
                map[name].authorizations.push({
                    serviceCategory: (row.serviceCategory || '').toString().trim(),
                    serviceCode: (row.serviceCode || '').toString().trim(),
                    serviceName: (row.serviceName || '').toString().trim(),
                    authorizedUnits: Number(row.authorizedUnits) || 0,
                    authorizationStartDate: excelDateToString(row.authorizationStartDate),
                    authorizationEndDate: excelDateToString(row.authorizationEndDate),
                    notes: (row.notes || '').toString().trim(),
                });
            }
        }
        return Object.values(map);
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
            reader.onload = (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: false });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    if (!rows.length) throw new Error('Spreadsheet is empty');
                    const clients = rowsToClients(rows);
                    if (!clients.length) throw new Error('No valid client rows found. Make sure a "Client Name" column exists.');
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

// ────────────────────────────────────────
// Confirm Modal
// ────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onClose }) {
    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{title}</h2>
            <p className="modal__desc">{message}</p>
            <div className="form-actions">
                <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button className="btn btn--danger" onClick={onConfirm}>
                    {Icons.trash} Delete
                </button>
            </div>
        </Modal>
    );
}

// ────────────────────────────────────────
// Insurance Type Form Modal
// ────────────────────────────────────────
function InsuranceTypeFormModal({ insuranceType, onSave, onClose }) {
    const [name, setName] = useState(insuranceType?.name || '');
    const [color, setColor] = useState(insuranceType?.color || '#9E9E9E');
    const isEdit = !!insuranceType;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim().toUpperCase(), color });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Insurance Type' : 'Add Insurance Type'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the insurance type details.' : 'Create a new insurance type.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="itName">Name</label>
                    <input id="itName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MEDICAID" autoFocus required />
                </div>
                <div className="form-group">
                    <label htmlFor="itColor">Color</label>
                    <div className="color-picker-row">
                        <input
                            id="itColor"
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="color-picker-input"
                        />
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            placeholder="#000000"
                            style={{ flex: 1 }}
                        />
                        <span className="color-preview" style={{ background: color }} />
                    </div>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Type'}</button>
                </div>
            </form>
        </Modal>
    );
}

// ────────────────────────────────────────
// Insurance Types Page
// ────────────────────────────────────────
function InsuranceTypesPage({ insuranceTypes, onRefresh, showToast }) {
    const [modal, setModal] = useState(null);

    const handleSave = async (data) => {
        try {
            if (modal.insuranceType) {
                await api.updateInsuranceType(modal.insuranceType.id, data);
                showToast('Insurance type updated');
            } else {
                await api.createInsuranceType(data);
                showToast('Insurance type created');
            }
            setModal(null);
            onRefresh();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (type) => {
        try {
            await api.deleteInsuranceType(type.id);
            showToast('Insurance type deleted');
            setModal(null);
            onRefresh();
        } catch (err) { showToast(err.message, 'error'); }
    };

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Insurance Types</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'form' })}>
                        {Icons.plus} Add Type
                    </button>
                </div>
            </div>
            <div className="page-content">
                <div className="it-grid">
                    {insuranceTypes.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">{Icons.shieldCheck}</div>
                            <div className="empty-state__title">No insurance types yet</div>
                            <div className="empty-state__desc">Click "Add Type" to create one.</div>
                        </div>
                    ) : (
                        insuranceTypes.map((t) => (
                            <div key={t.id} className="it-card">
                                <div className="it-card__color" style={{ background: t.color }} />
                                <div className="it-card__info">
                                    <div className="it-card__name">{t.name}</div>
                                    <div className="it-card__hex">{t.color}</div>
                                </div>
                                <div className="it-card__actions">
                                    <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', insuranceType: t })} title="Edit">
                                        {Icons.edit}
                                    </button>
                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', insuranceType: t })} title="Delete">
                                        {Icons.trash}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {modal?.type === 'form' && (
                <InsuranceTypeFormModal insuranceType={modal.insuranceType} onSave={handleSave} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Insurance Type"
                    message={`This will permanently delete "${modal.insuranceType.name}". This action cannot be undone.`}
                    onConfirm={() => handleDelete(modal.insuranceType)}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}

// ────────────────────────────────────────
// Service Form Modal
// ────────────────────────────────────────
function ServiceFormModal({ service, onSave, onClose }) {
    const [category, setCategory] = useState(service?.category || '');
    const [code, setCode] = useState(service?.code || '');
    const [name, setName] = useState(service?.name || '');
    const isEdit = !!service;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (code.trim()) onSave({ category: category.trim().toUpperCase(), code: code.trim().toUpperCase(), name: name.trim() });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Service' : 'Add Service'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the service details.' : 'Create a new service entry.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="svcCategory">Category</label>
                    <input id="svcCategory" type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. PCS" />
                </div>
                <div className="form-group">
                    <label htmlFor="svcCode">Code</label>
                    <input id="svcCode" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. S5130" autoFocus required />
                </div>
                <div className="form-group">
                    <label htmlFor="svcName">Name</label>
                    <input id="svcName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Homemaker" />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Service'}</button>
                </div>
            </form>
        </Modal>
    );
}

// ────────────────────────────────────────
// Services Page
// ────────────────────────────────────────
function ServicesPage({ services, onRefresh, showToast }) {
    const [modal, setModal] = useState(null);

    const handleSave = async (data) => {
        try {
            if (modal.service) {
                await api.updateService(modal.service.id, data);
                showToast('Service updated');
            } else {
                await api.createService(data);
                showToast('Service created');
            }
            setModal(null);
            onRefresh();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (svc) => {
        try {
            await api.deleteService(svc.id);
            showToast('Service deleted');
            setModal(null);
            onRefresh();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Group by category
    const grouped = services.reduce((acc, s) => {
        (acc[s.category] = acc[s.category] || []).push(s);
        return acc;
    }, {});

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Services</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'form' })}>
                        {Icons.plus} Add Service
                    </button>
                </div>
            </div>
            <div className="page-content">
                {services.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">No services yet</div>
                        <div className="empty-state__desc">Click "Add Service" to create one.</div>
                    </div>
                ) : (
                    Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat} className="svc-group">
                            <div className="svc-group__label">{cat}</div>
                            <div className="it-grid">
                                {items.map((s) => (
                                    <div key={s.id} className="it-card">
                                        <div className="svc-code-badge">{s.code}</div>
                                        <div className="it-card__info">
                                            <div className="it-card__name">{s.name || s.code}</div>
                                            <div className="it-card__hex">{s.category} · {s.code}</div>
                                        </div>
                                        <div className="it-card__actions">
                                            <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', service: s })} title="Edit">
                                                {Icons.edit}
                                            </button>
                                            <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', service: s })} title="Delete">
                                                {Icons.trash}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {modal?.type === 'form' && (
                <ServiceFormModal service={modal.service} onSave={handleSave} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Service"
                    message={`This will permanently delete "${modal.service.code}${modal.service.name ? ' — ' + modal.service.name : ''}". This action cannot be undone.`}
                    onConfirm={() => handleDelete(modal.service)}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}

// ────────────────────────────────────────
// Signature Pad
// ────────────────────────────────────────
function SignaturePad({ label, value, onChange, disabled }) {
    const canvasRef = useRef(null);
    const drawing = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (value) {
            const img = new Image();
            img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
            img.src = value;
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [value]);

    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const start = (e) => { if (disabled) return; e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const draw = (e) => { if (!drawing.current || disabled) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const { x, y } = getPos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#18181b'; ctx.lineTo(x, y); ctx.stroke(); };
    const end = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current.toDataURL()); };
    const clear = () => { if (disabled) return; const ctx = canvasRef.current.getContext('2d'); ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); onChange(''); };

    return (
        <div className="signature-pad-wrap">
            <div className="signature-pad__label">{label}</div>
            <canvas ref={canvasRef} width={400} height={120}
                className={`signature-pad__canvas ${disabled ? 'signature-pad__canvas--disabled' : ''}`}
                onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={draw} onTouchEnd={end} />
            {!disabled && <button type="button" className="btn btn--outline btn--xs" onClick={clear}>Clear</button>}
        </div>
    );
}

// ────────────────────────────────────────
// Timesheet helpers
// ────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry'];
const NUTRITION_ACTIVITIES = ['Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];

function roundTo15(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    let rh = h, rm;
    if (m <= 7) rm = 0;
    else if (m <= 22) rm = 15;
    else if (m <= 37) rm = 30;
    else if (m <= 52) rm = 45;
    else { rh = h + 1; rm = 0; }
    return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const ri = roundTo15(timeIn), ro = roundTo15(timeOut);
    const [hI, mI] = ri.split(':').map(Number);
    const [hO, mO] = ro.split(':').map(Number);
    const diff = (hO * 60 + mO) - (hI * 60 + mI);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function getSunday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
}

function formatWeek(dateStr) {
    const s = new Date(dateStr + 'T00:00:00');
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
}

// ────────────────────────────────────────
// Activity checklist row
// ────────────────────────────────────────
function ActivityRow({ label, entries, section, activityKey, updateEntry, disabled }) {
    return (
        <div className="sdr-activity-row">
            <div className="sdr-activity-label">{label}</div>
            {entries.map((entry, idx) => {
                const activities = JSON.parse(entry[`${section}Activities`] || '{}');
                const checked = !!activities[activityKey];
                return (
                    <div key={idx} className="sdr-activity-cell">
                        <input type="checkbox" checked={checked} disabled={disabled}
                            onChange={() => {
                                const next = { ...activities, [activityKey]: !checked };
                                updateEntry(idx, `${section}Activities`, JSON.stringify(next));
                            }} />
                    </div>
                );
            })}
        </div>
    );
}

// ────────────────────────────────────────
// Timesheet Form Page — PCA Service Delivery Record
// ────────────────────────────────────────
function TimesheetFormPage({ timesheetId, clients, onBack, showToast }) {
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [recipientSig, setRecipientSig] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [supervisorSig, setSupervisorSig] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [pcaFullName, setPcaFullName] = useState('');
    const [completionDate, setCompletionDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [shareLinkModal, setShareLinkModal] = useState(null);
    const submitted = ts?.status === 'submitted';

    useEffect(() => {
        if (timesheetId) {
            api.getTimesheet(timesheetId).then((data) => {
                setTs(data);
                setEntries(data.entries);
                setRecipientSig(data.recipientSignature || '');
                setPcaSig(data.pcaSignature || '');
                setSupervisorSig(data.supervisorSignature || '');
                setRecipientName(data.recipientName || '');
                setPcaFullName(data.pcaFullName || '');
                setCompletionDate(data.completionDate || '');
            }).catch((err) => showToast(err.message, 'error'));
        }
    }, [timesheetId, showToast]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    };

    const adlDailyHours = (e) => computeHours(e.adlTimeIn, e.adlTimeOut);
    const iadlDailyHours = (e) => computeHours(e.iadlTimeIn, e.iadlTimeOut);
    const totalPas = entries.reduce((s, e) => s + adlDailyHours(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlDailyHours(e), 0);
    const totalAll = totalPas + totalHm;

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = {
                entries: entries.map((e) => ({
                    id: e.id, dateOfService: e.dateOfService,
                    adlActivities: e.adlActivities || '{}', adlTimeIn: e.adlTimeIn || null, adlTimeOut: e.adlTimeOut || null,
                    adlPcaInitials: e.adlPcaInitials || '', adlClientInitials: e.adlClientInitials || '',
                    iadlActivities: e.iadlActivities || '{}', iadlTimeIn: e.iadlTimeIn || null, iadlTimeOut: e.iadlTimeOut || null,
                    iadlPcaInitials: e.iadlPcaInitials || '', iadlClientInitials: e.iadlClientInitials || '',
                })),
                recipientName, pcaFullName, recipientSignature: recipientSig, pcaSignature: pcaSig, supervisorSignature: supervisorSig, completionDate,
            };
            const result = await api.updateTimesheet(ts.id, data);
            setTs(result); setEntries(result.entries);
            showToast('Timesheet saved');
        } catch (err) { showToast(err.message, 'error'); }
        setSaving(false);
    };

    const handleSubmit = async () => {
        await handleSave();
        try { const result = await api.submitTimesheet(ts.id); setTs(result); showToast('Timesheet submitted!'); } catch (err) { showToast(err.message, 'error'); }
    };

    const handleShareLinks = async () => {
        try {
            const links = await api.generateSigningLinks(ts.id);
            setShareLinkModal(links);
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (!ts) return <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);

    // Render one service section (reused for ADL and IADL)
    const renderSection = (title, tag, activities, nutritionActivities, section) => (
        <div className="sdr-section">
            <div className="sdr-section-title">{title} <span className="sdr-section-tag">{tag}</span></div>
            <div className="sdr-day-header-row">
                <div className="sdr-activity-label" />
                {entries.map((e, i) => (
                    <div key={i} className="sdr-day-header">
                        <div className="sdr-day-name">{DAY_SHORT[e.dayOfWeek]}</div>
                        <div className="sdr-day-date">{e.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}</div>
                    </div>
                ))}
            </div>
            {activities.map((act) => (
                <ActivityRow key={act} label={act} entries={entries} section={section} activityKey={act} updateEntry={updateEntry} disabled={submitted} />
            ))}
            {nutritionActivities && <>
                <div className="sdr-subsection-label">NUTRITION</div>
                {nutritionActivities.map((act) => (
                    <ActivityRow key={act} label={act} entries={entries} section={section} activityKey={act} updateEntry={updateEntry} disabled={submitted} />
                ))}
            </>}
            {/* PCA + Client Initials */}
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>PCA Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}PcaInitials`] || ''} onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} disabled={submitted} maxLength={4} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>Client Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}ClientInitials`] || ''} onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} disabled={submitted} maxLength={4} />
                    </div>
                ))}
            </div>
            {/* Time In / Out / Daily Totals */}
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time In</div>
                {entries.map((e, i) => (<div key={i} className="sdr-activity-cell"><input type="time" className="sdr-time-input" value={e[`${section}TimeIn`] || ''} onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} disabled={submitted} /></div>))}
            </div>
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time Out</div>
                {entries.map((e, i) => (<div key={i} className="sdr-activity-cell"><input type="time" className="sdr-time-input" value={e[`${section}TimeOut`] || ''} onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} disabled={submitted} /></div>))}
            </div>
            <div className="sdr-activity-row sdr-total-row">
                <div className="sdr-activity-label"><strong>Daily Totals</strong></div>
                {entries.map((e, i) => {
                    const hrs = section === 'adl' ? adlDailyHours(e) : iadlDailyHours(e);
                    return <div key={i} className="sdr-activity-cell sdr-hours-cell">{hrs > 0 ? hrs.toFixed(2) : '—'}</div>;
                })}
            </div>
        </div>
    );

    return (
        <>
            <div className="content-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn--ghost btn--icon" onClick={onBack} title="Back">←</button>
                    <div>
                        <h1 className="content-header__title" style={{ margin: 0 }}>PCA Service Delivery Record</h1>
                        <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{weekLabel}</p>
                    </div>
                </div>
                <div className="content-header__actions">
                    {submitted ? (
                        <span className="ts-badge ts-badge--submitted">Submitted {ts.submittedAt ? new Date(ts.submittedAt).toLocaleString() : ''}</span>
                    ) : (
                        <>
                            <button className="btn btn--outline btn--sm" onClick={handleShareLinks}>{Icons.share} Share</button>
                            <button className="btn btn--outline btn--sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
                            <button className="btn btn--primary btn--sm" onClick={handleSubmit}>Submit</button>
                        </>
                    )}
                </div>
            </div>

            <div className="page-content sdr-form">
                {/* Client Info */}
                <div className="sdr-client-info">
                    <div className="sdr-info-field"><span className="sdr-info-label">Client:</span> <span className="sdr-info-value">{ts.client?.clientName}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Phone:</span> <span className="sdr-info-value">{ts.clientPhone || '—'}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Client ID:</span> <span className="sdr-info-value">{ts.clientIdNumber || '—'}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">PCA:</span> <span className="sdr-info-value">{ts.pcaName}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Status:</span> <span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span></div>
                </div>

                {renderSection("Activities of Daily Living — ADL's", 'PAS', ADL_ACTIVITIES, null, 'adl')}
                {renderSection("IADL's Instrumental Activities of Daily Living", 'HM', IADL_ACTIVITIES, NUTRITION_ACTIVITIES, 'iadl')}

                {/* Totals */}
                <div className="sdr-totals-bar">
                    <div className="sdr-total-item"><span>Total Hours in This Time Sheet</span><strong>{totalAll.toFixed(2)}</strong></div>
                    <div className="sdr-total-item"><span>Total Hours for PAS</span><strong>{totalPas.toFixed(2)}</strong></div>
                    <div className="sdr-total-item"><span>Total Hours for Homemaker</span><strong>{totalHm.toFixed(2)}</strong></div>
                </div>

                {/* Signatures */}
                <div className="sdr-section">
                    <div className="sdr-section-title">Acknowledgement and Required Signatures</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                        <div className="form-group"><label>Recipient Name (First, MI, Last)</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={submitted} placeholder="Jane A. Doe" /></div>
                        <div className="form-group"><label>Date</label><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={submitted} /></div>
                    </div>
                    <div className="ts-signatures">
                        <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} disabled={submitted} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16, padding: '0 16px' }}>
                        <div className="form-group"><label>PCA Name (First, MI, Last)</label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} disabled={submitted} placeholder="Maria A. Garcia" /></div>
                        <div className="form-group"><label>Date</label><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={submitted} /></div>
                    </div>
                    <div className="ts-signatures">
                        <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} disabled={submitted} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 0, padding: '0 16px' }}>
                        <div className="form-group"><label>Supervisor Name</label><input type="text" value={ts.supervisorName || 'Sona Hakobyan'} disabled style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} /></div>
                    </div>
                    <div className="ts-signatures" style={{ paddingBottom: 16 }}>
                        <SignaturePad label="Supervisor Signature" value={supervisorSig} onChange={setSupervisorSig} disabled={submitted} />
                    </div>
                </div>
            </div>

            {/* Share Links Modal */}
            {shareLinkModal && (
                <Modal onClose={() => setShareLinkModal(null)}>
                    <h2 className="modal__title"><span style={{ display: 'inline-block', width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }}>{Icons.share}</span>Signing Links</h2>
                    <p className="modal__desc">Share these secure one-time links. Each link expires in 72 hours and can only be used once.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="share-link-group">
                            <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>PCA Link</label>
                            <div className="share-link-row">
                                <input type="text" readOnly value={shareLinkModal.pcaLink} className="share-link-input" />
                                <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.pcaLink); showToast('PCA link copied!'); }}>{Icons.copy} Copy</button>
                            </div>
                        </div>
                        <div className="share-link-group">
                            <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>Client / Guardian Link</label>
                            <div className="share-link-row">
                                <input type="text" readOnly value={shareLinkModal.clientLink} className="share-link-input" />
                                <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.clientLink); showToast('Client link copied!'); }}>{Icons.copy} Copy</button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}

// ────────────────────────────────────────
// Signing Form Page — Public (no auth)
// ────────────────────────────────────────
function SigningFormPage({ token }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [role, setRole] = useState(null);
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [recipientName, setRecipientName] = useState('');
    const [recipientSig, setRecipientSig] = useState('');
    const [pcaFullName, setPcaFullName] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        api.getSigningForm(token)
            .then((data) => {
                setRole(data.role);
                setTs(data.timesheet);
                setEntries(data.timesheet.entries || []);
                setRecipientName(data.timesheet.recipientName || '');
                setRecipientSig(data.timesheet.recipientSignature || '');
                setPcaFullName(data.timesheet.pcaFullName || '');
                setPcaSig(data.timesheet.pcaSignature || '');
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const payload = { entries };
            if (role === 'pca') {
                payload.pcaFullName = pcaFullName;
                payload.pcaSignature = pcaSig;
            } else {
                payload.recipientName = recipientName;
                payload.recipientSignature = recipientSig;
            }
            await api.submitSigningForm(token, payload);
            setSuccess(true);
        } catch (err) { setError(err.message); }
        setSubmitting(false);
    };

    if (loading) return (
        <div className="signing-page">
            <div className="signing-card"><p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading form…</p></div>
        </div>
    );
    if (error) return (
        <div className="signing-page">
            <div className="signing-card signing-card--error">
                <div className="signing-card__icon" style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertCircle}</div>
                <h2>{error}</h2>
                <p>This signing link is no longer valid. Please request a new link from your administrator.</p>
            </div>
        </div>
    );
    if (success) return (
        <div className="signing-page">
            <div className="signing-card signing-card--success">
                <div className="signing-card__icon" style={{ color: 'hsl(142 76% 36%)' }}>{Icons.checkCircle}</div>
                <h2>Thank you!</h2>
                <p>Your {role === 'pca' ? 'service record' : 'acknowledgement'} has been submitted successfully. You may close this page.</p>
            </div>
        </div>
    );

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);
    const adlDailyHrs = (e) => { const [hI, mI] = (e.adlTimeIn || '').split(':').map(Number); const [hO, mO] = (e.adlTimeOut || '').split(':').map(Number); if (!e.adlTimeIn || !e.adlTimeOut) return 0; const d = (hO * 60 + mO) - (hI * 60 + mI); return d > 0 ? Math.round(d / 60 * 100) / 100 : 0; };
    const iadlDailyHrs = (e) => { const [hI, mI] = (e.iadlTimeIn || '').split(':').map(Number); const [hO, mO] = (e.iadlTimeOut || '').split(':').map(Number); if (!e.iadlTimeIn || !e.iadlTimeOut) return 0; const d = (hO * 60 + mO) - (hI * 60 + mI); return d > 0 ? Math.round(d / 60 * 100) / 100 : 0; };

    return (
        <div className="signing-page">
            <div className="signing-form-container">
                <div className="signing-header">
                    <div className="signing-header__logo">{Icons.shieldCheck}</div>
                    <h1 className="signing-header__title">NV Best PCA</h1>
                    <p className="signing-header__sub">
                        {role === 'pca' ? 'PCA Service Delivery Record' : 'Client Acknowledgement'}
                    </p>
                </div>

                <div className="signing-info-bar">
                    <div><strong>Client:</strong> {ts.client?.clientName}</div>
                    <div><strong>PCA:</strong> {ts.pcaName}</div>
                    <div><strong>Week:</strong> {weekLabel}</div>
                </div>

                {/* Day entries */}
                <div className="signing-entries">
                    {entries.map((entry, idx) => {
                        const dayName = DAY_SHORT[entry.dayOfWeek] || `Day ${entry.dayOfWeek}`;
                        const dateStr = entry.dateOfService ? new Date(entry.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                        return (
                            <div key={entry.id} className="signing-day-card">
                                <div className="signing-day-card__header">{dayName} {dateStr && <span>{dateStr}</span>}</div>

                                {role === 'pca' ? (
                                    <div className="signing-day-card__body">
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL Time In</label>
                                                <input type="time" value={entry.adlTimeIn || ''} onChange={(e) => updateEntry(idx, 'adlTimeIn', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>ADL Time Out</label>
                                                <input type="time" value={entry.adlTimeOut || ''} onChange={(e) => updateEntry(idx, 'adlTimeOut', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>ADL Hrs</label>
                                                <div className="signing-hours">{adlDailyHrs(entry).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 8 }}>
                                            <label>PCA Initials</label>
                                            <input type="text" value={entry.adlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'adlPcaInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                        <div className="signing-field-row" style={{ marginTop: 12 }}>
                                            <div className="signing-field">
                                                <label>IADL Time In</label>
                                                <input type="time" value={entry.iadlTimeIn || ''} onChange={(e) => updateEntry(idx, 'iadlTimeIn', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL Time Out</label>
                                                <input type="time" value={entry.iadlTimeOut || ''} onChange={(e) => updateEntry(idx, 'iadlTimeOut', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL Hrs</label>
                                                <div className="signing-hours">{iadlDailyHrs(entry).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 8 }}>
                                            <label>PCA Initials (IADL)</label>
                                            <input type="text" value={entry.iadlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'iadlPcaInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="signing-day-card__body">
                                        <div className="signing-field-row">
                                            <div className="signing-field"><label>ADL</label><div className="signing-hours">{entry.adlTimeIn || '—'} → {entry.adlTimeOut || '—'} ({adlDailyHrs(entry).toFixed(2)}h)</div></div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 6 }}>
                                            <label>Client Initials (ADL)</label>
                                            <input type="text" value={entry.adlClientInitials || ''} onChange={(e) => updateEntry(idx, 'adlClientInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                        <div className="signing-field-row" style={{ marginTop: 12 }}>
                                            <div className="signing-field"><label>IADL</label><div className="signing-hours">{entry.iadlTimeIn || '—'} → {entry.iadlTimeOut || '—'} ({iadlDailyHrs(entry).toFixed(2)}h)</div></div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 6 }}>
                                            <label>Client Initials (IADL)</label>
                                            <input type="text" value={entry.iadlClientInitials || ''} onChange={(e) => updateEntry(idx, 'iadlClientInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Signature section */}
                <div className="signing-signature-section">
                    {role === 'pca' ? (
                        <>
                            <div className="form-group"><label>PCA Full Name</label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} placeholder="Enter your full name" /></div>
                            <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} />
                        </>
                    ) : (
                        <>
                            <div className="form-group"><label>Recipient / Responsible Party Name</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Enter your full name" /></div>
                            <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} />
                        </>
                    )}
                </div>

                <button className="btn btn--primary" style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16 }} onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit'}
                </button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────
// Timesheets List Page (Admin Payroll View)
// ────────────────────────────────────────
function TimesheetsListPage({ clients, showToast, onNavigate }) {
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [activeTimesheetId, setActiveTimesheetId] = useState(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newPcaName, setNewPcaName] = useState('');
    const [newClientId, setNewClientId] = useState('');
    const [newWeekDate, setNewWeekDate] = useState(getSunday(new Date().toISOString().split('T')[0]));
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientIdNumber, setNewClientIdNumber] = useState('');

    const fetchTimesheets = useCallback(async () => {
        try {
            const params = statusFilter ? `status=${statusFilter}` : '';
            const data = await api.getTimesheets(params);
            setTimesheets(data);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    }, [statusFilter, showToast]);

    useEffect(() => { fetchTimesheets(); }, [fetchTimesheets]);

    const handleCreate = async () => {
        if (!newPcaName.trim() || !newClientId) { showToast('Fill in PCA name and Client', 'error'); return; }
        try {
            const ts = await api.createTimesheet({ pcaName: newPcaName.trim(), clientId: Number(newClientId), weekStart: newWeekDate, clientPhone: newClientPhone.trim(), clientIdNumber: newClientIdNumber.trim() });
            setShowNewModal(false); setNewPcaName(''); setNewClientPhone(''); setNewClientIdNumber('');
            setActiveTimesheetId(ts.id);
            showToast('Timesheet created');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        try { await api.deleteTimesheet(id); showToast('Timesheet deleted'); fetchTimesheets(); } catch (err) { showToast(err.message, 'error'); }
    };

    if (activeTimesheetId) {
        return <TimesheetFormPage timesheetId={activeTimesheetId} clients={clients} onBack={() => { setActiveTimesheetId(null); fetchTimesheets(); }} showToast={showToast} />;
    }

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Timesheets</h1>
                <div className="content-header__actions">
                    <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ marginRight: 8 }}>
                        <option value="">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                    </select>
                    <button className="btn btn--primary btn--sm" onClick={() => setShowNewModal(true)}>{Icons.plus} New Timesheet</button>
                </div>
            </div>
            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : timesheets.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">No timesheets yet</div>
                        <div className="empty-state__desc">Click &quot;New Timesheet&quot; to create a weekly PCA Service Delivery Record.</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead><tr><th>PCA Name</th><th>Client</th><th>Week</th><th>PAS Hrs</th><th>HM Hrs</th><th>Total</th><th>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
                            <tbody>
                                {timesheets.map((ts) => (
                                    <tr key={ts.id} className="clickable-row" onClick={() => setActiveTimesheetId(ts.id)}>
                                        <td style={{ fontWeight: 500 }}>{ts.pcaName}</td>
                                        <td>{ts.client?.clientName}</td>
                                        <td style={{ fontSize: 13 }}>{formatWeek(ts.weekStart.split('T')[0])}</td>
                                        <td>{ts.totalPasHours.toFixed(2)}</td>
                                        <td>{ts.totalHmHours.toFixed(2)}</td>
                                        <td><strong>{ts.totalHours.toFixed(2)}</strong></td>
                                        <td><span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span></td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {ts.status === 'draft' && <button className="btn btn--danger-ghost btn--icon" onClick={() => handleDelete(ts.id)} title="Delete">{Icons.trash}</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {showNewModal && (
                <Modal onClose={() => setShowNewModal(false)}>
                    <h2 className="modal__title">New Service Delivery Record</h2>
                    <p className="modal__desc">Create a weekly PCA timesheet (Sunday–Saturday).</p>
                    <div className="form-group"><label>PCA Name</label><input type="text" value={newPcaName} onChange={(e) => setNewPcaName(e.target.value)} placeholder="Jane Smith" autoFocus /></div>
                    <div className="form-group">
                        <label>Client</label>
                        <select value={newClientId} onChange={(e) => setNewClientId(e.target.value)}>
                            <option value="">Select a client…</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group"><label>Client Phone</label><input type="tel" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="702-555-0123" /></div>
                        <div className="form-group"><label>Client ID #</label><input type="text" value={newClientIdNumber} onChange={(e) => setNewClientIdNumber(e.target.value)} placeholder="Optional" /></div>
                    </div>
                    <div className="form-group"><label>Week Starting (Sunday)</label><input type="date" value={newWeekDate} onChange={(e) => setNewWeekDate(getSunday(e.target.value))} /></div>
                    <div className="form-actions">
                        <button type="button" className="btn btn--outline" onClick={() => setShowNewModal(false)}>Cancel</button>
                        <button type="button" className="btn btn--primary" onClick={handleCreate}>Create Timesheet</button>
                    </div>
                </Modal>
            )}
        </>
    );
}
// ────────────────────────────────────────
// Login Page
// ────────────────────────────────────────
function LoginPage({ onLogin, showToast }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        try {
            const result = await api.login(email, password);
            api.setToken(result.token);
            onLogin(result.user);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-card__header">
                    <div className="login-card__logo">{Icons.shieldCheck}</div>
                    <h1 className="login-card__title">NV Best PCA</h1>
                    <p className="login-card__subtitle">Authorization Tracking System</p>
                </div>
                <form onSubmit={handleSubmit} className="login-card__form">
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@nvbestpca.com" autoFocus required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
                    </div>
                    <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ────────────────────────────────────────
// Users Management Page (admin)
// ────────────────────────────────────────
function UsersPage({ showToast }) {
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

// ────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────
function Sidebar({ activePage, onNavigate, user, onLogout }) {
    const isAdmin = user?.role === 'admin';
    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    {Icons.shieldCheck}
                </div>
                <div className="sidebar__brand-info">
                    <div className="sidebar__brand-name">NV Best PCA</div>
                    <div className="sidebar__brand-sub">Auth Tracker</div>
                </div>
            </div>

            <nav className="sidebar__nav">
                <div className="sidebar__section-label">Home</div>
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'dashboard' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('dashboard')}>
                        {Icons.layoutDashboard} Dashboard
                    </button>
                )}
                <button className={`sidebar__nav-item ${activePage === 'timesheets' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('timesheets')}>
                    {Icons.fileText} Timesheets
                </button>

                {isAdmin && (
                    <>
                        <div className="separator" style={{ margin: '8px 12px' }} />
                        <div className="sidebar__section-label">Documents</div>
                        <button className="sidebar__nav-item">
                            {Icons.fileText} Reports
                        </button>
                    </>
                )}
            </nav>

            <div className="sidebar__footer">
                {isAdmin && (
                    <>
                        <div className="sidebar__section-label">Settings</div>
                        <button className={`sidebar__nav-item ${activePage === 'insuranceTypes' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('insuranceTypes')}>
                            {Icons.shieldCheck} Insurance Types
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'services' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('services')}>
                            {Icons.fileText} Services
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'users' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('users')}>
                            {Icons.user} Users
                        </button>
                    </>
                )}
                <div className="separator" style={{ margin: '8px 12px' }} />
                <div className="sidebar__user">
                    <div className="sidebar__avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
                    <div className="sidebar__user-info">
                        <div className="sidebar__user-name">{user?.name || 'User'}</div>
                        <div className="sidebar__user-email">{user?.email}</div>
                    </div>
                </div>
                <button className="btn btn--outline btn--sm" style={{ margin: '8px 12px', width: 'calc(100% - 24px)' }} onClick={onLogout}>
                    {Icons.logOut} Sign Out
                </button>
            </div>
        </aside>
    );
}

// ────────────────────────────────────────
// Main App
// ────────────────────────────────────────
const ROWS_PER_PAGE = 25;

export default function App() {
    const [authUser, setAuthUser] = useState(null);
    const [authChecking, setAuthChecking] = useState(true);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [toast, setToast] = useState(null);
    const [modal, setModal] = useState(null);
    const [statusFilter, setStatusFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [activePage, setActivePage] = useState(null);
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [services, setServices] = useState([]);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    const fetchClients = useCallback(async () => {
        try {
            const data = await api.getClients();
            setClients(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // ── Auth check on mount ──
    useEffect(() => {
        const token = api.getToken();
        if (!token) { setAuthChecking(false); return; }
        api.getMe().then((user) => {
            setAuthUser(user);
            setActivePage(user.role === 'admin' ? 'dashboard' : 'timesheets');
        }).catch(() => { api.clearToken(); }).finally(() => setAuthChecking(false));
    }, []);

    // Listen for 401 logout events
    useEffect(() => {
        const handler = () => { setAuthUser(null); setActivePage(null); };
        window.addEventListener('auth:logout', handler);
        return () => window.removeEventListener('auth:logout', handler);
    }, []);

    const handleLogin = (user) => {
        setAuthUser(user);
        setActivePage(user.role === 'admin' ? 'dashboard' : 'timesheets');
    };

    const handleLogout = () => {
        api.clearToken();
        setAuthUser(null);
        setActivePage(null);
        setClients([]);
    };

    const fetchInsuranceTypes = useCallback(async () => {
        try {
            const data = await api.getInsuranceTypes();
            setInsuranceTypes(data);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    const fetchServices = useCallback(async () => {
        try {
            const data = await api.getServices();
            setServices(data);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, [showToast]);

    const isAdmin = authUser?.role === 'admin';
    useEffect(() => {
        if (!authUser) return;
        if (isAdmin) { fetchClients(); fetchInsuranceTypes(); fetchServices(); }
    }, [authUser, isAdmin, fetchClients, fetchInsuranceTypes, fetchServices]);

    const toggleExpand = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // ── Client CRUD ──
    const handleSaveClient = async (data) => {
        try {
            if (modal.client) {
                await api.updateClient(modal.client.id, data.clientName, data);
                showToast('Client updated');
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
            showToast('Client deleted');
            setModal(null);
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ── Auth CRUD ──
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
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAuth = async (auth) => {
        try {
            await api.deleteAuthorization(auth.id);
            showToast('Authorization deleted');
            setModal(null);
            fetchClients();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ── Bulk import ──
    const handleBulkImport = async (rows) => {
        try {
            const result = await api.bulkImport(rows);
            showToast(`Imported ${result.imported} client(s)`);
            setClients(result.clients);
            setModal(null);
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ── Stats ──
    const totalAuths = clients.reduce((s, c) => s + c.authorizations.length, 0);
    const expiredCount = clients.filter((c) => c.overallStatus === 'Expired').length;
    const renewalCount = clients.filter((c) => c.overallStatus === 'Renewal Reminder').length;
    const okCount = clients.filter((c) => c.overallStatus === 'OK').length;

    // ── Filter + Pagination ──
    const searchLower = searchQuery.toLowerCase().trim();
    const filteredClients = clients.filter((c) => {
        const matchesStatus = statusFilter === 'All' || c.overallStatus === statusFilter;
        const matchesSearch = !searchLower || c.clientName.toLowerCase().includes(searchLower) || (c.medicaidId || '').toLowerCase().includes(searchLower);
        return matchesStatus && matchesSearch;
    });
    const totalPages = Math.max(1, Math.ceil(filteredClients.length / ROWS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedClients = filteredClients.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

    const handleFilterChange = (filter) => {
        setStatusFilter(filter);
        setCurrentPage(1);
    };

    // Insurance type names for the client form dropdown
    const insuranceTypeNames = insuranceTypes.length > 0
        ? insuranceTypes.map((t) => t.name)
        : ['MEDICAID'];

    // Public signing form route — bypass auth
    const signingMatch = window.location.pathname.match(/^\/sign\/(.+)$/);
    if (signingMatch) return <SigningFormPage token={signingMatch[1]} />;

    if (authChecking) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    if (!authUser) return (
        <>
            <LoginPage onLogin={handleLogin} showToast={showToast} />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );

    return (
        <div className="app">
            <Sidebar activePage={activePage} onNavigate={setActivePage} user={authUser} onLogout={handleLogout} />

            <div className="main-content">
                {activePage === 'users' && isAdmin ? (
                    <UsersPage showToast={showToast} />
                ) : activePage === 'insuranceTypes' && isAdmin ? (
                    <InsuranceTypesPage insuranceTypes={insuranceTypes} onRefresh={fetchInsuranceTypes} showToast={showToast} />
                ) : activePage === 'services' && isAdmin ? (
                    <ServicesPage services={services} onRefresh={fetchServices} showToast={showToast} />
                ) : activePage === 'timesheets' ? (
                    <TimesheetsListPage clients={clients} showToast={showToast} onNavigate={setActivePage} />
                ) : (
                    <>
                        {/* Content Header */}
                        <div className="content-header">
                            <h1 className="content-header__title">Dashboard</h1>
                            <div className="content-header__actions">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search clients…"
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                />
                                <button className="btn btn--outline btn--sm" onClick={() => setModal({ type: 'bulkImport' })}>
                                    {Icons.download} Import
                                </button>
                                <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'client' })}>
                                    {Icons.plus} Add Client
                                </button>
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
                                                onClick={() => handleFilterChange(f)}
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
                                                        <th style={{ width: 36 }}></th>
                                                        <th>Client Name</th>
                                                        <th>Medicaid ID</th>
                                                        <th>Insurance Type</th>
                                                        <th>Service Category</th>
                                                        <th>Service Code</th>
                                                        <th>Service Name</th>
                                                        <th>Auth Units</th>
                                                        <th>Auth Start</th>
                                                        <th>Auth End</th>
                                                        <th>Status</th>
                                                        <th>Days to Expire</th>
                                                        <th>Notes</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedClients.map((client) => {
                                                        const isOpen = expandedIds.has(client.id);
                                                        return (
                                                            <>
                                                                {/* Client (parent) row */}
                                                                <tr
                                                                    key={`c-${client.id}`}
                                                                    className={`row-client row-client--${client.statusColor}`}
                                                                    onClick={() => toggleExpand(client.id)}
                                                                >
                                                                    <td>
                                                                        <span className={`row-client__toggle ${isOpen ? 'row-client__toggle--open' : ''}`}>
                                                                            {Icons.chevronRight}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <span className="row-client__client-name">{client.clientName}</span>
                                                                    </td>
                                                                    <td style={{ color: 'hsl(240 3.8% 46.1%)', fontSize: 12 }}>{client.medicaidId || '—'}</td>
                                                                    <td>
                                                                        <span className="insurance-badge">
                                                                            {client.insuranceType}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <div className="service-chips">
                                                                            {[...new Set(client.authorizations.map(a => a.serviceCode))].map((c) => (
                                                                                <span key={c} className="service-chip">{c}</span>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                    <td></td>
                                                                    <td></td>
                                                                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'hsl(240 3.8% 46.1%)' }}>
                                                                        {client.authorizations.reduce((s, a) => s + (a.authorizedUnits || 0), 0) || '—'}
                                                                    </td>
                                                                    <td></td>
                                                                    <td></td>
                                                                    <td>
                                                                        <span className={`status-cell status-cell--${client.statusColor}`}>
                                                                            {statusLabel(client.overallStatus)}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <span className="days-summary">{client.daysSummary}</span>
                                                                    </td>
                                                                    <td></td>
                                                                    <td>
                                                                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                                            <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'client', client })} title="Edit client">
                                                                                {Icons.edit}
                                                                            </button>
                                                                            <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDeleteClient', client })} title="Delete client">
                                                                                {Icons.trash}
                                                                            </button>
                                                                            <button className="btn btn--ghost btn--xs" onClick={() => { setExpandedIds(prev => new Set([...prev, client.id])); setModal({ type: 'auth', clientId: client.id }); }} title="Add authorization">
                                                                                {Icons.plus} Add
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>

                                                                {/* Authorization (child) rows */}
                                                                {isOpen && client.authorizations.map((auth) => (
                                                                    <tr key={`a-${auth.id}`} className="row-auth">
                                                                        <td></td>
                                                                        <td className="row-auth__indent">└─</td>
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td style={{ fontSize: 13 }}>{auth.serviceCategory || '—'}</td>
                                                                        <td style={{ fontWeight: 600, color: 'hsl(240 10% 3.9%)' }}>{auth.serviceCode}</td>
                                                                        <td style={{ fontSize: 13 }}>{auth.serviceName || '—'}</td>
                                                                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{auth.authorizedUnits || '—'}</td>
                                                                        <td style={{ fontSize: 13 }}>{fmtDate(auth.authorizationStartDate)}</td>
                                                                        <td style={{ fontSize: 13 }}>{fmtDate(auth.authorizationEndDate)}</td>
                                                                        <td>
                                                                            <span className={`status-cell status-cell--${auth.statusColor}`}>
                                                                                {statusLabel(auth.status)}
                                                                            </span>
                                                                        </td>
                                                                        <td>
                                                                            <span className={`days-cell ${daysClass(auth.daysToExpire)}`}>
                                                                                {auth.daysToExpire}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ fontSize: 12, color: 'hsl(240 3.8% 46.1%)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{auth.notes || '—'}</td>
                                                                        <td>
                                                                            <div className="row-actions">
                                                                                <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'auth', auth, clientId: auth.clientId })} title="Edit authorization">
                                                                                    {Icons.edit}
                                                                                </button>
                                                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDeleteAuth', auth })} title="Delete authorization">
                                                                                    {Icons.trash}
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}

                                                                {/* Add Service row — always shown when expanded */}
                                                                {isOpen && (
                                                                    <tr key={`add-${client.id}`} className="row-auth">
                                                                        <td></td>
                                                                        <td colSpan={12} style={{ paddingLeft: 48 }}>
                                                                            <button
                                                                                className="btn btn--outline btn--sm"
                                                                                onClick={() => setModal({ type: 'auth', clientId: client.id })}
                                                                                style={{ margin: '4px 0' }}
                                                                            >
                                                                                {Icons.plus} Add New Service / Authorization
                                                                            </button>
                                                                            {client.authorizations.length === 0 && (
                                                                                <span style={{ marginLeft: 12, color: 'hsl(240 3.8% 46.1%)', fontSize: 12, fontStyle: 'italic' }}>
                                                                                    No services yet
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td></td>
                                                                    </tr>
                                                                )}
                                                            </>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="table-info-bar">
                                            <span>
                                                Showing {(safePage - 1) * ROWS_PER_PAGE + 1}–{Math.min(safePage * ROWS_PER_PAGE, filteredClients.length)} of {filteredClients.length} client(s)
                                                {statusFilter !== 'All' && ` (filtered: ${statusFilter})`}
                                            </span>
                                            <div className="pagination">
                                                <button
                                                    className="btn btn--outline btn--sm"
                                                    disabled={safePage <= 1}
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                >
                                                    ← Prev
                                                </button>
                                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                                                    .reduce((acc, p, idx, arr) => {
                                                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                                                        acc.push(p);
                                                        return acc;
                                                    }, [])
                                                    .map((p, i) =>
                                                        p === '...' ? (
                                                            <span key={`dots-${i}`} className="pagination__dots">…</span>
                                                        ) : (
                                                            <button
                                                                key={p}
                                                                className={`btn btn--sm ${p === safePage ? 'btn--primary' : 'btn--outline'}`}
                                                                onClick={() => setCurrentPage(p)}
                                                            >
                                                                {p}
                                                            </button>
                                                        )
                                                    )}
                                                <button
                                                    className="btn btn--outline btn--sm"
                                                    disabled={safePage >= totalPages}
                                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                >
                                                    Next →
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
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
            {modal?.type === 'confirmDeleteAuth' && (
                <ConfirmModal
                    title="Delete Authorization"
                    message={`This will permanently delete this ${modal.auth.serviceCode} authorization. This action cannot be undone.`}
                    onConfirm={() => handleDeleteAuth(modal.auth)}
                    onClose={() => setModal(null)}
                />
            )}

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
