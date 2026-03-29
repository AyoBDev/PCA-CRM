import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const TimesheetsListPage = lazy(() => import('./pages/TimesheetsListPage'));
const SigningFormPage = lazy(() => import('./pages/SigningFormPage'));
const InsuranceTypesPage = lazy(() => import('./pages/InsuranceTypesPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const SchedulingPage = lazy(() => import('./pages/SchedulingPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const ScheduleConfirmPage = lazy(() => import('./pages/scheduling/ScheduleConfirmPage'));

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, isAdmin, loading } = useAuth();
    if (loading) return <div className="page-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/timesheets" replace />;
    return children;
}

function AppRoutes() {
    const { user, isAdmin, loading } = useAuth();

    if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    return (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>}>
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={!user ? <LoginPage /> : <Navigate to={isAdmin ? '/dashboard' : '/timesheets'} replace />} />
                <Route path="/sign/:token" element={<SigningFormPage />} />
                <Route path="/schedule/confirm/:token" element={<ScheduleConfirmPage />} />

                {/* Protected routes with layout */}
                <Route path="/dashboard" element={<ProtectedRoute adminOnly><Layout><DashboardPage /></Layout></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute adminOnly><Layout><ClientsPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets" element={<ProtectedRoute><Layout><TimesheetsListPage /></Layout></ProtectedRoute>} />
                <Route path="/scheduling" element={<ProtectedRoute adminOnly><Layout><SchedulingPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll/runs/:runId" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/insurance-types" element={<ProtectedRoute adminOnly><Layout><InsuranceTypesPage /></Layout></ProtectedRoute>} />
                <Route path="/services" element={<ProtectedRoute adminOnly><Layout><ServicesPage /></Layout></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute adminOnly><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Layout><UsersPage /></Layout></ProtectedRoute>} />

                {/* Default redirect */}
                <Route path="*" element={<Navigate to={user ? (isAdmin ? '/dashboard' : '/timesheets') : '/login'} replace />} />
            </Routes>
        </Suspense>
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

    const excelDateToString = (v) => {
        if (!v && v !== 0) return '';
        if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v);
            if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const str = String(v).trim();
        if (!str) return '';
        const dt = new Date(str);
        return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
    };

    // Parse parent-child row layout:
    //   Row with col B (client name) → new client (parent row)
    //   Row with col F (service code) → authorization (child row)
    // Column indices: 0=row#, 1=Client Name, 2=Medicaid ID, 3=Insurance Type,
    //   4=Service Category, 5=Service Code, 6=Service Name,
    //   7=Authorized Units, 8=Auth Start, 9=Auth End, 10=status, 11=days, 12=Notes
    const parseParentChildRows = (rawRows) => {
        const clients = [];
        let current = null;

        // Skip header row (index 0)
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

            // Parent row: has a client name
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

            // Child row: has a service code
            if (current && serviceCode) {
                current.authorizations.push({
                    serviceCategory,
                    serviceCode,
                    serviceName: serviceName || serviceCode,
                    authorizedUnits: parseInt(authorizedUnits, 10) || 0,
                    authorizationStartDate: excelDateToString(authStart),
                    authorizationEndDate: excelDateToString(authEnd),
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
            reader.onload = (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: false });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
                    if (!rawRows.length) throw new Error('Spreadsheet is empty');
                    const clients = parseParentChildRows(rawRows);
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
// Payroll helpers
// ────────────────────────────────────────
function visitRowClass(v) {
    if (v.needsReview)    return 'payroll-row--needs-review';
    if (v.voidFlag)       return 'payroll-row--void';
    if (v.isIncomplete)   return 'payroll-row--incomplete';
    if (v.isUnauthorized) return 'payroll-row--unauthorized';
    if (v.overlapId)      return 'payroll-row--overlap';
    return '';
}

// ────────────────────────────────────────
// PayrollUploadModal
// ────────────────────────────────────────
function PayrollUploadModal({ onUpload, onClose }) {
    const [name, setName]               = useState('');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd]     = useState('');
    const [file, setFile]               = useState(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) { setError('Please select an XLSX file.'); return; }
        setLoading(true);
        setError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('name', name.trim() || file.name);
            if (periodStart) fd.append('periodStart', periodStart);
            if (periodEnd)   fd.append('periodEnd',   periodEnd);
            const run = await api.uploadPayrollRun(fd);
            onUpload(run);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">New Payroll Run</h2>
            <p className="modal__desc">Upload an XLSX export from the scheduling system to process payroll.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="payrollRunName">Run Name</label>
                    <input id="payrollRunName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Feb 2026 Week 1" />
                </div>
                <div className="form-group">
                    <label htmlFor="periodStart">Period Start</label>
                    <input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="periodEnd">Period End</label>
                    <input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="payrollFile">XLSX File <span style={{ color: 'hsl(var(--destructive))' }}>*</span></label>
                    <input id="payrollFile" type="file" accept=".xlsx,.xls" required onChange={(e) => setFile(e.target.files[0] || null)} />
                </div>
                {error && <p style={{ color: 'hsl(var(--destructive))', fontSize: 13, marginBottom: 8 }}>{error}</p>}
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={loading}>
                        {loading ? 'Processing…' : 'Upload & Process'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// ────────────────────────────────────────
// PayrollClientGroup
// ────────────────────────────────────────
function PayrollClientGroup({ clientName, visits, onVisitChange, authMap, mergedOriginalsMap }) {
    // Auth banner: show raw reported units (for claims review), not reduced payroll units
    const authSummary = useMemo(() => {
        const map = new Map();
        for (const v of visits) {
            if (v.needsReview) continue;
            const code = v.serviceCode || '—';
            map.set(code, (map.get(code) || 0) + (v.unitsRaw || 0));
        }
        return [...map.entries()];
    }, [visits]);

    const total = useMemo(() =>
        visits.filter((v) => !v.voidFlag && !v.needsReview).reduce((s, v) => s + v.finalPayableUnits, 0),
        [visits]
    );

    // Employee totals: grouped by normalized employeeName (case-insensitive), including void rows
    const employeeTotals = useMemo(() => {
        const map = new Map();       // normalized key → { displayName, units, voidUnits }
        for (const v of visits) {
            if (v.needsReview) continue;
            const raw = v.employeeName || '(Unknown)';
            const key = raw.toLowerCase().trim();
            if (!map.has(key)) map.set(key, { displayName: raw, units: 0, voidUnits: 0 });
            const entry = map.get(key);
            if (v.voidFlag) {
                entry.voidUnits += 1;
            } else {
                entry.units += v.finalPayableUnits;
            }
        }
        return [...map.entries()]
            .map(([, data]) => [data.displayName, { units: data.units, voidUnits: data.voidUnits }])
            .sort((a, b) => a[0].localeCompare(b[0]));
    }, [visits]);

    // Assign a distinct left-border color to each employee (only when 2+ employees)
    const EMP_COLORS = [
        'hsl(221 83% 53%)',  // blue
        'hsl(142 71% 35%)',  // green
        'hsl(291 64% 42%)',  // purple
        'hsl(24 95% 48%)',   // orange
        'hsl(346 77% 49%)',  // red-pink
        'hsl(187 71% 38%)',  // teal
        'hsl(43 96% 46%)',   // amber
        'hsl(262 52% 47%)',  // indigo
    ];
    const employeeColorMap = useMemo(() => {
        const seen = [];  // normalized keys in insertion order
        for (const v of visits) {
            const emp = v.employeeName || '';
            const key = emp.toLowerCase().trim();
            if (key && !seen.includes(key)) seen.push(key);
        }
        if (seen.length < 2) return null;
        const map = new Map();
        seen.forEach((key, i) => map.set(key, EMP_COLORS[i % EMP_COLORS.length]));
        return map;
    }, [visits]);

    // Match server normalizeName: lowercase, strip non-alphanumeric, sort words
    const clientKey = (clientName || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
    const clientAuthMap = (authMap && authMap[clientKey]) || {};

    return (
        <div className="payroll-client-group">
            <div className="payroll-client-banner">
                <span>{clientName || <em style={{ color: 'hsl(270 50% 40%)' }}>Unknown Client</em>}</span>
                {authSummary.length > 0 && (
                    <span className="payroll-client-banner__auths">
                        {authSummary.map(([code, units], i) => {
                            const authorized = clientAuthMap[code];
                            let color = 'inherit';
                            if (authorized != null) {
                                color = units >= authorized ? 'hsl(142 71% 35%)' : 'hsl(0 72% 45%)';
                            }
                            return (
                                <span key={code} style={{ color, marginLeft: i > 0 ? 12 : 0 }}>
                                    {code}:{units}{authorized != null ? `/${authorized}` : ''}
                                </span>
                            );
                        })}
                    </span>
                )}
            </div>
            <table className="payroll-visits-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Employee</th>
                        <th>Service</th>
                        <th>Date</th>
                        <th>In</th>
                        <th>Out</th>
                        <th>Status</th>
                        <th>Units (Raw)</th>
                        <th>Final Units</th>
                        <th>Overlap</th>
                        <th>Void / Review Reason</th>
                        <th>Notes / Exceptions</th>
                    </tr>
                </thead>
                <tbody>
                    {visits.map((v) => {
                        const empColor = employeeColorMap?.get((v.employeeName || '').toLowerCase().trim());
                        const originals = mergedOriginalsMap?.get(v.id);
                        return (
                        <Fragment key={v.id}>
                        <tr className={visitRowClass(v)} style={empColor ? { borderLeft: `4px solid ${empColor}` } : undefined}>
                            <td>
                                <PayrollEditableText
                                    value={v.clientName}
                                    placeholder="missing client…"
                                    highlight={!v.clientName}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { clientName: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                />
                            </td>
                            <td style={empColor ? { color: empColor, fontWeight: 600, whiteSpace: 'nowrap' } : undefined}>
                                <PayrollEditableText
                                    value={v.employeeName}
                                    placeholder="missing employee…"
                                    highlight={!v.employeeName || /^\d+$/.test(v.employeeName)}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { employeeName: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                />
                            </td>
                            <td>{v.service || '—'}</td>
                            <td>{v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-US', { timeZone: 'UTC' }) : <em style={{ color: 'hsl(270 50% 40%)' }}>missing</em>}</td>
                            <td style={v.earlyCallIn ? { background: 'hsl(38 96% 88%)', fontWeight: 600 } : undefined}>
                                <PayrollEditableText
                                    value={v.callInTime}
                                    displayValue={hhmm12(v.callInTime)}
                                    placeholder="HH:MM"
                                    highlight={!v.callInTime || v.callInTime === '00:00'}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { callInTime: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                    width={75}
                                />
                            </td>
                            <td style={(v.lateCallOut || v.nextDayCallOut) ? { background: 'hsl(38 96% 88%)', fontWeight: 600 } : undefined}>
                                <PayrollEditableText
                                    value={v.callOutTime}
                                    displayValue={hhmm12(v.callOutTime)}
                                    placeholder="HH:MM"
                                    highlight={!v.callOutTime || v.callOutTime === '00:00'}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { callOutTime: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                    width={75}
                                />
                            </td>
                            <td>{v.visitStatus}</td>
                            <td style={v.unitsRaw > 28 && !v.voidFlag && !v.needsReview ? { background: 'hsl(0 84% 92%)', fontWeight: 700 } : undefined}>{v.unitsRaw}</td>
                            <td>
                                <PayrollEditableUnits
                                    visit={v}
                                    onChange={(newUnits) => onVisitChange(v.id, { finalPayableUnits: newUnits })}
                                />
                            </td>
                            <td>{v.overlapId || ''}</td>
                            <td>
                                {v.needsReview
                                    ? <span style={{ color: 'hsl(270 50% 40%)', fontWeight: 600 }}>{v.reviewReason}</span>
                                    : (v.voidReason || '')}
                            </td>
                            <td>
                                <PayrollEditableNotes
                                    visit={v}
                                    onChange={(newNotes) => onVisitChange(v.id, { notes: newNotes })}
                                />
                            </td>
                        </tr>
                        {originals && originals.map((orig) => {
                            const s = { color: 'hsl(240 3.8% 46.1%)', fontSize: 12 };
                            return (
                            <tr key={`orig-${orig.id}`} className="payroll-row--merged-original">
                                <td style={{ paddingLeft: 24 }}>
                                    <span style={s}>↳ {orig.clientName || ''}</span>
                                </td>
                                <td><span style={s}>{orig.employeeName || ''}</span></td>
                                <td><span style={s}>{orig.service || '—'}</span></td>
                                <td><span style={s}>{orig.visitDate ? new Date(orig.visitDate).toLocaleDateString('en-US', { timeZone: 'UTC' }) : ''}</span></td>
                                <td><span style={s}>{hhmm12(orig.callInTime) || '—'}</span></td>
                                <td><span style={s}>{hhmm12(orig.callOutTime) || '—'}</span></td>
                                <td><span style={{ ...s, fontStyle: 'italic' }}>{orig.visitStatus || ''}</span></td>
                                <td><span style={s}>{orig.unitsRaw || ''}</span></td>
                                <td><span style={s}>{orig.finalPayableUnits || ''}</span></td>
                                <td><span style={s}>{orig.overlapId || ''}</span></td>
                                <td><span style={s}>{orig.reviewReason || ''}</span></td>
                                <td><span style={s}>{orig.notes || ''}</span></td>
                            </tr>
                            );
                        })}
                        </Fragment>
                        );
                    })}
                    <tr className="payroll-total-row">
                        <td colSpan={8} style={{ textAlign: 'right' }}>TOTAL</td>
                        <td>{total}</td>
                        <td colSpan={3}></td>
                    </tr>
                    {employeeTotals.length > 0 && (
                        <tr className="payroll-employee-totals-row">
                            <td colSpan={12}>
                                <span className="payroll-employee-totals__label">By Employee:</span>
                                {employeeTotals.map(([emp, { units, voidUnits }]) => (
                                    <span key={emp} className="payroll-employee-totals__item">
                                        <span className="payroll-employee-totals__name" style={employeeColorMap?.get(emp.toLowerCase().trim()) ? { color: employeeColorMap.get(emp.toLowerCase().trim()) } : undefined}>{emp}</span>
                                        <span className="payroll-employee-totals__units">{units} units · {(units / 4).toFixed(2)} hrs</span>
                                        {voidUnits > 0 && <span className="payroll-employee-totals__void">{voidUnits} void</span>}
                                    </span>
                                ))}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ────────────────────────────────────────
// PayrollEditableText — generic inline text editor for any visit field
// Used for clientName, employeeName, callInTime, callOutTime
// ────────────────────────────────────────
function PayrollEditableText({ value, displayValue, placeholder, highlight, onSave, width = 130 }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft]     = useState(value || '');
    const [saving, setSaving]   = useState(false);

    // keep draft in sync if parent updates the value (e.g. after server recalc)
    const prevValue = useRef(value);
    if (prevValue.current !== value) {
        prevValue.current = value;
        if (!editing) setDraft(value || '');
    }

    const commit = async () => {
        const trimmed = draft.trim();
        if (trimmed === (value || '').trim()) { setEditing(false); return; }
        setSaving(true);
        try {
            await onSave(trimmed);
        } catch (_) {
            setDraft(value || '');
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
                }}
                autoFocus
                placeholder={placeholder}
                style={{ width, padding: '2px 6px', fontSize: 13 }}
            />
        );
    }

    const isEmpty = !value || value === '00:00';
    return (
        <span
            title="Click to edit"
            onClick={() => { setDraft(value || ''); setEditing(true); }}
            style={{
                cursor: 'pointer',
                color: isEmpty || highlight ? 'hsl(270 50% 40%)' : 'inherit',
                fontStyle: isEmpty ? 'italic' : 'normal',
                fontWeight: highlight && !isEmpty ? 600 : 'normal',
                borderBottom: '1px dashed hsl(var(--border))',
                paddingBottom: 1,
                opacity: saving ? 0.5 : 1,
                whiteSpace: 'nowrap',
            }}
        >
            {isEmpty ? placeholder : (displayValue ?? value)}
        </span>
    );
}

// ────────────────────────────────────────
// PayrollEditableUnits — inline number editor
// ────────────────────────────────────────
function PayrollEditableUnits({ visit, onChange }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue]     = useState(String(visit.finalPayableUnits));
    const [saving, setSaving]   = useState(false);

    const commit = async () => {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0 || n === visit.finalPayableUnits) {
            setValue(String(visit.finalPayableUnits));
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await api.updatePayrollVisit(visit.id, { finalPayableUnits: n });
            onChange(n);
        } catch (_) {
            setValue(String(visit.finalPayableUnits));
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (visit.voidFlag) return <span style={{ color: 'hsl(var(--destructive))' }}>VOID</span>;

    if (editing) {
        return (
            <input
                type="number" min="0" max="112"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(String(visit.finalPayableUnits)); setEditing(false); } }}
                autoFocus
                style={{ width: 56, padding: '2px 4px', fontSize: 13, textAlign: 'center' }}
            />
        );
    }

    return (
        <span
            title="Click to edit"
            onClick={() => { setValue(String(visit.finalPayableUnits)); setEditing(true); }}
            style={{ cursor: 'pointer', borderBottom: '1px dashed hsl(var(--border))', paddingBottom: 1, opacity: saving ? 0.5 : 1 }}
        >
            {visit.finalPayableUnits}
        </span>
    );
}

// ────────────────────────────────────────
// PayrollEditableNotes — inline text editor
// ────────────────────────────────────────
function PayrollEditableNotes({ visit, onChange }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue]     = useState(visit.notes || '');
    const [saving, setSaving]   = useState(false);

    const commit = async () => {
        const trimmed = value.trim();
        if (trimmed === (visit.notes || '').trim()) { setEditing(false); return; }
        setSaving(true);
        try {
            await api.updatePayrollVisit(visit.id, { notes: trimmed });
            onChange(trimmed);
        } catch (_) {
            setValue(visit.notes || '');
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(visit.notes || ''); setEditing(false); } }}
                autoFocus
                placeholder="Add note…"
                style={{ width: 200, padding: '2px 6px', fontSize: 13 }}
            />
        );
    }

    return (
        <span
            title="Click to edit"
            onClick={() => { setValue(visit.notes || ''); setEditing(true); }}
            style={{ cursor: 'pointer', color: value ? 'inherit' : 'hsl(240 3.8% 46.1%)', fontStyle: value ? 'normal' : 'italic', borderBottom: '1px dashed hsl(var(--border))', paddingBottom: 1, opacity: saving ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
            {value || 'add note…'}
        </span>
    );
}

// ────────────────────────────────────────
// PayrollRunDetail
// ────────────────────────────────────────
function PayrollRunDetail({ run, onVisitChange, authMap }) {
    const [search, setSearch] = useState('');
    const [legendFilter, setLegendFilter] = useState(null);

    // Build lookup: mergedVisitId → [originalRows] for displaying originals under merged rows
    const mergedOriginalsMap = useMemo(() => {
        const map = new Map();
        for (const v of run.visits) {
            if (v.mergedInto != null) {
                if (!map.has(v.mergedInto)) map.set(v.mergedInto, []);
                map.get(v.mergedInto).push(v);
            }
        }
        return map;
    }, [run.visits]);

    const visibleVisits = useMemo(() => {
        // Exclude mergedInto reference rows — they are shown inline under their parent
        const all = run.visits.filter((v) => v.mergedInto == null);

        const byFilter = legendFilter ? all.filter((v) => {
            if (legendFilter === 'void')        return v.voidFlag;
            if (legendFilter === 'incomplete')  return v.isIncomplete;
            if (legendFilter === 'unauthorized') return v.isUnauthorized;
            if (legendFilter === 'overlap')     return !!v.overlapId;
            if (legendFilter === 'overcap')     return v.unitsRaw > 28 && !v.voidFlag;
            if (legendFilter === 'timeflag')    return v.earlyCallIn || v.lateCallOut || v.nextDayCallOut;
            if (legendFilter === 'review')      return v.needsReview;
            return true;
        }) : all;

        if (!search.trim()) return byFilter;
        const q = search.trim().toLowerCase();
        return byFilter.filter((v) =>
            (v.clientName || '').toLowerCase().includes(q) ||
            (v.employeeName || '').toLowerCase().includes(q)
        );
    }, [run.visits, search, legendFilter]);

    // Service code sort order: PCS → S5125 → S5130 → S5150 → S5135 → SDPC
    const svcOrder = { PCS: 0, S5125: 1, S5130: 2, S5150: 3, S5135: 4, SDPC: 5 };
    const clientGroups = useMemo(() => {
        const map = new Map();
        for (const v of visibleVisits) {
            const key = v.clientName || '(Unknown Client)';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(v);
        }
        // Sort visits within each group: by service code first, then by date
        for (const [, arr] of map) {
            arr.sort((a, b) => {
                const sa = svcOrder[a.serviceCode] ?? 99;
                const sb = svcOrder[b.serviceCode] ?? 99;
                if (sa !== sb) return sa - sb;
                const da = a.visitDate ? new Date(a.visitDate).getTime() : 0;
                const db = b.visitDate ? new Date(b.visitDate).getTime() : 0;
                return da - db;
            });
        }
        // Sort client groups: real names first (alphabetical), then unknown/phone/needsReview at bottom
        const isUnknownClient = (name) => !name || name === '(Unknown Client)' || /^\d/.test(name) || /^\(/.test(name);
        const allNeedsReview = (visits) => visits.every((v) => v.needsReview);
        return [...map.entries()].sort((a, b) => {
            const aBottom = isUnknownClient(a[0]) || allNeedsReview(a[1]);
            const bBottom = isUnknownClient(b[0]) || allNeedsReview(b[1]);
            if (aBottom !== bBottom) return aBottom ? 1 : -1;
            return a[0].localeCompare(b[0]);
        });
    }, [visibleVisits]);

    return (
        <div>
            <div className="payroll-legend">
                {[
                    { key: 'void',         label: 'Void',                                                      cls: 'void' },
                    { key: 'incomplete',   label: 'Incomplete',                                                cls: 'incomplete' },
                    { key: 'unauthorized', label: 'Unauthorized',                                              cls: 'unauthorized' },
                    { key: 'overlap',      label: 'Overlap',                                                   cls: 'overlap' },
                    { key: 'overcap',      label: 'Over daily cap (28 units)',                                  cls: 'overcap' },
                    { key: 'timeflag',     label: 'Time violation (In <4:30 AM / Out >11:30 PM / next day)',   cls: 'timeflag' },
                    { key: 'review',       label: 'Needs Review',                                              cls: 'review' },
                ].map(({ key, label, cls }) => (
                    <button
                        key={key}
                        type="button"
                        className={`payroll-legend__item payroll-legend__item--${cls}${legendFilter === key ? ' payroll-legend__item--active' : ''}`}
                        onClick={() => setLegendFilter((f) => f === key ? null : key)}
                        title={legendFilter === key ? 'Click to clear filter' : `Click to filter by: ${label}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div style={{ margin: '12px 0' }}>
                <input
                    type="search"
                    placeholder="Search by client or employee…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: 280, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                />
                {search && (
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>
                        {visibleVisits.length} visit{visibleVisits.length !== 1 ? 's' : ''} found
                    </span>
                )}
            </div>

            {clientGroups.map(([clientName, visits]) => (
                <PayrollClientGroup key={clientName} clientName={clientName} visits={visits} onVisitChange={onVisitChange} authMap={authMap} mergedOriginalsMap={mergedOriginalsMap} />
            ))}

            {clientGroups.length === 0 && (
                <p style={{ color: 'hsl(240 3.8% 46.1%)', fontStyle: 'italic' }}>
                    {search ? `No visits match "${search}".` : 'No visit records in this run.'}
                </p>
            )}
        </div>
    );
}

// ────────────────────────────────────────
// PayrollPage
// ────────────────────────────────────────
function PayrollPage({ showToast, initialRunId, onNavigate }) {
    const [runs, setRuns]               = useState([]);
    const [selectedRun, setSelectedRun] = useState(null);
    const [loading, setLoading]         = useState(true);
    const [modal, setModal]             = useState(null);
    const [exporting, setExporting]     = useState(false);

    // Optimistically update a visit field in selectedRun state after a successful PATCH
    // patch may be a plain object (optimistic update) or a full visit from the server
    const handleVisitChange = useCallback((visitId, patch) => {
        setSelectedRun((prev) => {
            if (!prev) return prev;
            const visits = prev.visits.map((v) => v.id === visitId ? { ...v, ...patch } : v);
            const totalPayable = visits.filter((v) => !v.voidFlag && !v.needsReview && v.mergedInto == null).reduce((s, v) => s + v.finalPayableUnits, 0);
            return { ...prev, visits, totalPayable };
        });
    }, []);

    const loadRuns = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getPayrollRuns();
            setRuns(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadRuns(); }, [loadRuns]);

    // On mount (or when initialRunId changes from URL), load that run
    useEffect(() => {
        if (!initialRunId) return;
        api.getPayrollRun(initialRunId)
            .then(setSelectedRun)
            .catch(() => onNavigate('payroll')); // run not found — fall back to list
    }, [initialRunId, onNavigate]);

    const handleRunClick = async (run) => {
        try {
            const full = await api.getPayrollRun(run.id);
            setSelectedRun(full);
            onNavigate(`payroll/runs/${run.id}`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleUpload = (run) => {
        setModal(null);
        showToast('Payroll run processed successfully.', 'success');
        loadRuns();
        setSelectedRun(run);
        onNavigate(`payroll/runs/${run.id}`);
    };

    const handleDelete = async (run) => {
        try {
            await api.deletePayrollRun(run.id);
            showToast('Payroll run deleted.', 'success');
            setModal(null);
            if (selectedRun?.id === run.id) {
                setSelectedRun(null);
                onNavigate('payroll');
            }
            loadRuns();
        } catch (err) {
            showToast(err.message, 'error');
            setModal(null);
        }
    };

    const handleExport = async () => {
        if (!selectedRun) return;
        setExporting(true);
        try {
            const res = await fetch(`/api/payroll/runs/${selectedRun.id}/export`, {
                headers: { Authorization: `Bearer ${api.getToken()}` },
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `payroll_${selectedRun.name.replace(/\s+/g, '_')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setExporting(false);
        }
    };

    if (selectedRun) {
        return (
            <div>
                <div className="content-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="btn btn--outline btn--sm" onClick={() => { setSelectedRun(null); onNavigate('payroll'); }}>
                            ← Back
                        </button>
                        <h1 className="content-header__title">{selectedRun.name}</h1>
                        <span style={{ fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>
                            {selectedRun.totalVisits} visits · {selectedRun.totalPayable} payable units
                        </span>
                    </div>
                    <div className="content-header__actions">
                        <button className="btn btn--primary btn--sm" onClick={handleExport} disabled={exporting}>
                            {Icons.download} {exporting ? 'Exporting…' : 'Export XLSX'}
                        </button>
                    </div>
                </div>
                <div className="page-content">
                    <PayrollRunDetail run={selectedRun} onVisitChange={handleVisitChange} authMap={selectedRun.authMap || {}} />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="content-header">
                <h1 className="content-header__title">Payroll Runs</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'upload' })}>
                        {Icons.upload} New Run
                    </button>
                </div>
            </div>
            <div className="page-content">
                {loading ? (
                    <p style={{ color: 'hsl(240 3.8% 46.1%)' }}>Loading…</p>
                ) : runs.length === 0 ? (
                    <p style={{ color: 'hsl(240 3.8% 46.1%)', fontStyle: 'italic' }}>No payroll runs yet. Upload an XLSX to get started.</p>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Run Name</th>
                                    <th>File</th>
                                    <th>Period</th>
                                    <th>Visits</th>
                                    <th>Payable Units</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((run) => (
                                    <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => handleRunClick(run)}>
                                        <td style={{ fontWeight: 500 }}>{run.name}</td>
                                        <td style={{ fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>{run.fileName}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {run.periodStart ? fmtDate(run.periodStart) : '—'}
                                            {run.periodEnd   ? ` – ${fmtDate(run.periodEnd)}` : ''}
                                        </td>
                                        <td>{run.totalVisits}</td>
                                        <td>{run.totalPayable}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                                fontSize: 11, fontWeight: 600,
                                                background: run.status === 'done' ? 'hsl(142 76% 96%)' : run.status === 'error' ? 'hsl(0 93% 97%)' : 'hsl(38 100% 96%)',
                                                color:      run.status === 'done' ? 'hsl(142 71% 35%)' : run.status === 'error' ? 'hsl(0 84% 45%)' : 'hsl(38 92% 35%)',
                                            }}>
                                                {run.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12 }}>{fmtDate(run.createdAt)}</td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="btn btn--danger-ghost btn--icon"
                                                title="Delete run"
                                                onClick={() => setModal({ type: 'confirmDelete', run })}
                                            >
                                                {Icons.trash}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal?.type === 'upload' && (
                <PayrollUploadModal onUpload={handleUpload} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Payroll Run"
                    message={`This will permanently delete the run "${modal.run.name}" and all ${modal.run.totalVisits} visit records. This action cannot be undone.`}
                    onConfirm={() => handleDelete(modal.run)}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}

// ────────────────────────────────────────
// Scheduling
// ────────────────────────────────────────

const SERVICE_COLORS = {
    PCS:   { color: '#3B82F6', bg: '#EFF6FF', label: 'PCA' },
    S5125: { color: '#22C55E', bg: '#F0FDF4', label: 'Attendant Care' },
    S5130: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Homemaker' },
    SDPC:  { color: '#F59E0B', bg: '#FFFBEB', label: 'SDPC' },
    S5135: { color: '#EC4899', bg: '#FDF2F8', label: 'Companion' },
    S5150: { color: '#06B6D4', bg: '#ECFEFF', label: 'Respite' },
};

function ShiftFormModal({ shift, clients, employees, onSave, onDelete, onClose, defaultDate, defaultClientId, defaultEmployeeId }) {
    const [clientId, setClientId] = useState(shift?.clientId || defaultClientId || '');
    const [employeeMode, setEmployeeMode] = useState(shift?.employeeId ? 'select' : (shift?.employeeName ? 'type' : 'select'));
    const [employeeId, setEmployeeId] = useState(shift?.employeeId || defaultEmployeeId || '');
    const [employeeName, setEmployeeName] = useState(shift?.displayEmployeeName || shift?.employeeName || '');
    const [serviceCode, setServiceCode] = useState(shift?.serviceCode || 'PCS');
    const [shiftDate, setShiftDate] = useState(shift?.shiftDate ? toLocalDateStr(shift.shiftDate) : (defaultDate || ''));
    const [startTime, setStartTime] = useState(shift?.startTime || '09:00');
    const [endTime, setEndTime] = useState(shift?.endTime || '13:00');
    const [notes, setNotes] = useState(shift?.notes || '');
    const [status, setStatus] = useState(shift?.status || 'scheduled');
    const [recurring, setRecurring] = useState(false);
    const [repeatUntil, setRepeatUntil] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const computeHours = () => {
        if (!startTime || !endTime) return { hours: 0, units: 0 };
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        const hours = Math.round(((endMin - startMin) / 60) * 100) / 100;
        return { hours, units: Math.round(hours * 4) };
    };

    const { hours, units } = computeHours();
    const colorInfo = SERVICE_COLORS[serviceCode] || { color: '#6B7280', label: serviceCode };

    // Compute how many total shifts the recurring option will create (including original)
    const recurringCount = (() => {
        if (!recurring || !repeatUntil || !shiftDate) return 0;
        const start = new Date(shiftDate + 'T12:00:00Z');
        const end = new Date(repeatUntil + 'T12:00:00Z');
        if (end < start) return 0;
        return Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    })();
    // Min date for repeat-until: at least 7 days after shiftDate
    const repeatUntilMin = (() => {
        if (!shiftDate) return '';
        const d = new Date(shiftDate + 'T12:00:00Z');
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
    })();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = { clientId: Number(clientId), serviceCode, shiftDate, startTime, endTime, notes };
            if (employeeMode === 'select' && employeeId) {
                data.employeeId = Number(employeeId);
                // Also store the name for display
                const emp = employees.find(u => String(u.id) === String(employeeId));
                data.employeeName = emp?.name || '';
            } else {
                data.employeeName = employeeName;
            }
            if (shift) data.status = status;
            if (!shift && recurring && repeatUntil) data.repeatUntil = repeatUntil;
            await onSave(data);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{shift ? 'Edit Shift' : 'Create Shift'}</h2>
            <p className="modal__desc">{shift ? 'Update the shift details below.' : 'Schedule a new caregiver shift.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftClient">Client</label>
                        <select id="shiftClient" value={clientId} onChange={e => setClientId(e.target.value)} required>
                            <option value="">Select client…</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftEmployee">Employee</label>
                        <div className="sched-emp-toggle">
                            <button type="button" className={`sched-emp-toggle__btn ${employeeMode === 'select' ? 'sched-emp-toggle__btn--active' : ''}`} onClick={() => setEmployeeMode('select')}>Select</button>
                            <button type="button" className={`sched-emp-toggle__btn ${employeeMode === 'type' ? 'sched-emp-toggle__btn--active' : ''}`} onClick={() => setEmployeeMode('type')}>Type name</button>
                        </div>
                        {employeeMode === 'select' ? (
                            <select id="shiftEmployee" value={employeeId} onChange={e => { setEmployeeId(e.target.value); const emp = employees.find(u => String(u.id) === e.target.value); setEmployeeName(emp?.name || ''); }} required>
                                <option value="">Select employee…</option>
                                {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        ) : (
                            <input id="shiftEmployee" type="text" value={employeeName} onChange={e => { setEmployeeName(e.target.value); setEmployeeId(''); }} placeholder="Type employee name…" required />
                        )}
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftService">Service</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorInfo.color, flexShrink: 0 }} />
                            <select id="shiftService" value={serviceCode} onChange={e => setServiceCode(e.target.value)} style={{ flex: 1 }}>
                                {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                    <option key={code} value={code}>{info.label} ({code})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftDate">Date</label>
                        <input id="shiftDate" type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} required />
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftStart">Start Time</label>
                        <input id="shiftStart" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftEnd">End Time</label>
                        <input id="shiftEnd" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
                    </div>
                </div>
                <div className="sched-hours-display" style={{ borderLeftColor: colorInfo.color }}>
                    <span className="sched-hours-display__value">{hours}</span>
                    <span className="sched-hours-display__label">hours</span>
                    <span className="sched-hours-display__sep">/</span>
                    <span className="sched-hours-display__value">{units}</span>
                    <span className="sched-hours-display__label">units</span>
                </div>
                {!shift && (
                    <div className="sched-recurring">
                        <label className="sched-recurring__toggle">
                            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
                            <span>Repeat weekly</span>
                        </label>
                        {recurring && (
                            <div className="sched-recurring__options">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="repeatUntil">Repeat until</label>
                                    <input
                                        id="repeatUntil"
                                        type="date"
                                        value={repeatUntil}
                                        onChange={e => setRepeatUntil(e.target.value)}
                                        min={repeatUntilMin || shiftDate}
                                        required={recurring}
                                    />
                                </div>
                                {recurringCount > 1 && (
                                    <div className="sched-recurring__preview">
                                        Will create <strong>{recurringCount} total shifts</strong> (1 original + {recurringCount - 1} repeat{recurringCount - 1 > 1 ? 's' : ''}) — {recurringCount * units} total units
                                    </div>
                                )}
                                {recurring && repeatUntil && recurringCount <= 1 && (
                                    <div className="sched-recurring__preview" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Select a date at least 1 week after the shift date.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {shift && (
                    <div className="form-group">
                        <label htmlFor="shiftStatus">Status</label>
                        <select id="shiftStatus" value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="shiftNotes">Notes</label>
                    <input id="shiftNotes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
                </div>
                <div className="form-actions">
                    {shift && !confirmDelete && (
                        <button type="button" className="btn btn--outline" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
                            {Icons.trash} Delete
                        </button>
                    )}
                    {shift && confirmDelete && (
                        <div style={{ display: 'flex', gap: 6, marginRight: 'auto' }}>
                            <button type="button" className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => onDelete(shift.id, false)}>
                                Delete This Shift
                            </button>
                            {shift.recurringGroupId && (
                                <button type="button" className="btn" style={{ background: 'hsl(0 60% 45%)', color: '#fff' }} onClick={() => onDelete(shift.id, true)}>
                                    Delete All in Series
                                </button>
                            )}
                        </div>
                    )}
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : shift ? 'Update Shift' : 'Create Shift'}</button>
                </div>
            </form>
        </Modal>
    );
}

function ScheduleCard({ title, icon, headerActions, children }) {
    return (
        <div className="sched-card">
            <div className="sched-card__header">
                <div className="sched-card__header-left">
                    <span className="sched-card__header-icon">{icon}</span>
                    <span className="sched-card__header-title">{title}</span>
                </div>
                {headerActions && <div className="sched-card__header-actions">{headerActions}</div>}
            </div>
            <div className="sched-card__body">{children}</div>
        </div>
    );
}

function AuthSummaryBar({ unitSummary }) {
    if (!unitSummary || Object.keys(unitSummary).length === 0) return null;
    let totalAuth = 0, totalSched = 0;
    for (const data of Object.values(unitSummary)) {
        totalAuth += data.authorized || 0;
        totalSched += data.scheduled || 0;
    }
    const totalAuthHrs = Math.round((totalAuth / 4) * 100) / 100;
    const totalSchedHrs = Math.round((totalSched / 4) * 100) / 100;
    const remainHrs = Math.round((totalAuthHrs - totalSchedHrs) * 100) / 100;
    return (
        <div className="sched-auth-bar">
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Authorized Hours</span>
                <span className="sched-auth-bar__value">{totalAuthHrs} hrs</span>
            </div>
            <div className="sched-auth-bar__sep" />
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Scheduled Hours</span>
                <span className="sched-auth-bar__value sched-auth-bar__value--sched">{totalSchedHrs} hrs</span>
            </div>
            <div className="sched-auth-bar__sep" />
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Hours Remaining</span>
                <span className={`sched-auth-bar__value ${remainHrs < 0 ? 'sched-auth-bar__value--over' : 'sched-auth-bar__value--remain'}`}>{remainHrs} hrs</span>
            </div>
            {Object.entries(unitSummary).map(([code, data]) => {
                const colorInfo = SERVICE_COLORS[code] || { color: '#6B7280', label: code };
                return (
                    <Fragment key={code}>
                        <div className="sched-auth-bar__sep" />
                        <div className="sched-auth-bar__item sched-auth-bar__item--service">
                            <span className="sched-auth-bar__dot" style={{ background: colorInfo.color }} />
                            <span className="sched-auth-bar__label">{colorInfo.label}</span>
                            <span className="sched-auth-bar__value">{data.scheduled}/{data.authorized}u</span>
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}

// Helper: get YYYY-MM-DD from a date value.
// For ISO strings from the server (stored as UTC midnight), extract the UTC date portion
// so a shift on "2026-03-15T00:00:00.000Z" always shows as March 15 regardless of timezone.
// For local Date objects (like our days array), use local date.
function toLocalDateStr(d) {
    if (typeof d === 'string') {
        // If it looks like an ISO string with 'T', extract YYYY-MM-DD from the string directly
        const idx = d.indexOf('T');
        if (idx === 10) return d.slice(0, 10);
        return new Date(d).toISOString().slice(0, 10);
    }
    // For Date objects (our locally-constructed day array), use local date parts
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ScheduleTimeGrid({ shifts, weekStart, onAddShift, onEditShift, viewMode, overlapIds }) {
    const days = [];
    const ws = new Date(weekStart + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days.push(d);
    }
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayStr = toLocalDateStr(new Date());

    // Determine visible hour range from shifts (default 7 AM – 9 PM)
    let minHour = 7, maxHour = 21;
    for (const s of shifts) {
        if (s.status === 'cancelled') continue;
        const [sh] = (s.startTime || '09:00').split(':').map(Number);
        const [eh, em] = (s.endTime || '13:00').split(':').map(Number);
        const endH = em > 0 ? eh + 1 : eh;
        if (sh < minHour) minHour = sh;
        if (endH > maxHour) maxHour = endH;
    }
    minHour = Math.max(0, minHour - 1);
    maxHour = Math.min(24, maxHour + 1);
    const hours = [];
    for (let h = minHour; h < maxHour; h++) hours.push(h);
    const totalMinutes = (maxHour - minHour) * 60;

    const toPercent = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        const mins = h * 60 + m - minHour * 60;
        return Math.max(0, Math.min(100, (mins / totalMinutes) * 100));
    };

    const fmtHour = (h) => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;

    return (
        <div className="sched-tg">
            {/* Header: hour labels across the top */}
            <div className="sched-tg__header">
                <div className="sched-tg__day-gutter" />
                <div className="sched-tg__hour-strip">
                    {hours.map(h => (
                        <span key={h} className="sched-tg__hour-label" style={{ left: `${((h - minHour) / (maxHour - minHour)) * 100}%` }}>
                            {fmtHour(h)}
                        </span>
                    ))}
                </div>
            </div>

            {/* Rows: one per day */}
            {days.map((day, i) => {
                const dateStr = toLocalDateStr(day);
                const isToday = dateStr === todayStr;
                const dayShifts = shifts.filter(s => toLocalDateStr(s.shiftDate) === dateStr);

                return (
                    <div key={i} className={`sched-tg__row ${isToday ? 'sched-tg__row--today' : ''}`}>
                        {/* Day label */}
                        <div className="sched-tg__day-gutter" onClick={() => onAddShift(dateStr)} title="Add shift">
                            <span className="sched-tg__day-abbr">{dayAbbr[i]}</span>
                            <span className="sched-tg__day-num">{day.getMonth() + 1}/{day.getDate()}</span>
                        </div>

                        {/* Timeline area */}
                        {(() => {
                            // Pre-compute stacking depths to size the timeline
                            const blocks = dayShifts.map((s, si) => {
                                const left = toPercent(s.startTime || '09:00');
                                let right = toPercent(s.endTime || '13:00');
                                if (right <= left) right = 100;
                                return { left, right, width: Math.max(right - left, 2) };
                            });
                            let maxStack = 0;
                            for (let si = 0; si < blocks.length; si++) {
                                let depth = 0;
                                for (let oi = 0; oi < si; oi++) {
                                    if (blocks[si].left < blocks[oi].left + blocks[oi].width && blocks[oi].left < blocks[si].left + blocks[si].width) depth++;
                                }
                                if (depth > maxStack) maxStack = depth;
                            }
                            const timelineHeight = Math.max(48, 4 + (maxStack + 1) * 30);

                            return (
                                <div className="sched-tg__timeline" style={{ minHeight: timelineHeight + 'px' }} onClick={(e) => { if (e.target === e.currentTarget) onAddShift(dateStr); }}>
                                    {hours.map(h => (
                                        <div key={h} className="sched-tg__vline" style={{ left: `${((h - minHour) / (maxHour - minHour)) * 100}%` }} />
                                    ))}
                                    {dayShifts.map((s, si) => {
                                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: s.serviceCode };
                                        const isOverlap = overlapIds && overlapIds.has(s.id);
                                        const isCancelled = s.status === 'cancelled';
                                        const { left, width } = blocks[si];

                                        let depth = 0;
                                        for (let oi = 0; oi < si; oi++) {
                                            if (left < blocks[oi].left + blocks[oi].width && blocks[oi].left < left + width) depth++;
                                        }
                                        const topOffset = depth * 30;

                                        return (
                                            <button
                                                key={s.id}
                                                className={`sched-tg__block ${isCancelled ? 'sched-tg__block--cancelled' : ''} ${isOverlap ? 'sched-tg__block--overlap' : ''}`}
                                                style={{
                                                    left: left + '%',
                                                    width: width + '%',
                                                    top: 2 + topOffset + 'px',
                                                    '--block-color': colorInfo.color,
                                                    '--block-bg': isOverlap ? 'hsl(0 84% 97%)' : colorInfo.bg,
                                                }}
                                                onClick={(e) => { e.stopPropagation(); onEditShift(s); }}
                                                title={`${colorInfo.label} — ${hhmm12(s.startTime)} - ${hhmm12(s.endTime)} (${s.hours}h)`}
                                            >
                                                <span className="sched-tg__block-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span>
                                                <span className="sched-tg__block-time">{hhmm12(s.startTime)}-{hhmm12(s.endTime)}</span>
                                                {viewMode === 'client' && <span className="sched-tg__block-label">{s.displayEmployeeName || 'Unassigned'}</span>}
                                                {viewMode === 'employee' && <span className="sched-tg__block-label">{s.client?.clientName || ''}</span>}
                                                {viewMode === 'overview' && <span className="sched-tg__block-label">{s.client?.clientName || ''}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                );
            })}
        </div>
    );
}

function ScheduleOverviewTable({ shifts, overlapIds, onEditShift }) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sorted = [...shifts].sort((a, b) => {
        const da = new Date(a.shiftDate).getTime();
        const db = new Date(b.shiftDate).getTime();
        if (da !== db) return da - db;
        return (a.startTime || '').localeCompare(b.startTime || '');
    });

    return (
        <div className="sched-overview-table-wrap">
            <table className="sched-overview-table">
                <thead>
                    <tr>
                        <th>Day</th>
                        <th>Client</th>
                        <th>Employee</th>
                        <th>Service</th>
                        <th>Time</th>
                        <th>Hours</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'hsl(var(--muted-foreground))' }}>No shifts this week</td></tr>
                    )}
                    {sorted.map(s => {
                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', label: s.serviceCode };
                        const isOverlap = overlapIds && overlapIds.has(s.id);
                        const dateStr = toLocalDateStr(s.shiftDate);
                        const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
                        return (
                            <tr key={s.id} className={`sched-overview-table__row ${isOverlap ? 'sched-overview-table__row--overlap' : ''} ${s.status === 'cancelled' ? 'sched-overview-table__row--cancelled' : ''}`} onClick={() => onEditShift(s)} style={{ cursor: 'pointer' }}>
                                <td>{dayNames[dayIdx]}</td>
                                <td>{s.client?.clientName || '—'}</td>
                                <td>{s.displayEmployeeName || '—'}</td>
                                <td><span className="sched-service-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span></td>
                                <td className="sched-overview-table__time">{hhmm12(s.startTime)} - {hhmm12(s.endTime)}</td>
                                <td>{s.hours}h</td>
                                <td><span className={`sched-status sched-status--${s.status}`}>{s.status}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function SchedulingPage({ showToast, clients, onRefreshClients }) {
    const [shifts, setShifts] = useState([]);
    const [overlaps, setOverlaps] = useState([]);
    const [unitSummary, setUnitSummary] = useState({});
    const [unitSummaries, setUnitSummaries] = useState({});
    const [employees, setEmployees] = useState([]);
    const [freeTextNames, setFreeTextNames] = useState([]);
    const [clientInfo, setClientInfo] = useState(null);
    const [employeeInfo, setEmployeeInfo] = useState(null);
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return toLocalDateStr(d);
    });
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [viewMode, setViewMode] = useState('overview');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    const fetchEmployees = useCallback(async () => {
        try {
            const data = await api.getUsers();
            setEmployees(data);
        } catch (err) { showToast(err.message, 'error'); }
    }, [showToast]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            if (viewMode === 'client' && selectedClientId) {
                const data = await api.getClientSchedule(selectedClientId, weekStart);
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary(data.unitSummary || {});
                setUnitSummaries({});
                setClientInfo(data.client || null);
                setEmployeeInfo(null);
            } else if (viewMode === 'employee' && selectedEmployeeId) {
                // Free-text employee: value starts with "name:"
                const isFreeText = selectedEmployeeId.startsWith('name:');
                let data;
                if (isFreeText) {
                    const empName = selectedEmployeeId.slice(5);
                    data = await api.getEmployeeScheduleByName(empName, weekStart);
                } else {
                    data = await api.getEmployeeSchedule(selectedEmployeeId, weekStart);
                }
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary({});
                setUnitSummaries({});
                setClientInfo(null);
                setEmployeeInfo(data.employee || null);
            } else {
                const data = await api.getShifts(weekStart, {});
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary({});
                setUnitSummaries(data.unitSummaries || {});
                setClientInfo(null);
                setEmployeeInfo(null);
                // Extract unique free-text employee names (shifts with no employeeId)
                const names = new Set();
                for (const s of (data.shifts || [])) {
                    if (!s.employeeId && s.employeeName) names.add(s.employeeName);
                    else if (!s.employeeId && s.displayEmployeeName) names.add(s.displayEmployeeName);
                }
                setFreeTextNames([...names].sort());
            }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoading(false); }
    }, [weekStart, viewMode, selectedClientId, selectedEmployeeId, showToast]);

    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        setSelectedClientId('');
        setSelectedEmployeeId('');
        setClientInfo(null);
        setEmployeeInfo(null);
        setUnitSummary({});
    }, [viewMode]);

    const navigateWeek = (dir) => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + dir * 7);
        setWeekStart(toLocalDateStr(d));
    };

    const goToday = () => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        setWeekStart(toLocalDateStr(d));
    };

    const weekEndDate = (() => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + 6);
        return d;
    })();

    const handleSaveShift = async (data) => {
        try {
            if (modal.shift) {
                await api.updateShift(modal.shift.id, data);
                showToast('Shift updated');
            } else {
                const result = await api.createShift(data);
                if (result.count) showToast(`${result.count} recurring shifts created`);
                else showToast('Shift created');
            }
            setModal(null);
            fetchData();
        } catch (err) {
            if (err.isOverlap) {
                setModal(prev => ({ ...prev, overlapWarning: err.message, overlapData: data, overlapConflicts: err.conflicts }));
            } else {
                showToast(err.message, 'error');
            }
        }
    };

    const handleForceSaveShift = async () => {
        if (!modal?.overlapData) return;
        try {
            const data = { ...modal.overlapData, force: true };
            if (modal.shift) {
                await api.updateShift(modal.shift.id, data);
                showToast('Shift updated (overlap allowed)');
            } else {
                const result = await api.createShift(data);
                if (result.count) showToast(`${result.count} recurring shifts created (overlaps allowed)`);
                else showToast('Shift created (overlap allowed)');
            }
            setModal(null);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteShift = async (shiftId, deleteGroup = false) => {
        try {
            const result = await api.deleteShift(shiftId, { group: deleteGroup });
            const count = result?.deleted || 1;
            showToast(count > 1 ? `${count} shifts deleted` : 'Shift deleted');
            setModal(null);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAllShifts = async () => {
        try {
            const result = await api.deleteAllShifts();
            showToast(`${result.deleted} shift${result.deleted !== 1 ? 's' : ''} deleted`);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleAddShift = (dateStr) => {
        setModal({ type: 'shift', shift: null, defaultDate: dateStr });
    };

    const handleEditShift = (shift) => {
        setModal({ type: 'shift', shift });
    };

    const overlapIds = useMemo(() => {
        const set = new Set();
        for (const o of overlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [overlaps]);

    const formatWeekLabel = () => {
        const ws = new Date(weekStart + 'T00:00:00');
        const opts = { month: 'short', day: 'numeric' };
        return `${ws.toLocaleDateString('en-US', opts)} — ${weekEndDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
    };

    const displayUnitSummary = useMemo(() => {
        if (viewMode === 'client' && Object.keys(unitSummary).length > 0) return unitSummary;
        if (viewMode === 'overview' && Object.keys(unitSummaries).length > 0) {
            const combined = {};
            for (const cid of Object.keys(unitSummaries)) {
                const s = unitSummaries[cid];
                for (const code of Object.keys(s)) {
                    if (!combined[code]) combined[code] = { authorized: 0, scheduled: 0, remaining: 0 };
                    combined[code].authorized += s[code].authorized;
                    combined[code].scheduled += s[code].scheduled;
                    combined[code].remaining += s[code].remaining;
                }
            }
            return combined;
        }
        return {};
    }, [viewMode, unitSummary, unitSummaries]);

    const weekStats = useMemo(() => {
        const totalHours = shifts.reduce((sum, s) => sum + (s.status !== 'cancelled' ? (s.hours || 0) : 0), 0);
        const totalUnits = shifts.reduce((sum, s) => sum + (s.status !== 'cancelled' ? (s.units || 0) : 0), 0);
        const activeShifts = shifts.filter(s => s.status !== 'cancelled').length;
        return { totalHours: Math.round(totalHours * 100) / 100, totalUnits, activeShifts };
    }, [shifts]);

    return (
        <>
            {/* Header */}
            <div className="content-header">
                <h1 className="content-header__title">Scheduling</h1>
                <div className="content-header__actions">
                    {shifts.length > 0 && (
                        <button className="btn btn--outline btn--sm" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)' }} onClick={() => setModal({ type: 'confirmDeleteAll' })}>
                            {Icons.trash} Delete All
                        </button>
                    )}
                    <button className="btn btn--outline btn--sm" title="Send Schedule (Coming Soon)" disabled>
                        {Icons.share} Send Schedule
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'shift', shift: null })}>
                        {Icons.plus} Add Shift
                    </button>
                </div>
            </div>

            <div className="page-content">
                {/* Week Nav + View Toggle Row */}
                <div className="sched-toolbar">
                    <div className="sched-week-nav">
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(-1)}>{Icons.chevronLeft}</button>
                        <button className="btn btn--outline btn--sm" onClick={goToday}>Today</button>
                        <span className="sched-week-nav__label">{formatWeekLabel()}</span>
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(1)}>{Icons.chevronRight}</button>
                    </div>
                    <div className="sched-view-toggle">
                        <button className={`sched-view-toggle__btn ${viewMode === 'overview' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('overview')}>
                            {Icons.calendar} Overview
                        </button>
                        <button className={`sched-view-toggle__btn ${viewMode === 'client' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('client')}>
                            {Icons.user} Client
                        </button>
                        <button className={`sched-view-toggle__btn ${viewMode === 'employee' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('employee')}>
                            {Icons.users} Employee
                        </button>
                    </div>
                </div>

                {/* Overlap Warnings */}
                {overlaps.length > 0 && (
                    <div className="sched-overlap-warning">
                        {Icons.alertTriangle}
                        <div>
                            <strong>Overlap{overlaps.length > 1 ? 's' : ''} Detected ({overlaps.length})</strong>
                            <div>{overlaps.map((o, i) => <div key={i}>{o.employeeName} — {o.date}</div>)}</div>
                        </div>
                    </div>
                )}

                {/* Client View */}
                {viewMode === 'client' && (
                    <ScheduleCard
                        title="Client Schedule"
                        icon={Icons.user}
                        headerActions={
                            <select className="sched-card__select" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                                <option value="">Select a client…</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                            </select>
                        }
                    >
                        {!selectedClientId ? (
                            <div className="sched-prompt">
                                {Icons.user}
                                <div>Select a client to view their weekly schedule and authorization tracking.</div>
                            </div>
                        ) : loading ? (
                            <div className="sched-prompt">Loading…</div>
                        ) : (
                            <>
                                {clientInfo && (
                                    <div className="sched-client-info">
                                        <div className="sched-client-info__details">
                                            {clientInfo.address && <span className="sched-client-info__tag">{Icons.layoutDashboard} {clientInfo.address}</span>}
                                            {clientInfo.phone && <span className="sched-client-info__tag">{Icons.user} {clientInfo.phone}</span>}
                                            {clientInfo.gateCode && <span className="sched-client-info__tag sched-client-info__tag--gate">Gate: {clientInfo.gateCode}</span>}
                                        </div>
                                        {clientInfo.notes && <div className="sched-client-info__notes">{clientInfo.notes}</div>}
                                    </div>
                                )}
                                <AuthSummaryBar unitSummary={displayUnitSummary} />
                                <ScheduleTimeGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="client" overlapIds={overlapIds} />
                            </>
                        )}
                    </ScheduleCard>
                )}

                {/* Employee View */}
                {viewMode === 'employee' && (
                    <ScheduleCard
                        title="Employee Schedule"
                        icon={Icons.users}
                        headerActions={
                            <select className="sched-card__select" value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)}>
                                <option value="">Select an employee…</option>
                                {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                {freeTextNames.length > 0 && <option disabled>── Free-text employees ──</option>}
                                {freeTextNames.map(n => <option key={'name:' + n} value={'name:' + n}>{n}</option>)}
                            </select>
                        }
                    >
                        {!selectedEmployeeId ? (
                            <div className="sched-prompt">
                                {Icons.users}
                                <div>Select an employee to view their schedule and detect overlaps.</div>
                            </div>
                        ) : loading ? (
                            <div className="sched-prompt">Loading…</div>
                        ) : (
                            <>
                                {employeeInfo && (
                                    <div className="sched-employee-info">
                                        <strong>{employeeInfo.name}</strong>
                                        {employeeInfo.phone && <span> — {employeeInfo.phone}</span>}
                                        {employeeInfo.email && <span> — {employeeInfo.email}</span>}
                                    </div>
                                )}
                                <ScheduleTimeGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="employee" overlapIds={overlapIds} />
                            </>
                        )}
                    </ScheduleCard>
                )}

                {/* Overview: Week Stats + Schedule Table + Data Table */}
                {viewMode === 'overview' && (
                    <>
                        {!loading && shifts.length > 0 && (
                            <div className="sched-stats-bar">
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.activeShifts}</span>
                                    <span className="sched-stats-bar__label">shifts</span>
                                </div>
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.totalHours}</span>
                                    <span className="sched-stats-bar__label">hours</span>
                                </div>
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.totalUnits}</span>
                                    <span className="sched-stats-bar__label">units</span>
                                </div>
                                {overlaps.length > 0 && (
                                    <div className="sched-stats-bar__item sched-stats-bar__item--warn">
                                        <span className="sched-stats-bar__value">{overlaps.length}</span>
                                        <span className="sched-stats-bar__label">overlap{overlaps.length > 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        <AuthSummaryBar unitSummary={displayUnitSummary} />
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'hsl(var(--muted-foreground))' }}>Loading shifts…</div>
                        ) : (
                            <>
                                <ScheduleTimeGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="overview" overlapIds={overlapIds} />
                                {shifts.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>
                                        No shifts scheduled this week. Click + on any day to get started.
                                    </div>
                                )}
                            </>
                        )}

                        {/* Weekly Schedule Overview Table */}
                        {!loading && shifts.length > 0 && (
                            <ScheduleCard title="Weekly Schedule Overview" icon={Icons.table}>
                                <ScheduleOverviewTable shifts={shifts} overlapIds={overlapIds} onEditShift={handleEditShift} />
                            </ScheduleCard>
                        )}
                    </>
                )}

                {/* Service Legend */}
                <div className="sched-legend">
                    {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                        <span key={code} className="sched-legend__item">
                            <span className="sched-legend__dot" style={{ background: info.color }} />
                            {info.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Shift Modal */}
            {modal?.type === 'shift' && !modal.overlapWarning && (
                <ShiftFormModal
                    shift={modal.shift}
                    defaultDate={modal.defaultDate}
                    defaultClientId={viewMode === 'client' ? selectedClientId : ''}
                    defaultEmployeeId={viewMode === 'employee' ? selectedEmployeeId : ''}
                    clients={clients}
                    employees={employees}
                    onSave={handleSaveShift}
                    onDelete={handleDeleteShift}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Overlap Confirmation Modal */}
            {modal?.type === 'shift' && modal.overlapWarning && (
                <Modal onClose={() => setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}>
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'hsl(38 92% 50%)' }}>{Icons.alertTriangle}</span> Overlap Detected
                    </h2>
                    <div className="sched-overlap-confirm">
                        <p className="sched-overlap-confirm__msg">{modal.overlapWarning}</p>
                        {modal.overlapConflicts && modal.overlapConflicts.length > 0 && (
                            <div className="sched-overlap-confirm__list">
                                {modal.overlapConflicts.map((c, i) => (
                                    <div key={i} className="sched-overlap-confirm__item">
                                        <strong>{c.date}</strong> — conflicts with {c.conflictWith.clientName} ({hhmm12(c.conflictWith.startTime)} - {hhmm12(c.conflictWith.endTime)})
                                    </div>
                                ))}
                            </div>
                        )}
                        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: '12px 0 0' }}>
                            Do you want to create this shift anyway?
                        </p>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}>
                            Go Back
                        </button>
                        <button className="btn" style={{ background: 'hsl(38 92% 50%)', color: '#fff' }} onClick={handleForceSaveShift}>
                            Create Anyway
                        </button>
                    </div>
                </Modal>
            )}

            {/* Delete All Confirmation Modal */}
            {modal?.type === 'confirmDeleteAll' && (
                <Modal onClose={() => setModal(null)}>
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertTriangle}</span> Delete All Shifts
                    </h2>
                    <p style={{ fontSize: 14, color: 'hsl(var(--foreground))', margin: '8px 0 16px' }}>
                        This will permanently delete <strong>all {shifts.length} shift{shifts.length !== 1 ? 's' : ''}</strong>. This action cannot be undone.
                    </p>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setModal(null)}>Cancel</button>
                        <button className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => { handleDeleteAllShifts(); setModal(null); }}>
                            Delete All Shifts
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
}

// ────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────
function Sidebar({ activePage, onNavigate, user, onLogout, collapsed, onToggleCollapse }) {
    const isAdmin = user?.role === 'admin';
    return (
        <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
            <button
                className="sidebar__collapse-btn"
                onClick={onToggleCollapse}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {Icons.chevronLeft}
            </button>

            <div className="sidebar__header">
                <div className="sidebar__logo">{Icons.shieldCheck}</div>
                <div className="sidebar__brand-info">
                    <div className="sidebar__brand-name">NV Best PCA</div>
                    <div className="sidebar__brand-sub">Auth Tracker</div>
                </div>
            </div>

            <nav className="sidebar__nav">
                <div className="sidebar__section-label">Home</div>
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'dashboard' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('dashboard')} title="Dashboard">
                        {Icons.layoutDashboard} Dashboard
                    </button>
                )}
                <button className={`sidebar__nav-item ${activePage === 'timesheets' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('timesheets')} title="Timesheets">
                    {Icons.fileText} Timesheets
                </button>
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'scheduling' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('scheduling')} title="Scheduling">
                        {Icons.calendar} Scheduling
                    </button>
                )}
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'payroll' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('payroll')} title="Payroll">
                        {Icons.dollarSign} Payroll
                    </button>
                )}
            </nav>

            <div className="sidebar__footer">
                {isAdmin && (
                    <>
                        <div className="sidebar__section-label">Settings</div>
                        <button className={`sidebar__nav-item ${activePage === 'insuranceTypes' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('insuranceTypes')} title="Insurance Types">
                            {Icons.shieldCheck} Insurance Types
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'services' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('services')} title="Services">
                            {Icons.fileText} Services
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'users' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('users')} title="Users">
                            {Icons.user} Users
                        </button>
                    </>
                )}
                <div className="separator" style={{ margin: '8px 12px' }} />
                <div className="sidebar__user" title={user?.name}>
                    <div className="sidebar__avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
                    <div className="sidebar__user-info">
                        <div className="sidebar__user-name">{user?.name || 'User'}</div>
                        <div className="sidebar__user-email">{user?.email}</div>
                    </div>
                </div>
                <button className="btn btn--outline btn--sm" style={{ margin: '8px 12px', width: 'calc(100% - 24px)' }} onClick={onLogout} title="Sign Out">
                    {Icons.logOut} Sign Out
                </button>
            </div>
        </aside>
    );
}

// ────────────────────────────────────────
// Main App
// ────────────────────────────────────────

// ── Hash router helpers ─────────────────────────────────────
// Hash scheme: #dashboard | #timesheets | #payroll | #payroll/runs/42 | ...
function parseHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const runMatch = hash.match(/^payroll\/runs\/(\d+)$/);
    if (runMatch) return { page: 'payroll', runId: parseInt(runMatch[1], 10) };
    return { page: hash || null, runId: null };
}

// ───────────────────────────────────────────────────────────

export default function App() {
    return <AppRoutes />;
}
