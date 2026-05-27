import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import Breadcrumbs from '../components/common/Breadcrumbs';
import { EntityActivityButton } from '../components/common/ActivityDrawer';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

const TABS = [
    { key: 'profile', label: 'Profile' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'timesheets', label: 'Timesheets' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'activity', label: 'Activity Log' },
];

const CERT_FIELDS = [
    { key: 'tbDueDate', label: 'TB Test' },
    { key: 'cprDueDate', label: 'CPR' },
    { key: 'trainingDueDate', label: '8hr Training' },
    { key: 'backgroundCheckDueDate', label: 'Background Check' },
    { key: 'idExpDate', label: 'ID Expiration' },
];

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function computeAge(dob) {
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function getCertStatus(dateStr) {
    if (!dateStr) return { status: 'unknown', label: 'Not set', days: null };
    const now = new Date();
    const d = new Date(dateStr);
    const days = Math.ceil((d - now) / 86400000);
    if (days < 0) return { status: 'expired', label: `Expired ${Math.abs(days)}d ago`, days };
    if (days <= 30) return { status: 'expiring', label: `Expires in ${days}d`, days };
    return { status: 'valid', label: `Valid (${days}d)`, days };
}

function hhmm12(time) {
    if (!time) return '—';
    const [h, m] = time.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 || 12;
    return `${hr12}:${m} ${ampm}`;
}

function EditEmployeeModal({ employee, users, onSave, onClose }) {
    const [form, setForm] = useState({
        name: employee.name || '',
        phone: employee.phone || '',
        email: employee.email || '',
        address: employee.address || '',
        npi: employee.npi || '',
        clientAssignment: employee.clientAssignment || '',
        userId: employee.userId || '',
        dob: employee.dob ? new Date(employee.dob).toISOString().split('T')[0] : '',
        notes: employee.notes || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = { ...form, userId: form.userId || null };
        if (data.dob) data.dob = new Date(data.dob).toISOString();
        else data.dob = null;
        onSave(data);
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">Edit Employee</h2>
            <p className="modal__desc">Update employee details below.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="edName">Name *</label>
                    <input id="edName" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="edPhone">Phone</label>
                        <input id="edPhone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="edEmail">Email</label>
                        <input id="edEmail" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="edAddress">Address</label>
                    <input id="edAddress" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="edDob">Date of Birth</label>
                        <input id="edDob" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="edNpi">NPI</label>
                        <input id="edNpi" value={form.npi} onChange={e => setForm({ ...form, npi: e.target.value })} />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="edClient">Client Assignment</label>
                    <input id="edClient" value={form.clientAssignment} onChange={e => setForm({ ...form, clientAssignment: e.target.value })} />
                </div>
                <div className="form-group">
                    <label htmlFor="edUser">Linked User Account</label>
                    <select id="edUser" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}>
                        <option value="">— None —</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="edNotes">Notes</label>
                    <textarea id="edNotes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">Save Changes</button>
                </div>
            </form>
        </Modal>
    );
}

function EditCertModal({ employee, onSave, onClose }) {
    const [form, setForm] = useState({
        tbDueDate: employee.tbDueDate ? new Date(employee.tbDueDate).toISOString().split('T')[0] : '',
        tbType: employee.tbType || '',
        cprDueDate: employee.cprDueDate ? new Date(employee.cprDueDate).toISOString().split('T')[0] : '',
        trainingDueDate: employee.trainingDueDate ? new Date(employee.trainingDueDate).toISOString().split('T')[0] : '',
        backgroundCheckDueDate: employee.backgroundCheckDueDate ? new Date(employee.backgroundCheckDueDate).toISOString().split('T')[0] : '',
        idExpDate: employee.idExpDate ? new Date(employee.idExpDate).toISOString().split('T')[0] : '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {};
        for (const [k, v] of Object.entries(form)) {
            if (k === 'tbType') { data[k] = v; continue; }
            data[k] = v ? new Date(v).toISOString() : null;
        }
        onSave(data);
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">Edit Certifications</h2>
            <p className="modal__desc">Update certification due dates.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="certTb">TB Due Date</label>
                        <input id="certTb" type="date" value={form.tbDueDate} onChange={e => setForm({ ...form, tbDueDate: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="certTbType">TB Type</label>
                        <input id="certTbType" value={form.tbType} onChange={e => setForm({ ...form, tbType: e.target.value })} placeholder="e.g. Skin Test, Blood" />
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="certCpr">CPR Due Date</label>
                        <input id="certCpr" type="date" value={form.cprDueDate} onChange={e => setForm({ ...form, cprDueDate: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="certTraining">8hr Training Due Date</label>
                        <input id="certTraining" type="date" value={form.trainingDueDate} onChange={e => setForm({ ...form, trainingDueDate: e.target.value })} />
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="certBg">Background Check Due Date</label>
                        <input id="certBg" type="date" value={form.backgroundCheckDueDate} onChange={e => setForm({ ...form, backgroundCheckDueDate: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="certId">ID Expiration Date</label>
                        <input id="certId" type="date" value={form.idExpDate} onChange={e => setForm({ ...form, idExpDate: e.target.value })} />
                    </div>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">Save Certifications</button>
                </div>
            </form>
        </Modal>
    );
}

export default function EmployeeDetailPage() {
    const { employeeId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { isAdmin } = useAuth();

    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('profile');
    const [showEditModal, setShowEditModal] = useState(false);
    const [showCertModal, setShowCertModal] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);

    const fetchEmployee = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getEmployee(Number(employeeId));
            setEmployee(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [employeeId, showToast]);

    const fetchUsers = useCallback(async () => {
        try {
            setUsers(await api.getUsers());
        } catch (err) { /* ignore */ }
    }, []);

    const fetchShifts = useCallback(async () => {
        try {
            setShiftsLoading(true);
            const data = await api.getEmployeeSchedule(Number(employeeId));
            setShifts(data);
        } catch (err) { /* ignore */ }
        finally { setShiftsLoading(false); }
    }, [employeeId]);

    useEffect(() => { fetchEmployee(); fetchUsers(); }, [fetchEmployee, fetchUsers]);
    useEffect(() => { if (activeTab === 'schedule') fetchShifts(); }, [activeTab, fetchShifts]);

    const handleSaveEmployee = async (data) => {
        try {
            await api.updateEmployee(Number(employeeId), data);
            showToast('Employee updated');
            setShowEditModal(false);
            fetchEmployee();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleSaveCerts = async (data) => {
        try {
            await api.updateEmployee(Number(employeeId), data);
            showToast('Certifications updated');
            setShowCertModal(false);
            fetchEmployee();
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (loading) {
        return (
            <div className="page-content" style={{ padding: 48, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                Loading...
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="page-content" style={{ padding: 48, textAlign: 'center' }}>
                <h2>Employee not found</h2>
                <button className="btn btn--primary" onClick={() => navigate('/employees')}>Back to Employees</button>
            </div>
        );
    }

    const overallStatus = (() => {
        let worst = 'valid';
        for (const { key } of CERT_FIELDS) {
            const s = getCertStatus(employee[key]);
            if (s.status === 'expired') return 'expired';
            if (s.status === 'expiring') worst = 'expiring';
        }
        return worst;
    })();

    const certCounts = { valid: 0, expiring: 0, expired: 0, unknown: 0 };
    CERT_FIELDS.forEach(({ key }) => {
        const { status } = getCertStatus(employee[key]);
        certCounts[status]++;
    });

    return (
        <>
            {/* Page Header */}
            <div className="content-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn--ghost btn--icon" onClick={() => navigate('/employees')} title="Back to employees">
                        {Icons.chevronLeft}
                    </button>
                    <div>
                        <Breadcrumbs items={[{ label: 'Employees', path: '/employees' }, { label: employee.name }]} />
                        <h1 className="content-header__title" style={{ margin: 0 }}>Employee Profile</h1>
                    </div>
                </div>
                <div className="content-header__actions">
                    <EntityActivityButton entityType="Employee" entityId={employee.id} />
                    <button className="btn btn--outline btn--sm" onClick={() => setShowEditModal(true)}>
                        {Icons.edit} Edit Employee
                    </button>
                </div>
            </div>

            <div className="page-content cp-page">

                {/* BIO DATA CARD */}
                <div className="cp-bio">
                    <div className="cp-bio__main">
                        <div className="cp-bio__avatar">
                            {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="cp-bio__info">
                            <div className="cp-bio__name-row">
                                <h2 className="cp-bio__name">{employee.name}</h2>
                                {employee.critical && <span className="ts-badge ts-badge--danger">Critical</span>}
                                <span className={`ts-badge ts-badge--${employee.active ? 'success' : 'draft'}`}>
                                    {employee.active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className="cp-bio__chips">
                                {employee.clientAssignment && (
                                    <span className="cp-chip cp-chip--program">{employee.clientAssignment}</span>
                                )}
                                <span className={`cp-chip ${overallStatus === 'valid' ? 'cp-chip--program' : overallStatus === 'expiring' ? 'cp-chip--risk' : 'cp-chip--complaint'}`}>
                                    {overallStatus === 'valid' ? 'All Certs Valid' : overallStatus === 'expiring' ? 'Certs Expiring Soon' : 'Certs Expired'}
                                </span>
                                {employee.user && (
                                    <span className="cp-chip cp-chip--program">{Icons.users} {employee.user.name}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="cp-bio__fields">
                        {employee.npi && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">NPI #</span>
                                <span className="cp-bio__field-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{employee.npi}</span>
                            </div>
                        )}
                        {employee.dob && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">D.O.B.</span>
                                <span className="cp-bio__field-value">
                                    {formatDate(employee.dob)} ({computeAge(employee.dob)} yrs)
                                </span>
                            </div>
                        )}
                        {employee.phone && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Phone</span>
                                <span className="cp-bio__field-value">{employee.phone}</span>
                            </div>
                        )}
                        {employee.email && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Email</span>
                                <span className="cp-bio__field-value">{employee.email}</span>
                            </div>
                        )}
                        {employee.address && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Address</span>
                                <span className="cp-bio__field-value">{employee.address}</span>
                            </div>
                        )}
                        {employee.firstAssignmentDate && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">First Assignment</span>
                                <span className="cp-bio__field-value">{formatDate(employee.firstAssignmentDate)}</span>
                            </div>
                        )}
                        {employee.dischargeDate && (
                            <div className="cp-bio__field">
                                <span className="cp-bio__field-label">Discharge Date</span>
                                <span className="cp-bio__field-value">{formatDate(employee.dischargeDate)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* TAB NAVIGATION */}
                <div className="cp-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`cp-tab ${activeTab === tab.key ? 'cp-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            {tab.key === 'certifications' && certCounts.expired > 0 && (
                                <span className="cp-tab__badge cp-tab__badge--danger">{certCounts.expired}</span>
                            )}
                            {tab.key === 'certifications' && certCounts.expired === 0 && certCounts.expiring > 0 && (
                                <span className="cp-tab__badge">{certCounts.expiring}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div className="cp-tab-content">
                    {activeTab === 'profile' && (
                        <ProfileTab employee={employee} />
                    )}
                    {activeTab === 'certifications' && (
                        <CertificationsTab employee={employee} onEdit={() => setShowCertModal(true)} />
                    )}
                    {activeTab === 'timesheets' && (
                        <TimesheetsTab employeeName={employee.name} navigate={navigate} />
                    )}
                    {activeTab === 'schedule' && (
                        <ScheduleTab shifts={shifts} loading={shiftsLoading} navigate={navigate} />
                    )}
                    {activeTab === 'activity' && (
                        <ActivityTab employeeId={employee.id} />
                    )}
                </div>
            </div>

            {showEditModal && (
                <EditEmployeeModal
                    employee={employee}
                    users={users}
                    onSave={handleSaveEmployee}
                    onClose={() => setShowEditModal(false)}
                />
            )}
            {showCertModal && (
                <EditCertModal
                    employee={employee}
                    onSave={handleSaveCerts}
                    onClose={() => setShowCertModal(false)}
                />
            )}
        </>
    );
}

function ProfileTab({ employee }) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-summary-grid">
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            <span className="cp-card__dot cp-card__dot--green" />
                            Contact Information
                        </h3>
                    </div>
                    <div className="cp-card__body">
                        <div className="cp-info-list">
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Full Name</span>
                                <span className="cp-info-row__value">{employee.name}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Phone</span>
                                <span className="cp-info-row__value">{employee.phone || '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Email</span>
                                <span className="cp-info-row__value">{employee.email || '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Address</span>
                                <span className="cp-info-row__value">{employee.address || '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            <span className="cp-card__dot cp-card__dot--green" />
                            Employment Details
                        </h3>
                    </div>
                    <div className="cp-card__body">
                        <div className="cp-info-list">
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">NPI</span>
                                <span className="cp-info-row__value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{employee.npi || '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Client Assignment</span>
                                <span className="cp-info-row__value">{employee.clientAssignment || '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Date of Birth</span>
                                <span className="cp-info-row__value">{employee.dob ? `${formatDate(employee.dob)} (${computeAge(employee.dob)} yrs)` : '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">First Assignment</span>
                                <span className="cp-info-row__value">{formatDate(employee.firstAssignmentDate)}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Status</span>
                                <span className="cp-info-row__value">{employee.status || '—'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Linked User</span>
                                <span className="cp-info-row__value">{employee.user ? `${employee.user.name} (${employee.user.email})` : '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {employee.notes && (
                <div className="cp-card cp-card--elevated" style={{ marginTop: 12 }}>
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Notes</h3>
                    </div>
                    <div className="cp-card__body">
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'hsl(var(--foreground))', fontSize: 13, lineHeight: 1.6 }}>{employee.notes}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function CertificationsTab({ employee, onEdit }) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        <span className="cp-card__dot cp-card__dot--green" />
                        Certification Status
                    </h3>
                    <button className="btn btn--outline btn--sm" onClick={onEdit}>
                        {Icons.edit} Edit Dates
                    </button>
                </div>
                <div className="cp-card__body" style={{ padding: 0 }}>
                    <table className="data-table data-table--sheet" style={{ borderRadius: 0 }}>
                        <thead>
                            <tr>
                                <th>Certification</th>
                                <th>Due Date</th>
                                <th>Status</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CERT_FIELDS.map(({ key, label }) => {
                                const { status, label: statusLabel } = getCertStatus(employee[key]);
                                return (
                                    <tr key={key}>
                                        <td style={{ fontWeight: 500 }}>{label}</td>
                                        <td>{formatDate(employee[key])}</td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${status === 'valid' ? 'success' : status === 'expiring' ? 'warning' : status === 'expired' ? 'danger' : 'draft'}`}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            {key === 'tbDueDate' && employee.tbType ? employee.tbType : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const TS_STATUS_STYLES = {
    draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
    submitted: { bg: '#dbeafe', color: '#2563eb', label: 'Submitted' },
    accepted: { bg: '#dcfce7', color: '#16a34a', label: 'Accepted' },
};

function formatWeekLabel(weekStart) {
    if (!weekStart) return '—';
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${fmt(ws)} – ${fmt(we)}, ${ws.getUTCFullYear()}`;
}

function TimesheetsTab({ employeeName, navigate }) {
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetch() {
            try {
                const all = await api.getTimesheets();
                const filtered = all.filter(t => t.pcaName === employeeName);
                if (!cancelled) setTimesheets(filtered);
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        fetch();
        return () => { cancelled = true; };
    }, [employeeName]);

    const totalHours = timesheets.reduce((s, t) => s + (t.totalHours || 0), 0);
    const submitted = timesheets.filter(t => t.status === 'submitted').length;
    const accepted = timesheets.filter(t => t.status === 'accepted').length;

    if (loading) return <div className="cp-tab-panel"><div className="cp-empty-state-card"><p>Loading timesheets...</p></div></div>;

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        {Icons.clipboard} Timesheets
                        {timesheets.length > 0 && <span className="cp-card__count">{timesheets.length}</span>}
                    </h3>
                    <button className="btn btn--outline btn--sm" onClick={() => navigate('/timesheets')}>
                        {Icons.list} View All
                    </button>
                </div>
                <div className="cp-card__body">
                    {timesheets.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>No timesheets found for this employee.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: 'hsl(var(--muted))', borderRadius: 8 }}>
                                <div style={{ fontSize: 13 }}>
                                    <strong>{timesheets.length}</strong> total
                                </div>
                                <div style={{ fontSize: 13, color: '#2563eb' }}>
                                    <strong>{submitted}</strong> submitted
                                </div>
                                <div style={{ fontSize: 13, color: '#16a34a' }}>
                                    <strong>{accepted}</strong> accepted
                                </div>
                                <div style={{ marginLeft: 'auto', fontSize: 13 }}>
                                    <strong>{totalHours.toFixed(1)}</strong> total hrs
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {timesheets.map(ts => {
                                    const statusInfo = TS_STATUS_STYLES[ts.status] || TS_STATUS_STYLES.draft;
                                    return (
                                        <div
                                            key={ts.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                padding: '10px 14px',
                                                borderRadius: 8,
                                                border: '1px solid hsl(var(--border))',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onClick={() => navigate(`/timesheets?open=${ts.id}`)}
                                            onMouseEnter={e => e.currentTarget.style.background = 'hsl(var(--muted) / 0.4)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>{ts.client?.clientName || '—'}</div>
                                                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                                                    {formatWeekLabel(ts.weekStart)}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                                                {ts.totalPasHours > 0 && (
                                                    <span style={{ color: '#3b82f6' }}>PAS {ts.totalPasHours.toFixed(1)}h</span>
                                                )}
                                                {ts.totalHmHours > 0 && (
                                                    <span style={{ color: '#8b5cf6' }}>HM {ts.totalHmHours.toFixed(1)}h</span>
                                                )}
                                                {(ts.totalRespiteHours || 0) > 0 && (
                                                    <span style={{ color: '#06b6d4' }}>RP {ts.totalRespiteHours.toFixed(1)}h</span>
                                                )}
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{ts.totalHours?.toFixed(1) || '0.0'}h</span>
                                            </div>
                                            <span style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                padding: '3px 8px',
                                                borderRadius: 4,
                                                background: statusInfo.bg,
                                                color: statusInfo.color,
                                                textTransform: 'capitalize',
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ScheduleTab({ shifts, loading, navigate }) {
    if (loading) {
        return (
            <div className="cp-tab-panel">
                <div style={{ padding: 24, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                    Loading schedule...
                </div>
            </div>
        );
    }

    if (!shifts || shifts.length === 0) {
        return (
            <div className="cp-tab-panel">
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.calendar}</div>
                            <p style={{ margin: '8px 0', color: 'hsl(var(--muted-foreground))' }}>No shifts scheduled for this employee.</p>
                            <button className="btn btn--primary btn--sm" onClick={() => navigate('/scheduling')}>
                                Go to Scheduling
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const sortedShifts = [...shifts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const today = new Date(new Date().toDateString());
    const upcoming = sortedShifts.filter(s => new Date(s.date) >= today);
    const past = sortedShifts.filter(s => new Date(s.date) < today);

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        <span className="cp-card__dot cp-card__dot--green" />
                        Upcoming Shifts
                        <span className="cp-card__count">{upcoming.length}</span>
                    </h3>
                </div>
                <div className="cp-card__body" style={{ padding: 0 }}>
                    {upcoming.length > 0 ? (
                        <table className="data-table data-table--sheet" style={{ borderRadius: 0 }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Client</th>
                                    <th>Service</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcoming.slice(0, 20).map(shift => (
                                    <tr key={shift.id}>
                                        <td style={{ fontWeight: 500 }}>{formatDate(shift.date)}</td>
                                        <td>{shift.client?.clientName || '—'}</td>
                                        <td><span className="ts-badge ts-badge--draft">{shift.serviceCode || '—'}</span></td>
                                        <td>{hhmm12(shift.startTime)} – {hhmm12(shift.endTime)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: 16, textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                            No upcoming shifts.
                        </div>
                    )}
                </div>
            </div>

            {past.length > 0 && (
                <div className="cp-card cp-card--elevated" style={{ marginTop: 12 }}>
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            Past Shifts
                            <span className="cp-card__count">{past.length}</span>
                        </h3>
                    </div>
                    <div className="cp-card__body" style={{ padding: 0 }}>
                        <table className="data-table data-table--sheet" style={{ borderRadius: 0 }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Client</th>
                                    <th>Service</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {past.slice(-10).reverse().map(shift => (
                                    <tr key={shift.id}>
                                        <td>{formatDate(shift.date)}</td>
                                        <td>{shift.client?.clientName || '—'}</td>
                                        <td><span className="ts-badge ts-badge--draft">{shift.serviceCode || '—'}</span></td>
                                        <td>{hhmm12(shift.startTime)} – {hhmm12(shift.endTime)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function ActivityTab({ employeeId }) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__body">
                    <div className="cp-empty-state-card">
                        <div className="cp-empty-state-card__icon">{Icons.clock}</div>
                        <p style={{ margin: '8px 0', color: 'hsl(var(--muted-foreground))' }}>View all changes and actions taken on this employee record.</p>
                        <EntityActivityButton entityType="Employee" entityId={employeeId} />
                    </div>
                </div>
            </div>
        </div>
    );
}
