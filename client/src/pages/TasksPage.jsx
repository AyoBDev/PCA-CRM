import { useState, useEffect, useCallback } from 'react';
import { listTasks, updateTask, deleteTask, bulkUpdateTasks, getUsers, listWorkflowTriggers, updateWorkflowTrigger } from '../api';
import { useToast } from '../hooks/useToast';
import TaskModal from '../components/tasks/TaskModal';
import Icons from '../components/common/Icons';
import Pagination from '../components/common/Pagination';

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'completed', 'cancelled'];
const URGENCY_OPTIONS = ['all', 'low', 'medium', 'high'];

const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const URGENCY_COLORS = { low: '#71717a', medium: '#ca8a04', high: '#dc2626' };

export default function TasksPage() {
    const { showToast } = useToast();
    const [tasks, setTasks] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'open', urgency: 'all', assignedToUserId: '' });
    const [selectedIds, setSelectedIds] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [users, setUsers] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [triggers, setTriggers] = useState([]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page };
            if (filters.status !== 'all') params.status = filters.status;
            if (filters.urgency !== 'all') params.urgency = filters.urgency;
            if (filters.assignedToUserId) params.assignedToUserId = filters.assignedToUserId;
            const data = await listTasks(params);
            setTasks(data.tasks);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filters, showToast]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useEffect(() => {
        getUsers().then((data) => setUsers(Array.isArray(data) ? data : data.users || [])).catch(() => {});
    }, []);

    useEffect(() => { setPage(1); }, [filters]);

    useEffect(() => {
        if (showSettings) {
            listWorkflowTriggers().then(setTriggers).catch(() => {});
        }
    }, [showSettings]);

    const handleStatusChange = async (task, newStatus) => {
        try {
            const updated = await updateTask(task.id, { status: newStatus });
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            showToast(`Task marked as ${STATUS_LABELS[newStatus]}`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDelete = async (task) => {
        try {
            await deleteTask(task.id);
            setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'cancelled' } : t)));
            showToast('Task cancelled');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleBulkAction = async (status) => {
        if (selectedIds.length === 0) return;
        try {
            await bulkUpdateTasks(selectedIds, status);
            showToast(`${selectedIds.length} tasks updated`);
            setSelectedIds([]);
            fetchTasks();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === tasks.length) setSelectedIds([]);
        else setSelectedIds(tasks.map((t) => t.id));
    };

    const handleSaved = () => {
        setModalOpen(false);
        setEditingTask(null);
        fetchTasks();
    };

    const handleTriggerUpdate = async (id, field, value) => {
        try {
            const updated = await updateWorkflowTrigger(id, { [field]: value });
            setTriggers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const isOverdue = (task) => task.dueDate && new Date(task.dueDate) < new Date() && ['open', 'in_progress'].includes(task.status);

    return (
        <div className="page">
            <div className="page__header">
                <h1>Tasks</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" onClick={() => setShowSettings(!showSettings)}>
                        {Icons.settings} {showSettings ? 'Hide Settings' : 'Settings'}
                    </button>
                    <button className="btn btn--primary" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
                        {Icons.plus} New Task
                    </button>
                </div>
            </div>

            <div className="filters-row">
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : STATUS_LABELS[s]}</option>)}
                </select>
                <select value={filters.urgency} onChange={(e) => setFilters((f) => ({ ...f, urgency: e.target.value }))}>
                    {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u === 'all' ? 'All Urgency' : u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                </select>
                <select value={filters.assignedToUserId} onChange={(e) => setFilters((f) => ({ ...f, assignedToUserId: e.target.value }))}>
                    <option value="">All Assignees</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>

            {selectedIds.length > 0 && (
                <div className="bulk-actions">
                    <span>{selectedIds.length} selected</span>
                    <button className="btn btn--sm" onClick={() => handleBulkAction('completed')}>Mark Complete</button>
                    <button className="btn btn--sm btn--danger" onClick={() => handleBulkAction('cancelled')}>Cancel</button>
                </div>
            )}

            {loading ? (
                <div className="loading-state">Loading...</div>
            ) : tasks.length === 0 ? (
                <div className="empty-state">No tasks found</div>
            ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" checked={selectedIds.length === tasks.length && tasks.length > 0} onChange={toggleSelectAll} /></th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Urgency</th>
                            <th>Assigned To</th>
                            <th>Due Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((task) => (
                            <tr key={task.id} className={isOverdue(task) ? 'row--overdue' : ''}>
                                <td><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelect(task.id)} /></td>
                                <td>
                                    <button className="link-btn" onClick={() => { setEditingTask(task); setModalOpen(true); }}>
                                        {task.title}
                                    </button>
                                </td>
                                <td><span className={`badge badge--${task.status}`}>{STATUS_LABELS[task.status]}</span></td>
                                <td><span className="urgency-dot" style={{ color: URGENCY_COLORS[task.urgency] }}>{task.urgency}</span></td>
                                <td>{task.assignedToUser?.name || task.assignedToRole || '—'}</td>
                                <td className={isOverdue(task) ? 'text--danger' : ''}>{fmtDate(task.dueDate)}</td>
                                <td>
                                    {task.status === 'open' && (
                                        <button className="btn btn--xs" onClick={() => handleStatusChange(task, 'in_progress')}>Start</button>
                                    )}
                                    {(task.status === 'open' || task.status === 'in_progress') && (
                                        <>
                                            <button className="btn btn--xs btn--success" onClick={() => handleStatusChange(task, 'completed')}>Done</button>
                                            <button className="btn btn--xs btn--danger" onClick={() => handleDelete(task)}>Cancel</button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

            {showSettings && (
                <div className="settings-section">
                    <h2>Workflow Triggers</h2>
                    <p style={{ color: '#71717a', fontSize: '0.875rem', marginBottom: '1rem' }}>
                        Configure automatic task creation rules. Tasks are generated hourly when conditions are met.
                    </p>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Enabled</th>
                                <th>Threshold</th>
                                <th>Urgency</th>
                                <th>Assign To</th>
                            </tr>
                        </thead>
                        <tbody>
                            {triggers.map((trigger) => (
                                <tr key={trigger.id}>
                                    <td>{trigger.name}</td>
                                    <td><span className="badge">{trigger.type}</span></td>
                                    <td>
                                        <input type="checkbox" checked={trigger.enabled} onChange={(e) => handleTriggerUpdate(trigger.id, 'enabled', e.target.checked)} />
                                    </td>
                                    <td>
                                        <input type="number" className="input--sm" value={trigger.thresholdDays} onChange={(e) => handleTriggerUpdate(trigger.id, 'thresholdDays', Number(e.target.value))} style={{ width: '60px' }} /> days
                                    </td>
                                    <td>
                                        <select value={trigger.urgency} onChange={(e) => handleTriggerUpdate(trigger.id, 'urgency', e.target.value)}>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select value={trigger.assignToUserId || ''} onChange={(e) => handleTriggerUpdate(trigger.id, 'assignToUserId', e.target.value ? Number(e.target.value) : null)}>
                                            <option value="">Role: {trigger.assignToRole || 'None'}</option>
                                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modalOpen && (
                <TaskModal
                    task={editingTask}
                    users={users}
                    onClose={() => { setModalOpen(false); setEditingTask(null); }}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}
