import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import * as api from '../api';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const CERT_FIELDS = [
    { key: 'tbDueDate', label: 'TB' },
    { key: 'cprDueDate', label: 'CPR' },
    { key: 'trainingDueDate', label: 'Training' },
    { key: 'backgroundCheckDueDate', label: 'Background' },
    { key: 'idExpDate', label: 'ID' },
];

function getCertSummary(emp) {
    const now = new Date();
    let worst = null;
    const items = [];
    for (const { key, label } of CERT_FIELDS) {
        if (!emp[key]) continue;
        const d = new Date(emp[key]);
        const days = Math.ceil((d - now) / 86400000);
        const status = days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid';
        items.push({ label, days, status, date: emp[key] });
        if (!worst || days < worst.days) worst = { label, days, status, date: emp[key] };
    }
    return { worst, items };
}

function getEmpCertStatus(emp) {
    const { items } = getCertSummary(emp);
    if (items.some(i => i.status === 'expired')) return 'expired';
    if (items.some(i => i.status === 'expiring')) return 'expiring';
    return 'valid';
}

function CertCell({ emp }) {
    const { worst, items } = getCertSummary(emp);
    if (!worst) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;

    const expired = items.filter(i => i.status === 'expired');
    const expiring = items.filter(i => i.status === 'expiring');

    if (expired.length > 0) {
        return (
            <span className="ts-badge ts-badge--danger" title={expired.map(i => `${i.label}: ${fmtDate(i.date)}`).join('\n')}>
                {expired.length} expired
            </span>
        );
    }
    if (expiring.length > 0) {
        return (
            <span className="ts-badge ts-badge--warning" title={expiring.map(i => `${i.label}: ${fmtDate(i.date)} (${i.days}d)`).join('\n')}>
                {expiring.length} due soon
            </span>
        );
    }
    return (
        <span className="ts-badge ts-badge--success" title={items.map(i => `${i.label}: ${fmtDate(i.date)}`).join('\n')}>
            All current
        </span>
    );
}

function EmployeeFormModal({ employee, users, onSave, onClose }) {
    const [name, setName] = useState(employee?.name || '');
    const [phone, setPhone] = useState(employee?.phone || '');
    const [email, setEmail] = useState(employee?.email || '');
    const [userId, setUserId] = useState(employee?.userId || '');
    const [address, setAddress] = useState(employee?.address || '');
    const [npi, setNpi] = useState(employee?.npi || '');
    const [clientAssignment, setClientAssignment] = useState(employee?.clientAssignment || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ name, phone, email, userId: userId || null, address, npi, clientAssignment });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{employee ? 'Edit Employee' : 'Add Employee'}</h2>
            <p className="modal__desc">{employee ? 'Update the employee details below.' : 'Fill in the details to add a new employee.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="empName">Name *</label>
                    <input id="empName" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="empPhone">Phone</label>
                        <input id="empPhone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="empEmail">Email</label>
                        <input id="empEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="empAddress">Address</label>
                    <input id="empAddress" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="empNpi">NPI</label>
                        <input id="empNpi" value={npi} onChange={e => setNpi(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="empClient">Client Assignment</label>
                        <input id="empClient" value={clientAssignment} onChange={e => setClientAssignment(e.target.value)} />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="empUser">Link to User Account (optional)</label>
                    <select id="empUser" value={userId} onChange={e => setUserId(e.target.value)}>
                        <option value="">— None —</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                        ))}
                    </select>
                </div>
                {!phone && !email && (
                    <div className="form-warning">
                        No contact info — this employee won't receive schedule notifications.
                    </div>
                )}
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{employee ? 'Save Changes' : 'Add Employee'}</button>
                </div>
            </form>
        </Modal>
    );
}

export default function EmployeesPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const [employees, setEmployees] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [modal, setModal] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(null);
    const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileRef = useRef();

    const fetchData = useCallback(async () => {
        try {
            const [emps, usrs] = await Promise.all([
                api.getEmployees({}, { archived: showArchived }),
                api.getUsers(),
            ]);
            setEmployees(emps);
            setUsers(usrs);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showArchived, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data) => {
        try {
            if (modal.employee) {
                await api.updateEmployee(modal.employee.id, data);
                showToast('Employee updated');
            } else {
                await api.createEmployee(data);
                showToast('Employee created');
            }
            setModal(null);
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDelete = async () => {
        try {
            const emp = modal.employee;
            await api.deleteEmployee(emp.id);
            setModal(null);
            fetchData();
            showUndoToast(`"${emp.name}" archived`, async () => {
                await api.restoreEmployee(emp.id);
                fetchData();
            });
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleRestore = async (emp) => {
        try {
            await api.restoreEmployee(emp.id);
            showToast(`"${emp.name}" restored`);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (emp) => {
        try {
            await api.permanentlyDeleteEmployee(emp.id);
            setConfirmPermanentDelete(null);
            showToast('Item permanently deleted');
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeleteEmployees();
            setConfirmBulkPermanentDelete(false);
            showToast(`${result.count} archived employee(s) permanently deleted`);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleToggleActive = async (emp) => {
        try {
            await api.updateEmployee(emp.id, { active: !emp.active });
            showToast(emp.active ? 'Employee deactivated' : 'Employee activated');
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const result = await api.bulkImportEmployees(fd);
            showToast(`Imported ${result.imported} employees (${result.created} new, ${result.updated} updated)`);
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setImporting(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    // Counts for filter pills
    const criticalCount = employees.filter(e => e.critical).length;
    const now = new Date();
    let expiredCount = 0, expiringCount = 0;
    employees.forEach(emp => {
        const s = getEmpCertStatus(emp);
        if (s === 'expired') expiredCount++;
        else if (s === 'expiring') expiringCount++;
    });

    // Apply filters
    const filtered = employees.filter(e => {
        const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
            (e.clientAssignment || '').toLowerCase().includes(search.toLowerCase()) ||
            (e.npi || '').includes(search);
        if (!matchesSearch) return false;

        if (statusFilter === 'Critical') return e.critical;
        if (statusFilter === 'Expiring') return getEmpCertStatus(e) === 'expiring';
        if (statusFilter === 'Expired') return getEmpCertStatus(e) === 'expired';
        return true;
    });

    return (
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.users}</div>
                    <div>
                        <div className="page-hero__title">Employees</div>
                        <div className="page-hero__subtitle">Manage caregiver profiles, certifications and compliance</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    <input
                        type="text"
                        className="page-hero__search"
                        placeholder="Search employees..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {isAdmin && <ActivityButton entityType="Employee" />}
                    {!showArchived && isAdmin && (
                        <>
                            <input type="file" ref={fileRef} accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
                            <button className="btn btn--outline" onClick={() => fileRef.current?.click()} disabled={importing}>
                                {Icons.upload} {importing ? 'Importing...' : 'Import'}
                            </button>
                        </>
                    )}
                    {!showArchived && (
                        <button className="btn btn--outline" onClick={() => setShowArchived(true)}>
                            {Icons.archive} Archived
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary" onClick={() => setModal({ type: 'form' })}>
                            {Icons.plus} Add Employee
                        </button>
                    )}
                </div>
            </div>

            {!showArchived && !loading && (
                <div className="stats-grid">
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Total Employees</span>
                            <span className="card__icon">{Icons.users}</span>
                        </div>
                        <div className="card__value">{employees.length}</div>
                        <div className="card__description">{filtered.length} shown with current filters</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Critical</span>
                            <span className="card__icon text-destructive">{Icons.alertTriangle}</span>
                        </div>
                        <div className="card__value text-destructive">{criticalCount}</div>
                        <div className="card__description">Employees on critical list</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Expiring Soon</span>
                            <span className="card__icon text-warning">{Icons.alertTriangle}</span>
                        </div>
                        <div className="card__value text-warning">{expiringCount}</div>
                        <div className="card__description">Certifications due within 30 days</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Expired</span>
                            <span className="card__icon text-destructive">{Icons.alertTriangle}</span>
                        </div>
                        <div className="card__value text-destructive">{expiredCount}</div>
                        <div className="card__description">Certifications past due date</div>
                    </div>
                </div>
            )}

            <div className="page-content">
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived employees. Click "Restore" to bring items back.</span>
                        {filtered.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirmBulkPermanentDelete(true)}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}
                {loading ? (
                    <div style={{ padding: 16 }}>
                        {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />)}
                    </div>
                ) : (
                    <div className="sheet-card">
                        <div className="filter-pills">
                            {[
                                { key: 'All', color: '', count: employees.length },
                                { key: 'Critical', color: 'red', count: criticalCount },
                                { key: 'Expiring', color: 'orange', count: expiringCount },
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

                        {filtered.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state__icon">{Icons.users}</div>
                                <div className="empty-state__title">No employees found</div>
                                <div className="empty-state__desc">Add employees or adjust your filters.</div>
                            </div>
                        ) : (
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet">
                                    <thead>
                                        <tr>
                                            <th scope="col">Name</th>
                                            <th scope="col">Phone</th>
                                            <th scope="col">Client</th>
                                            <th scope="col">Certifications</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(emp => (
                                            <tr key={emp.id} className={emp.critical ? 'row--critical' : ''}>
                                                <td style={{ fontWeight: 500 }}>
                                                    {emp.name}
                                                    {emp.critical && <span className="ts-badge ts-badge--danger" style={{ marginLeft: 6, fontSize: 10 }}>CRITICAL</span>}
                                                </td>
                                                <td>{emp.phone || '—'}</td>
                                                <td>{emp.clientAssignment || '—'}</td>
                                                <td><CertCell emp={emp} /></td>
                                                <td>
                                                    <span className={`ts-badge ts-badge--${emp.active ? 'submitted' : 'draft'}`}>
                                                        {emp.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        {showArchived ? (
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <button className="btn btn--restore" onClick={() => handleRestore(emp)} title="Restore">
                                                                    {Icons.rotateCcw} Restore
                                                                </button>
                                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmPermanentDelete(emp)} title="Delete permanently">{Icons.trash}</button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', employee: emp })} title="Edit">
                                                                    {Icons.edit}
                                                                </button>
                                                                <button className="btn btn--ghost btn--icon" onClick={() => handleToggleActive(emp)} title={emp.active ? 'Deactivate' : 'Activate'}>
                                                                    {emp.active ? Icons.shieldCheck : Icons.checkCircle}
                                                                </button>
                                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', employee: emp })} title="Delete">
                                                                    {Icons.trash}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {modal?.type === 'form' && (
                <EmployeeFormModal
                    employee={modal.employee}
                    users={users}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Employee"
                    message={`Delete ${modal.employee.name}? This will fail if they have any shifts assigned.`}
                    onConfirm={handleDelete}
                    onClose={() => setModal(null)}
                />
            )}
            {confirmPermanentDelete && (
                <ConfirmModal
                    title="Permanently Delete Employee"
                    message={`Permanently delete "${confirmPermanentDelete.name}"? This action cannot be undone.`}
                    confirmLabel="Delete Forever"
                    confirmVariant="danger"
                    onConfirm={() => handlePermanentDelete(confirmPermanentDelete)}
                    onClose={() => setConfirmPermanentDelete(null)}
                />
            )}
            {confirmBulkPermanentDelete && (
                <ConfirmModal
                    title="Delete All Archived Employees"
                    message={`Permanently delete all ${employees.length} archived employee(s)? This action cannot be undone.`}
                    confirmLabel="Delete All Forever"
                    confirmVariant="danger"
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setConfirmBulkPermanentDelete(false)}
                />
            )}
        </>
    );
}
