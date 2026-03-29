import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
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
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{employee ? 'Edit Employee' : 'Add Employee'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label>Name *</label>
                            <input value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Link to User Account (optional)</label>
                            <select value={userId} onChange={e => setUserId(e.target.value)}>
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
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn--primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
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

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Employees</h2>
                <button className="btn btn--primary" onClick={() => setModal({ type: 'form' })}>
                    + Add Employee
                </button>
            </div>

            <div className="toolbar">
                <input
                    className="search-input"
                    placeholder="Search employees..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select value={filterActive} onChange={e => { setFilterActive(e.target.value); }}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                    <option value="">All</option>
                </select>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Linked User</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(emp => (
                        <tr key={emp.id}>
                            <td>{emp.name}</td>
                            <td>{emp.phone || '—'}{!emp.phone && <span className="text-warn" title="No phone">&#x26A0;</span>}</td>
                            <td>{emp.email || '—'}{!emp.email && <span className="text-warn" title="No email">&#x26A0;</span>}</td>
                            <td>{emp.user ? emp.user.name : '—'}</td>
                            <td><span className={`badge badge--${emp.active ? 'success' : 'muted'}`}>{emp.active ? 'Active' : 'Inactive'}</span></td>
                            <td>
                                <button className="btn btn--sm" onClick={() => setModal({ type: 'form', employee: emp })}>Edit</button>
                                <button className="btn btn--sm btn--secondary" onClick={() => handleToggleActive(emp)}>
                                    {emp.active ? 'Deactivate' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

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
        </div>
    );
}
