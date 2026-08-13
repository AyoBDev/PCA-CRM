import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import Breadcrumbs from '../components/common/Breadcrumbs';
import { EntityActivityButton } from '../components/common/ActivityDrawer';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useUndoStack } from '../hooks/useUndoStack';
import PayrollTab from './employee-tabs/PayrollTab';
import EmployeeNotesTab from './employee-tabs/NotesTab';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { TIMESHEET_STATUS_STYLES, TIMESHEET_SERVICE_COLORS } from '../utils/constants';
import { formatDate } from '../utils/dates';
import PreviewModal from '../components/common/PreviewModal';
import CertFileRow from '../components/files/CertFileRow';
import { hhmm12 } from '../utils/time';
import CertCard from '../components/employee/CertCard';
import CertViewerPanel from '../components/common/CertViewerPanel';
import { useIsWide } from '../hooks/useIsWide';

const TABS = [
    { key: 'profile', label: 'Profile', icon: 'user' },
    { key: 'availability', label: 'Availability', icon: 'calendar' },
    { key: 'certifications', label: 'Certifications', icon: 'shieldCheck' },
    { key: 'timesheets', label: 'Timesheets', icon: 'clock' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'scheduleHistory', label: 'Schedule History', icon: 'share' },
    { key: 'payroll', label: 'Payroll', icon: 'dollarSign', adminOnly: true },
    { key: 'notes', label: 'Notes', icon: 'fileText' },
    { key: 'activity', label: 'Activity Log', icon: 'clipboard' },
];

const CERT_FIELDS = [
    { key: 'tbDueDate', label: 'TB Test' },
    { key: 'cprDueDate', label: 'CPR' },
    { key: 'trainingDueDate', label: '8hr Training' },
    { key: 'backgroundCheckDueDate', label: 'Background Check' },
    { key: 'idExpDate', label: 'ID Expiration' },
];

const CERT_TYPES = [
    { type: 'id_expiration', label: 'ID Expiration', legacyKey: 'idExpDate', renewalYears: null },
    { type: 'tb_test', label: 'TB Test', legacyKey: 'tbDueDate', renewalYears: 1 },
    { type: 'cpr', label: 'CPR', legacyKey: 'cprDueDate', renewalYears: 2 },
    { type: 'annual_training', label: '8hr Annual Training', legacyKey: 'trainingDueDate', renewalYears: 1 },
    { type: 'cultural_competency', label: 'Cultural Competency Training', legacyKey: null, renewalYears: 2 },
    { type: 'infection_control', label: 'Infection Control Training', legacyKey: null, renewalYears: 1 },
    { type: 'background_check', label: 'Background Check', legacyKey: 'backgroundCheckDueDate', renewalYears: 5 },
    { type: 'other', label: 'Other', legacyKey: null, renewalYears: null },
];

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

function OnboardingReviewPanel({ data }) {
    if (!data) return <p className="text-muted">No availability data submitted.</p>;

    const weeklySchedule = data.weeklySchedule || {};
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayLabels = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Weekly Schedule */}
            <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'hsl(var(--foreground))' }}>Weekly Availability</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dayNames.map(day => {
                        const schedule = weeklySchedule[day];
                        if (!schedule || !schedule.available) {
                            return (
                                <div key={day} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'hsl(var(--muted))', borderRadius: 6 }}>
                                    <span style={{ fontWeight: 500, width: 100, fontSize: 13 }}>{dayLabels[day]}</span>
                                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Not available</span>
                                </div>
                            );
                        }
                        return (
                            <div key={day} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'hsl(var(--accent))', borderRadius: 6 }}>
                                <span style={{ fontWeight: 500, width: 100, fontSize: 13 }}>{dayLabels[day]}</span>
                                <span style={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>
                                    {schedule.start} – {schedule.end}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Travel & Limits */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Max Hours/Week</h4>
                    <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{data.maxHoursPerWeek || 'Not specified'}</p>
                </div>
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Max Concurrent Clients</h4>
                    <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{data.maxConcurrentClients || 'Not specified'}</p>
                </div>
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Max Travel Distance</h4>
                    <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{data.maxTravelDistance ? `${data.maxTravelDistance} miles` : 'Not specified'}</p>
                </div>
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Transportation</h4>
                    <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{data.transportation || 'Not specified'}</p>
                </div>
            </div>

            {/* Holiday Availability */}
            {data.holidayAvailability && (
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Holiday Availability</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Object.entries(data.holidayAvailability).map(([holiday, available]) => (
                            available && (
                                <span key={holiday} style={{ padding: '4px 10px', background: 'hsl(var(--accent))', borderRadius: 4, fontSize: 12 }}>
                                    {holiday.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                            )
                        ))}
                    </div>
                </div>
            )}

            {/* Blackout Dates */}
            {data.blackoutDates && data.blackoutDates.length > 0 && (
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Blackout Dates</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.blackoutDates.map((item, idx) => (
                            <div key={idx} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                                {item.startDate} to {item.endDate} {item.reason && `— ${item.reason}`}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Initial Time Off */}
            {data.initialTimeOff && data.initialTimeOff.length > 0 && (
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Initial Time Off</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.initialTimeOff.map((item, idx) => (
                            <div key={idx} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                                {item.startDate} to {item.endDate} {item.reason && `— ${item.reason}`}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            {data.notes && (
                <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'hsl(var(--foreground))' }}>Notes</h4>
                    <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', whiteSpace: 'pre-wrap' }}>{data.notes}</p>
                </div>
            )}
        </div>
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
    const undoState = useUndoStack();

    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const location = useLocation();
    const initialTab = useMemo(() => {
        const map = {
            '#certs': 'certifications',
            '#certifications': 'certifications',
            '#availability': 'availability',
            '#profile': 'profile',
            '#timesheets': 'timesheets',
            '#schedule': 'schedule',
        };
        return map[location.hash] || 'profile';
    }, [location.hash]);
    const [activeTab, setActiveTab] = useState(initialTab);
    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showCertModal, setShowCertModal] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const [availabilityData, setAvailabilityData] = useState(null);
    const [loadingAvailability, setLoadingAvailability] = useState(false);

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
            const data = await api.getEmployeeSchedule(Number(employeeId), null, { all: true });
            setShifts(Array.isArray(data) ? data : data.shifts || []);
        } catch (err) { /* ignore */ }
        finally { setShiftsLoading(false); }
    }, [employeeId]);

    const fetchAvailability = useCallback(async () => {
        if (!employee) return;
        try {
            setLoadingAvailability(true);
            const data = await api.getEmployeeAvailability(Number(employeeId));
            setAvailabilityData(data);
        } catch (err) { setAvailabilityData(null); }
        finally { setLoadingAvailability(false); }
    }, [employeeId, employee]);

    useEffect(() => { fetchEmployee(); fetchUsers(); }, [fetchEmployee, fetchUsers]);
    useEffect(() => { if (activeTab === 'schedule') fetchShifts(); }, [activeTab, fetchShifts]);
    useEffect(() => { if (activeTab === 'availability') fetchAvailability(); }, [activeTab, fetchAvailability]);

    const handleSaveEmployee = async (data) => {
        try {
            const oldData = { name: employee.name, phone: employee.phone, email: employee.email, address: employee.address, npi: employee.npi, clientAssignment: employee.clientAssignment, notes: employee.notes };
            await api.updateEmployee(Number(employeeId), data);
            showToast('Employee updated');
            setShowEditModal(false);
            fetchEmployee();
            undoState.pushAction(`Updated "${data.name || employee.name}"`,
                async () => { await api.updateEmployee(Number(employeeId), oldData); fetchEmployee(); },
                async () => { await api.updateEmployee(Number(employeeId), data); fetchEmployee(); }
            );
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleSaveCerts = async (data) => {
        try {
            const oldData = { tbDueDate: employee.tbDueDate, cprDueDate: employee.cprDueDate, trainingDueDate: employee.trainingDueDate, backgroundCheckDueDate: employee.backgroundCheckDueDate, idExpDate: employee.idExpDate };
            await api.updateEmployee(Number(employeeId), data);
            showToast('Certifications updated');
            setShowCertModal(false);
            fetchEmployee();
            undoState.pushAction('Updated certifications',
                async () => { await api.updateEmployee(Number(employeeId), oldData); fetchEmployee(); },
                async () => { await api.updateEmployee(Number(employeeId), data); fetchEmployee(); }
            );
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleResendInvite = async () => {
        try {
            await api.resendOnboardingInvite(employee.id);
            showToast('Onboarding invite resent', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleCopyOnboardingLink = async () => {
        try {
            const { link } = await api.getOnboardingLink(employee.id);
            await navigator.clipboard.writeText(link);
            showToast('Onboarding link copied to clipboard', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleApprove = async () => {
        try {
            await api.approveOnboarding(employee.id);
            showToast(`${employee.name}'s account has been activated`, 'success');
            fetchEmployee();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleToggleActive = async (next) => {
        const prev = employee.active;
        if (next === prev) return;
        setEmployee(e => ({ ...e, active: next }));
        try {
            await api.updateEmployee(Number(employeeId), { active: next });
            undoState.pushAction(
                `${next ? 'Activated' : 'Deactivated'} ${employee.name}`,
                async () => { await api.updateEmployee(Number(employeeId), { active: prev }); setEmployee(e => ({ ...e, active: prev })); },
                async () => { await api.updateEmployee(Number(employeeId), { active: next }); setEmployee(e => ({ ...e, active: next })); },
            );
            showToast(next ? 'Employee activated' : 'Employee deactivated');
        } catch (err) {
            setEmployee(e => ({ ...e, active: prev }));
            showToast(err.message, 'error');
        }
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
            <GlobalToolbar
                title={employee?.name || 'Employee'}
                subtitle="Employee Profile"
                icon={Icons.users}
                activityEntity="Employee"
                undoState={undoState}
            />
            <ContextBar>
                <ContextBar.Right>
                    <EntityActivityButton entityType="Employee" entityId={employee.id} />
                    {employee.onboardingStatus === 'invited' && (
                        <>
                            <button className="btn btn--outline btn--sm" onClick={handleCopyOnboardingLink}>
                                {Icons.copy} Copy Link
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={handleResendInvite}>
                                {Icons.mail} Resend Invite
                            </button>
                        </>
                    )}
                    <button className="btn btn--outline btn--sm" onClick={() => setShowEditModal(true)}>
                        {Icons.edit} Edit Employee
                    </button>
                </ContextBar.Right>
            </ContextBar>

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
                                <select
                                    className={`cp-bio__status-select cp-bio__status-select--${employee.active ? 'active' : 'inactive'}`}
                                    value={employee.active ? 'active' : 'inactive'}
                                    onChange={(e) => handleToggleActive(e.target.value === 'active')}
                                    title="Marks the employee not currently working. Does not archive or hide them."
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                                {employee.onboardingStatus === 'invited' && (
                                    <span className="ts-badge ts-badge--draft">Invited</span>
                                )}
                                {employee.onboardingStatus === 'submitted' && (
                                    <span className="ts-badge ts-badge--submitted">Pending Review</span>
                                )}
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
                    {TABS.filter(tab => !tab.adminOnly || isAdmin).map(tab => (
                        <button
                            key={tab.key}
                            className={`cp-tab ${activeTab === tab.key ? 'cp-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon && <span className="cp-tab__icon">{Icons[tab.icon]}</span>}
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
                    {activeTab === 'availability' && (
                        <div className="cp-tab-panel">
                            {employee.onboardingStatus === 'submitted' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                    <button className="btn btn--primary btn--sm" onClick={handleApprove}>
                                        {Icons.checkCircle} Approve Onboarding
                                    </button>
                                </div>
                            )}
                            {loadingAvailability ? (
                                <p className="text-muted">Loading availability data...</p>
                            ) : availabilityData ? (
                                <OnboardingReviewPanel data={availabilityData} />
                            ) : (
                                <p className="text-muted">No availability data submitted yet.</p>
                            )}
                        </div>
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
                    {activeTab === 'scheduleHistory' && (
                        <ScheduleHistoryTab employeeId={employee.id} />
                    )}
                    {activeTab === 'payroll' && (
                        <PayrollTab employeeId={employee.id} />
                    )}
                    {activeTab === 'notes' && (
                        <EmployeeNotesTab employeeId={employee.id} />
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

const CERT_COLORS = {
    id_expiration: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', border: '#3b82f6', label: 'ID EXPIRATION', icon: 'user' },
    tb_test: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', border: '#22c55e', label: 'TB TEST', icon: 'heart' },
    cpr: { accent: '#ef4444', bg: 'hsl(0 84% 96%)', border: '#ef4444', label: 'CPR', icon: 'heart' },
    annual_training: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', border: '#f59e0b', label: '8HR ANNUAL TRAINING', icon: 'clock' },
    cultural_competency: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', border: '#8b5cf6', label: 'CULTURAL COMPETENCY', icon: 'users' },
    infection_control: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', border: '#06b6d4', label: 'INFECTION CONTROL', icon: 'shieldCheck' },
    background_check: { accent: '#64748b', bg: 'hsl(215 20% 96%)', border: '#64748b', label: 'BACKGROUND CHECK', icon: 'shieldCheck' },
    other: { accent: '#a855f7', bg: 'hsl(270 76% 96%)', border: '#a855f7', label: 'OTHER', icon: 'fileText' },
};

function CertificationsTab({ employee, onEdit }) {
    const { showToast } = useToast();
    const [certRecords, setCertRecords] = useState([]);
    const [loadingCerts, setLoadingCerts] = useState(true);
    const [showUploadModal, setShowUploadModal] = useState(null);
    const [certFilter, setCertFilter] = useState('All');
    const [previewUpload, setPreviewUpload] = useState(null);
    const [selectedCertId, setSelectedCertId] = useState(null);
    const [historyFor, setHistoryFor] = useState(null);
    const wide = useIsWide(1024);

    const fetchCerts = useCallback(async () => {
        try {
            const data = await api.getEmployeeCertifications(employee.id);
            setCertRecords(data);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingCerts(false); }
    }, [employee.id, showToast]);

    useEffect(() => { fetchCerts(); }, [fetchCerts]);

    const renewalLabelFor = (ct) => ct.renewalYears
        ? `${ct.renewalYears} year${ct.renewalYears > 1 ? 's' : ''}`
        : (ct.type === 'id_expiration' ? 'Per ID date' : 'Not required');

    const getCertStatusForType = (certType) => {
        const typeDef = CERT_TYPES.find(t => t.type === certType);
        const records = certRecords.filter(r => r.certType === certType);
        const activeRecord = records.find(r => r.status === 'active');
        const legacyDate = typeDef?.legacyKey ? employee[typeDef.legacyKey] : null;
        const expDate = activeRecord?.expirationDate || legacyDate;

        if (!expDate) return { status: 'unknown', days: null, expDate: null, record: activeRecord };
        const now = new Date();
        const d = new Date(expDate);
        const days = Math.ceil((d - now) / 86400000);
        if (days < 0) return { status: 'expired', days, expDate, record: activeRecord };
        if (days <= 30) return { status: 'critical', days, expDate, record: activeRecord };
        return { status: 'ok', days, expDate, record: activeRecord };
    };

    const counts = { all: CERT_TYPES.length, ok: 0, critical: 0, expired: 0 };
    CERT_TYPES.forEach(ct => {
        const { status } = getCertStatusForType(ct.type);
        if (status === 'ok') counts.ok++;
        else if (status === 'critical') counts.critical++;
        else if (status === 'expired') counts.expired++;
    });

    const filteredTypes = CERT_TYPES.filter(ct => {
        if (certFilter === 'All') return true;
        const { status, record } = getCertStatusForType(ct.type);
        if (certFilter === 'OK') return status === 'ok';
        if (certFilter === 'Critical') return status === 'critical';
        if (certFilter === 'Expired') return status === 'expired';
        if (certFilter === 'Missing') return !record?.fileName || !record?.expirationDate;
        return true;
    });

    // Auto-select the first cert (in CERT_TYPES order) whose active record has
    // an uploaded file, once certs have loaded and nothing is selected yet.
    useEffect(() => {
        if (loadingCerts || selectedCertId) return;
        const firstWithFile = CERT_TYPES.find(ct => {
            const { record } = getCertStatusForType(ct.type);
            return !!record?.fileName;
        });
        if (firstWithFile) setSelectedCertId(firstWithFile.type);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingCerts, certRecords, selectedCertId]);

    const handleUpload = async (certType, formData) => {
        try {
            await api.createEmployeeCertification(employee.id, formData);
            showToast('Certification uploaded');
            setShowUploadModal(null);
            fetchCerts();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Download an individual history/attachment file (CertificationUpload) from the bucket.
    const handleDownloadUpload = async (upload) => {
        try {
            const res = await api.downloadCertificationUpload(upload.id);
            if (!res.ok) throw new Error('Download failed');
            const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
            const blob = await res.blob();
            const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
            if (contentType === 'application/pdf') {
                window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = upload.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const statusLabel = (s) => s === 'ok' ? 'Active' : s === 'critical' ? 'Expiring Soon' : s === 'expired' ? 'Expired' : 'Not Set';
    const statusBadgeClass = (s) => s === 'ok' ? 'submitted' : s === 'critical' ? 'draft' : s === 'expired' ? 'critical' : 'draft';

    // Stable fetchBlob closures for the cert viewer/history modal, keyed by
    // record/upload id. Built once per certRecords change (not per render of
    // renderCertCard, which runs inside a .map() and can't call useMemo
    // itself) so DocViewer doesn't see a new fetchBlob identity — and
    // refetch/reload the file — on every unrelated re-render while the pane
    // is open.
    const certFetchBlobs = useMemo(() => {
        const map = new Map();
        certRecords.forEach(rec => {
            map.set(`cert:${rec.id}`, () => api.downloadEmployeeCertification(rec.id));
            (rec.uploads || []).forEach(u => {
                map.set(`upload:${u.id}`, () => api.downloadCertificationUpload(u.id));
            });
        });
        return map;
    }, [certRecords]);

    // Opens the history modal for a cert type: resolves the active record
    // (with its uploads) so the modal can list every stored file.
    const openHistoryFor = (certType) => {
        const { record } = getCertStatusForType(certType);
        const colors = CERT_COLORS[certType] || CERT_COLORS.other;
        setHistoryFor({ certType, label: colors.label, record: record || null, uploads: record?.uploads || [] });
    };

    // Derived viewer target for the currently selected cert type.
    const selected = (() => {
        if (!selectedCertId) return null;
        const ct = CERT_TYPES.find(t => t.type === selectedCertId);
        if (!ct) return null;
        const { status, record } = getCertStatusForType(ct.type);
        if (!record?.fileName) return { certType: ct.type, status, fileName: null, fetchBlob: null };
        return {
            certType: ct.type,
            status,
            fileName: record.fileName,
            fetchBlob: certFetchBlobs.get(`cert:${record.id}`),
        };
    })();

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title" style={{ fontSize: 18, fontWeight: 700 }}>Certifications</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="pa-filter-tabs">
                            {[
                                { value: 'All', label: 'All' },
                                { value: 'OK', label: 'Active' },
                                { value: 'Critical', label: 'Expiring' },
                                { value: 'Missing', label: 'Missing' },
                                { value: 'Expired', label: 'Expired' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    className={`pa-filter-tabs__tab ${certFilter === opt.value ? 'pa-filter-tabs__tab--active' : ''}`}
                                    onClick={() => setCertFilter(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <button className="btn btn--outline btn--sm" onClick={onEdit}>{Icons.edit} Edit Dates</button>
                    </div>
                </div>
                <div className="cp-card__body">
                    {loadingCerts ? (
                        <p style={{ padding: 16, color: 'hsl(var(--muted-foreground))' }}>Loading...</p>
                    ) : filteredTypes.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.shieldCheck}</div>
                            <p>No certifications match the current filter.</p>
                        </div>
                    ) : (
                        <div className="cert-portfolio">
                            <div className="cert-portfolio__list">
                                <div className="pa-services-grid">
                                    <div className="pa-services-grid__left">
                                        {filteredTypes.filter((_, i) => i % 2 === 0).map(ct => renderCertCard(ct))}
                                    </div>
                                    <div className="pa-services-grid__right">
                                        {filteredTypes.filter((_, i) => i % 2 === 1).map(ct => renderCertCard(ct))}
                                    </div>
                                </div>
                            </div>
                            {wide && (
                                <div className="cert-portfolio__viewer">
                                    <CertViewerPanel
                                        fileName={selected?.fileName}
                                        fetchBlob={selected?.fetchBlob}
                                        status={selected ? statusLabel(selected.status) : undefined}
                                        statusClass={selected ? statusBadgeClass(selected.status) : 'draft'}
                                        onReplace={() => selected && setShowUploadModal(selected.certType)}
                                        onHistory={() => selected && openHistoryFor(selected.certType)}
                                        emptyText={selected ? 'No file uploaded for this certification yet.' : 'Select a certification to preview its document.'}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {!loadingCerts && filteredTypes.length > 0 && (
                        <div className="pa-summary-bar">
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#22c55e' }}>{Icons.checkCircle}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">ACTIVE</span>
                                    <span className="pa-summary-bar__value">{counts.ok}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#f59e0b' }}>{Icons.clock}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">EXPIRING SOON</span>
                                    <span className="pa-summary-bar__value">{counts.critical}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#ef4444' }}>{Icons.alertTriangle}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">EXPIRED</span>
                                    <span className="pa-summary-bar__value">{counts.expired}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#3b82f6' }}>{Icons.fileText}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">TOTAL</span>
                                    <span className="pa-summary-bar__value">{counts.all}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {showUploadModal && (
                <CertUploadModal
                    certType={showUploadModal}
                    certLabel={CERT_TYPES.find(t => t.type === showUploadModal)?.label || showUploadModal}
                    onUpload={handleUpload}
                    onClose={() => setShowUploadModal(null)}
                />
            )}
            {previewUpload && (
                <PreviewModal
                    open
                    fileName={previewUpload.fileName}
                    onClose={() => setPreviewUpload(null)}
                    fetchBlob={previewUpload.fetchBlob || (() => api.downloadCertificationUpload(previewUpload.id))}
                />
            )}
            {historyFor && (
                <Modal onClose={() => setHistoryFor(null)}>
                    <h2 className="modal__title">{historyFor.label} — History</h2>
                    <p className="modal__desc">All files uploaded for this certification.</p>
                    {historyFor.uploads.length === 0 ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>No history for this certification.</p>
                    ) : (
                        <div className="cert-history__list">
                            {historyFor.uploads.map(u => (
                                <CertFileRow
                                    key={u.id}
                                    upload={u}
                                    onPreview={setPreviewUpload}
                                    onDownload={handleDownloadUpload}
                                    fetchBlob={certFetchBlobs.get(`upload:${u.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );

    function renderCertCard(ct) {
        const { status, days, expDate, record: activeRecord } = getCertStatusForType(ct.type);
        const colors = CERT_COLORS[ct.type] || CERT_COLORS.other;
        const activeWithFile = activeRecord?.fileName ? activeRecord : null;

        return (
            <CertCard
                key={ct.type}
                label={colors.label}
                icon={Icons[colors.icon]}
                colors={{ accent: colors.accent, bg: colors.bg, border: colors.border }}
                status={status}
                statusLabel={statusLabel(status)}
                days={days}
                expDate={expDate}
                renewalLabel={renewalLabelFor(ct)}
                hasFile={!!activeWithFile}
                selected={selectedCertId === ct.type}
                onSelect={() => setSelectedCertId(ct.type)}
                onView={() => {
                    if (wide) {
                        setSelectedCertId(ct.type);
                    } else if (activeWithFile) {
                        setPreviewUpload({
                            fileName: activeWithFile.fileName,
                            fetchBlob: certFetchBlobs.get(`cert:${activeWithFile.id}`),
                        });
                    } else {
                        setShowUploadModal(ct.type);
                    }
                }}
                onUpload={() => setShowUploadModal(ct.type)}
            />
        );
    }
}

function CertUploadModal({ certType, certLabel, onUpload, onClose }) {
    const [expDate, setExpDate] = useState('');
    const [file, setFile] = useState(null);
    const [notes, setNotes] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('certType', certType);
        if (expDate) formData.append('expirationDate', new Date(expDate).toISOString());
        if (notes) formData.append('notes', notes);
        if (file) formData.append('file', file);
        onUpload(certType, formData);
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">Upload {certLabel}</h2>
            <p className="modal__desc">Add a new certification record with optional file attachment.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="certExpDate">Expiration Date</label>
                    <input id="certExpDate" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="certFile">File Attachment</label>
                    <input id="certFile" type="file" onChange={e => setFile(e.target.files[0])} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                </div>
                <div className="form-group">
                    <label htmlFor="certNotes">Notes</label>
                    <textarea id="certNotes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">Upload</button>
                </div>
            </form>
        </Modal>
    );
}

const TS_STATUS_STYLES = TIMESHEET_STATUS_STYLES;

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
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.PAS }}>PAS {ts.totalPasHours.toFixed(2)}h</span>
                                                )}
                                                {ts.totalHmHours > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.Homemaker }}>HM {ts.totalHmHours.toFixed(2)}h</span>
                                                )}
                                                {(ts.totalRespiteHours || 0) > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.Respite }}>RP {ts.totalRespiteHours.toFixed(2)}h</span>
                                                )}
                                                {(ts.totalCompanionHours || 0) > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.Companion }}>CP {ts.totalCompanionHours.toFixed(2)}h</span>
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

    const sortedShifts = [...shifts].sort((a, b) => new Date(a.shiftDate) - new Date(b.shiftDate));
    const today = new Date(new Date().toDateString());
    const upcoming = sortedShifts.filter(s => new Date(s.shiftDate) >= today);
    const past = sortedShifts.filter(s => new Date(s.shiftDate) < today);

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
                        <table className="data-table data-table--sheet data-table--dark-header" style={{ borderRadius: 0 }}>
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
                                        <td style={{ fontWeight: 500 }}>{formatDate(shift.shiftDate)}</td>
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
                        <table className="data-table data-table--sheet data-table--dark-header" style={{ borderRadius: 0 }}>
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
                                        <td>{formatDate(shift.shiftDate)}</td>
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

function ScheduleHistoryTab({ employeeId }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        api.getEmployeeNotificationHistory(employeeId)
            .then(setHistory)
            .catch(() => setHistory([]))
            .finally(() => setLoading(false));
    }, [employeeId]);

    const filtered = useMemo(() => {
        if (filter === 'all') return history;
        return history.filter(n => {
            if (filter === 'accepted') return n.response === 'accepted';
            if (filter === 'pending') return !n.response && n.status === 'sent';
            if (filter === 'failed') return n.status === 'failed';
            return true;
        });
    }, [history, filter]);

    const formatPeriod = (weekStart) => {
        if (!weekStart) return '—';
        const ws = new Date(weekStart);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        return `${ws.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    };

    const getStatusBadge = (n) => {
        if (n.status === 'failed') return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>Failed</span>;
        if (n.response === 'accepted') return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>Accepted</span>;
        if (n.response === 'rejected') return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>Rejected</span>;
        if (n.response === 'changes_requested') return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>Review</span>;
        if (n.status === 'sent') return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#075985' }}>Sent</span>;
        return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151' }}>{n.status}</span>;
    };

    if (loading) return <div className="cp-tab-panel"><p style={{ color: 'hsl(var(--muted-foreground))' }}>Loading...</p></div>;

    return (
        <div className="cp-tab-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Schedule History</h3>
                <select value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid hsl(var(--border))' }}>
                    <option value="all">All Statuses</option>
                    <option value="accepted">Accepted</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>
            </div>
            {filtered.length === 0 ? (
                <div className="cp-empty-state-card">
                    <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))' }}>No schedule notifications found.</p>
                </div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table data-table--sheet data-table--dark-header">
                        <thead>
                            <tr>
                                <th>Schedule Period</th>
                                <th>Date Sent</th>
                                <th>Sent By</th>
                                <th>Status</th>
                                <th>Date Confirmed</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(n => (
                                <tr key={n.id}>
                                    <td style={{ fontWeight: 500 }}>{formatPeriod(n.weekStart)}</td>
                                    <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                        {n.sentAt ? new Date(n.sentAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td style={{ fontSize: 12 }}>{n.sentByUser?.name || '—'}</td>
                                    <td>{getStatusBadge(n)}</td>
                                    <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                        {n.respondedAt ? new Date(n.respondedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#374151', maxWidth: 200 }}>
                                        {n.responseNotes || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
