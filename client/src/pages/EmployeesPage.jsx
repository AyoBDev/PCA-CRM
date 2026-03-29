import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import * as api from '../api';

function EmployeeFormModal({ employee, users, onSave, onClose }) {
    const [name, setName] = useState(employee?.name || '');
    const [phone, setPhone] = useState(employee?.phone || '');
    const [email, setEmail] = useState(employee?.email || '');
    const [userId, setUserId] = useState(employee?.userId || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ name, phone, email, userId: userId || null });
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
    const { showToast } = useToast();
    const [employees, setEmployees] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterActive, setFilterActive] = useState('true');
    const [modal, setModal] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [emps, usrs] = await Promise.all([
                api.getEmployees({ active: filterActive }),
                api.getUsers(),
            ]);
            setEmployees(emps);
            setUsers(usrs);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filterActive, showToast]);

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
            await api.deleteEmployee(modal.employee.id);
            showToast('Employee deleted');
            setModal(null);
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
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

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Employees</h1>
                <div className="content-header__actions">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search employees…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select
                        className="filter-select"
                        value={filterActive}
                        onChange={e => setFilterActive(e.target.value)}
                    >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                        <option value="">All</option>
                    </select>
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'form' })}>
                        {Icons.plus} Add Employee
                    </button>
                </div>
            </div>

            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 16 }}>
                        {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.users}</div>
                        <div className="empty-state__title">No employees found</div>
                        <div className="empty-state__desc">Add employees or adjust your filters.</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>Linked Client</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(emp => (
                                    <tr key={emp.id}>
                                        <td style={{ fontWeight: 500 }}>{emp.name}</td>
                                        <td>{emp.phone || '—'}{!emp.phone && <span className="text-warn" title="No phone">&#x26A0;</span>}</td>
                                        <td>{emp.email || '—'}{!emp.email && <span className="text-warn" title="No email">&#x26A0;</span>}</td>
                                        <td>{emp.user ? emp.user.name : '—'}</td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${emp.active ? 'submitted' : 'draft'}`}>
                                                {emp.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="row-actions">
                                                <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', employee: emp })} title="Edit">
                                                    {Icons.edit}
                                                </button>
                                                <button className="btn btn--ghost btn--icon" onClick={() => handleToggleActive(emp)} title={emp.active ? 'Deactivate' : 'Activate'}>
                                                    {emp.active ? Icons.shieldCheck : Icons.checkCircle}
                                                </button>
                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', employee: emp })} title="Delete">
                                                    {Icons.trash}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
        </>
    );
}
