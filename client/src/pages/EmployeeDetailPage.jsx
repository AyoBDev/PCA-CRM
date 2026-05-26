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
    { key: 'schedule', label: 'Schedule' },
    { key: 'activity', label: 'Activity Log' },
];

const CERT_FIELDS = [
    { key: 'tbDueDate', label: 'TB Test', icon: 'shieldCheck' },
    { key: 'cprDueDate', label: 'CPR', icon: 'shieldCheck' },
    { key: 'trainingDueDate', label: '8hr Training', icon: 'shieldCheck' },
    { key: 'backgroundCheckDueDate', label: 'Background Check', icon: 'shieldCheck' },
    { key: 'idExpDate', label: 'ID Expiration', icon: 'shieldCheck' },
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
                                {employee.critical && <span className="ts-badge ts-badge--critical">Critical</span>}
                                <span className={`ts-badge ts-badge--${employee.active ? 'submitted' : 'draft'}`}>
                                    {employee.active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className="cp-bio__chips">
                                {employee.clientAssignment && (
                                    <span className="cp-chip cp-chip--program">{employee.clientAssignment}</span>
                                )}
                                <span className={`cp-chip ${overallStatus === 'valid' ? 'cp-chip--program' : overallStatus === 'expiring' ? 'cp-chip--risk' : 'cp-chip--complaint'}`}>
                                    {overallStatus === 'valid' ? 'Certs OK' : overallStatus === 'expiring' ? 'Certs Expiring' : 'Certs Expired'}
                                </span>
                                {employee.user && (
                                    <span className="cp-chip cp-chip--program">Linked: {employee.user.name}</span>
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
        <div className="cp-profile-grid">
            <div className="cp-section">
                <div className="cp-section__header">
                    <h3 className="cp-section__title">Contact Information</h3>
                </div>
                <div className="cp-section__body">
                    <div className="cp-detail-grid">
                        <div className="cp-detail">
                            <span className="cp-detail__label">Full Name</span>
                            <span className="cp-detail__value">{employee.name}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Phone</span>
                            <span className="cp-detail__value">{employee.phone || '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Email</span>
                            <span className="cp-detail__value">{employee.email || '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Address</span>
                            <span className="cp-detail__value">{employee.address || '—'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="cp-section">
                <div className="cp-section__header">
                    <h3 className="cp-section__title">Employment Details</h3>
                </div>
                <div className="cp-section__body">
                    <div className="cp-detail-grid">
                        <div className="cp-detail">
                            <span className="cp-detail__label">NPI</span>
                            <span className="cp-detail__value">{employee.npi || '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Client Assignment</span>
                            <span className="cp-detail__value">{employee.clientAssignment || '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Date of Birth</span>
                            <span className="cp-detail__value">{employee.dob ? `${formatDate(employee.dob)} (${computeAge(employee.dob)} yrs)` : '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">First Assignment</span>
                            <span className="cp-detail__value">{formatDate(employee.firstAssignmentDate)}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Status</span>
                            <span className="cp-detail__value">{employee.status || '—'}</span>
                        </div>
                        <div className="cp-detail">
                            <span className="cp-detail__label">Linked User</span>
                            <span className="cp-detail__value">{employee.user ? `${employee.user.name} (${employee.user.email})` : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {employee.notes && (
                <div className="cp-section">
                    <div className="cp-section__header">
                        <h3 className="cp-section__title">Notes</h3>
                    </div>
                    <div className="cp-section__body">
                        <p style={{ whiteSpace: 'pre-wrap', color: 'hsl(var(--foreground))' }}>{employee.notes}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function CertificationsTab({ employee, onEdit }) {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 className="cp-section__title" style={{ margin: 0 }}>Certification Status</h3>
                <button className="btn btn--outline btn--sm" onClick={onEdit}>
                    {Icons.edit} Edit Dates
                </button>
            </div>
            <div className="table-scroll">
                <table className="data-table data-table--sheet">
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
                                    <td>
                                        {key === 'tbDueDate' && employee.tbType ? employee.tbType : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ScheduleTab({ shifts, loading, navigate }) {
    if (loading) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                Loading schedule...
            </div>
        );
    }

    if (!shifts || shifts.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state__icon">{Icons.calendar}</div>
                <div className="empty-state__title">No shifts scheduled</div>
                <div className="empty-state__desc">This employee has no upcoming shifts.</div>
                <button className="btn btn--primary btn--sm" onClick={() => navigate('/scheduling')}>
                    Go to Scheduling
                </button>
            </div>
        );
    }

    const sortedShifts = [...shifts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const upcoming = sortedShifts.filter(s => new Date(s.date) >= new Date(new Date().toDateString()));
    const past = sortedShifts.filter(s => new Date(s.date) < new Date(new Date().toDateString()));

    return (
        <div>
            <h3 className="cp-section__title" style={{ marginBottom: 12 }}>
                Upcoming Shifts ({upcoming.length})
            </h3>
            {upcoming.length > 0 ? (
                <div className="table-scroll" style={{ marginBottom: 24 }}>
                    <table className="data-table data-table--sheet">
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
                                    <td>{formatDate(shift.date)}</td>
                                    <td>{shift.client?.clientName || '—'}</td>
                                    <td>{shift.serviceCode || '—'}</td>
                                    <td>{shift.startTime || '—'} – {shift.endTime || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 24 }}>No upcoming shifts.</p>
            )}

            {past.length > 0 && (
                <>
                    <h3 className="cp-section__title" style={{ marginBottom: 12 }}>
                        Past Shifts ({past.length})
                    </h3>
                    <div className="table-scroll">
                        <table className="data-table data-table--sheet">
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
                                        <td>{shift.serviceCode || '—'}</td>
                                        <td>{shift.startTime || '—'} – {shift.endTime || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function ActivityTab({ employeeId }) {
    return (
        <div style={{ padding: 24, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
            <EntityActivityButton entityType="Employee" entityId={employeeId} />
            <p style={{ marginTop: 12 }}>Click the button above to view the full activity log for this employee.</p>
        </div>
    );
}
