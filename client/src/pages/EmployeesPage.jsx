import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

function ComplianceCell({ emp }) {
    const status = getEmpCertStatus(emp);
    const { items } = getCertSummary(emp);
    const expired = items.filter(i => i.status === 'expired');
    const expiring = items.filter(i => i.status === 'expiring');

    if (status === 'expired') {
        return (
            <div className="compliance-indicator compliance-indicator--danger" title={expired.map(i => `${i.label}: ${fmtDate(i.date)}`).join('\n')}>
                {Icons.alertTriangle}
                <span>{expired.length} expired</span>
            </div>
        );
    }
    if (status === 'expiring') {
        return (
            <div className="compliance-indicator compliance-indicator--warning" title={expiring.map(i => `${i.label}: ${fmtDate(i.date)} (${i.days}d)`).join('\n')}>
                {Icons.alertTriangle}
                <span>Action needed</span>
            </div>
        );
    }
    return (
        <div className="compliance-indicator compliance-indicator--success" title={items.map(i => `${i.label}: ${fmtDate(i.date)}`).join('\n')}>
            {Icons.checkCircle}
            <span>Up to date</span>
        </div>
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

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function EmployeesPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const navigate = useNavigate();
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
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkNoteModal, setBulkNoteModal] = useState(false);
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

    useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, search, showArchived]);

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
    let expiredCount = 0, expiringCount = 0, okCount = 0;
    employees.forEach(emp => {
        const s = getEmpCertStatus(emp);
        if (s === 'expired') expiredCount++;
        else if (s === 'expiring') expiringCount++;
        else if (!emp.critical) okCount++;
    });

    // Apply filters
    const filtered = employees.filter(e => {
        const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
            (e.clientAssignment || '').toLowerCase().includes(search.toLowerCase()) ||
            (e.npi || '').includes(search);
        if (!matchesSearch) return false;

        if (statusFilter === 'OK') return getEmpCertStatus(e) === 'valid' && !e.critical;
        if (statusFilter === 'Critical') return e.critical;
        if (statusFilter === 'Expired') return getEmpCertStatus(e) === 'expired';
        return true;
    }).sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));

    const allSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(e => e.id)));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

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

                {!showArchived && !loading && (
                    <div className="stats-grid">
                        <div className={`card card--clickable ${statusFilter === 'All' ? 'card--active' : ''}`} onClick={() => setStatusFilter('All')}>
                            <div className="card__header">
                                <span className="card__title">All</span>
                                <span className="card__icon">{Icons.users}</span>
                            </div>
                            <div className="card__value">{employees.length}</div>
                            <div className="card__description">Total Employees</div>
                        </div>
                        <div className={`card card--clickable ${statusFilter === 'OK' ? 'card--active' : ''}`} onClick={() => setStatusFilter('OK')}>
                            <div className="card__header">
                                <span className="card__title">OK</span>
                                <span className="card__icon" style={{ color: 'hsl(142 76% 36%)' }}>{Icons.checkCircle}</span>
                            </div>
                            <div className="card__value" style={{ color: 'hsl(142 76% 36%)' }}>{okCount}</div>
                            <div className="card__description">Up to date</div>
                        </div>
                        <div className={`card card--clickable ${statusFilter === 'Critical' ? 'card--active' : ''}`} onClick={() => setStatusFilter('Critical')}>
                            <div className="card__header">
                                <span className="card__title">Critical</span>
                                <span className="card__icon text-destructive">{Icons.alertTriangle}</span>
                            </div>
                            <div className="card__value text-destructive">{criticalCount}</div>
                            <div className="card__description">Action needed</div>
                        </div>
                        <div className={`card card--clickable ${statusFilter === 'Expired' ? 'card--active' : ''}`} onClick={() => setStatusFilter('Expired')}>
                            <div className="card__header">
                                <span className="card__title">Expired</span>
                                <span className="card__icon text-destructive">{Icons.alertTriangle}</span>
                            </div>
                            <div className="card__value text-destructive">{expiredCount}</div>
                            <div className="card__description">Past due</div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: 16 }}>
                        {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />)}
                    </div>
                ) : (
                    <div className="sheet-card">
                        <div className="table-toolbar">
                            <div className="table-toolbar__left">
                                <input
                                    type="checkbox"
                                    className="bulk-checkbox"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                />
                                <span className="table-toolbar__selected">{selectedIds.size} selected</span>
                                <select
                                    className="table-toolbar__select"
                                    value=""
                                    onChange={async (e) => {
                                        const action = e.target.value;
                                        if (!action) return;
                                        e.target.value = '';
                                        if (selectedIds.size === 0) { showToast('Select employees first', 'error'); return; }
                                        const selected = employees.filter(emp => selectedIds.has(emp.id));
                                        if (action === 'toggle') {
                                            const prevStates = selected.map(emp => ({ id: emp.id, active: emp.active }));
                                            await Promise.all(selected.map(emp => api.updateEmployee(emp.id, { active: !emp.active })));
                                            setSelectedIds(new Set());
                                            fetchData();
                                            showUndoToast(`Toggled status for ${selected.length} employee(s)`, async () => {
                                                await Promise.all(prevStates.map(s => api.updateEmployee(s.id, { active: s.active })));
                                                fetchData();
                                            });
                                        } else if (action === 'archive') {
                                            const ids = selected.map(emp => emp.id);
                                            await Promise.all(ids.map(id => api.deleteEmployee(id)));
                                            setSelectedIds(new Set());
                                            fetchData();
                                            showUndoToast(`Archived ${selected.length} employee(s)`, async () => {
                                                await Promise.all(ids.map(id => api.restoreEmployee(id)));
                                                fetchData();
                                            });
                                        } else if (action === 'note') {
                                            setBulkNoteModal(true);
                                        }
                                    }}
                                >
                                    <option value="">Bulk Actions</option>
                                    <option value="toggle">Toggle Status</option>
                                    <option value="note">Add Note</option>
                                    <option value="archive">Archive</option>
                                </select>
                            </div>
                            <div className="table-toolbar__right">
                                <button className="table-toolbar__filter-btn">
                                    {Icons.filter} Filters
                                </button>
                                <select
                                    className="table-toolbar__filter"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="All">All Status</option>
                                    <option value="OK">OK</option>
                                    <option value="Critical">Critical</option>
                                    <option value="Expired">Expired</option>
                                </select>
                                {statusFilter !== 'All' && (
                                    <button className="table-toolbar__reset" onClick={() => setStatusFilter('All')}>
                                        {Icons.rotateCcw} Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state__icon">{Icons.users}</div>
                                <div className="empty-state__title">No employees found</div>
                                <div className="empty-state__desc">Add employees or adjust your filters.</div>
                            </div>
                        ) : (
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col" style={{ width: 40 }}>
                                                <input
                                                    type="checkbox"
                                                    className="bulk-checkbox bulk-checkbox--light"
                                                    checked={allSelected}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th scope="col">Employee</th>
                                            <th scope="col">Phone</th>
                                            <th scope="col">Client(s) Assigned</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">Compliance</th>
                                            <th scope="col">Last Updated</th>
                                            <th scope="col">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(emp => (
                                            <tr key={emp.id} className={emp.critical ? 'row--critical' : ''}>
                                                <td onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="bulk-checkbox"
                                                        checked={selectedIds.has(emp.id)}
                                                        onChange={() => toggleSelect(emp.id)}
                                                    />
                                                </td>
                                                <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/employees/${emp.id}`)}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div className="client-avatar" style={{ background: getAvatarColor(emp.name), width: 32, height: 32, fontSize: 12 }}>
                                                            {getInitials(emp.name)}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 500, color: 'hsl(var(--primary))' }}>{emp.name}</div>
                                                            {emp.email && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{emp.email}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{emp.phone || '—'}</td>
                                                <td>{emp.clientAssignment || '—'}</td>
                                                <td>
                                                    <span className={`ts-badge ts-badge--${emp.active ? 'submitted' : 'draft'}`}>
                                                        {emp.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td><ComplianceCell emp={emp} /></td>
                                                <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                    {fmtDate(emp.updatedAt)}
                                                </td>
                                                <td onClick={e => e.stopPropagation()}>
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
                                                                <button className="btn btn--ghost btn--icon" onClick={() => navigate(`/employees/${emp.id}`)} title="View">
                                                                    {Icons.eye}
                                                                </button>
                                                                <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', employee: emp })} title="Edit">
                                                                    {Icons.edit}
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
            {bulkNoteModal && (
                <Modal onClose={() => setBulkNoteModal(false)}>
                    <h2 className="modal__title">Add Note to {selectedIds.size} Employee(s)</h2>
                    <p className="modal__desc">This note will be appended to each selected employee's notes.</p>
                    <BulkNoteForm
                        onSave={async (note) => {
                            const selected = employees.filter(emp => selectedIds.has(emp.id));
                            const prevNotes = selected.map(emp => ({ id: emp.id, notes: emp.notes || '' }));
                            await Promise.all(selected.map(emp =>
                                api.updateEmployee(emp.id, { notes: emp.notes ? `${emp.notes}\n${note}` : note })
                            ));
                            setBulkNoteModal(false);
                            setSelectedIds(new Set());
                            fetchData();
                            showUndoToast(`Added note to ${selected.length} employee(s)`, async () => {
                                await Promise.all(prevNotes.map(s => api.updateEmployee(s.id, { notes: s.notes })));
                                fetchData();
                            });
                        }}
                        onClose={() => setBulkNoteModal(false)}
                    />
                </Modal>
            )}
        </>
    );
}

function BulkNoteForm({ onSave, onClose }) {
    const [note, setNote] = useState('');
    return (
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSave(note.trim()); }}>
            <div className="form-group">
                <label htmlFor="bulkEmpNote">Note</label>
                <textarea
                    id="bulkEmpNote"
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter note..."
                    autoFocus
                />
            </div>
            <div className="form-actions">
                <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={!note.trim()}>Add Note</button>
            </div>
        </form>
    );
}
