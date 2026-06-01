import { useState, useEffect, useCallback } from 'react';
import { listTasks, getTaskSummary, updateTask, deleteTask, bulkUpdateTasks, getUsers, listWorkflowTriggers, updateWorkflowTrigger } from '../api';
import { useToast } from '../hooks/useToast';
import TaskModal from '../components/tasks/TaskModal';
import Icons from '../components/common/Icons';
import Pagination from '../components/common/Pagination';
import LoadingState from '../components/common/LoadingState';

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'completed', 'cancelled'];
const URGENCY_OPTIONS = ['all', 'low', 'medium', 'high'];

const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const URGENCY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

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
    const [summary, setSummary] = useState({ overdue: 0, dueToday: 0, dueThisWeek: 0, openTotal: 0 });

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
        getTaskSummary().then(setSummary).catch(() => {});
    }, [tasks]);

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
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.checkSquare}</div>
                    <div>
                        <div className="page-hero__title">Tasks</div>
                        <div className="page-hero__subtitle">Manage tasks and workflow automation</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    <button className="btn btn--outline" onClick={() => setShowSettings(!showSettings)}>
                        {Icons.settings} {showSettings ? 'Hide Settings' : 'Settings'}
                    </button>
                    <button className="btn btn--primary" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
                        {Icons.plus} New Task
                    </button>
                </div>
            </div>

            <div className="page-content">
                <div className="ts-summary-cards">
                    <div className="ts-summary-card">
                        <div className="ts-summary-card__icon ts-summary-card__icon--overdue">{Icons.alertCircle}</div>
                        <div className="ts-summary-card__content">
                            <span className="ts-summary-card__label">Overdue</span>
                            <span className="ts-summary-card__value">{summary.overdue}</span>
                        </div>
                    </div>
                    <div className="ts-summary-card">
                        <div className="ts-summary-card__icon ts-summary-card__icon--draft">{Icons.clock}</div>
                        <div className="ts-summary-card__content">
                            <span className="ts-summary-card__label">Due Today</span>
                            <span className="ts-summary-card__value">{summary.dueToday}</span>
                        </div>
                    </div>
                    <div className="ts-summary-card">
                        <div className="ts-summary-card__icon ts-summary-card__icon--submitted">{Icons.calendar}</div>
                        <div className="ts-summary-card__content">
                            <span className="ts-summary-card__label">Due This Week</span>
                            <span className="ts-summary-card__value">{summary.dueThisWeek}</span>
                        </div>
                    </div>
                    <div className="ts-summary-card">
                        <div className="ts-summary-card__icon ts-summary-card__icon--total">{Icons.checkSquare}</div>
                        <div className="ts-summary-card__content">
                            <span className="ts-summary-card__label">Total Open</span>
                            <span className="ts-summary-card__value">{summary.openTotal}</span>
                        </div>
                    </div>
                </div>

                <div className="ts-filter-bar">
                    <div className="ts-filter-bar__field">
                        <label>Status</label>
                        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : STATUS_LABELS[s]}</option>)}
                        </select>
                    </div>
                    <div className="ts-filter-bar__field">
                        <label>Urgency</label>
                        <select value={filters.urgency} onChange={(e) => setFilters((f) => ({ ...f, urgency: e.target.value }))}>
                            {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u === 'all' ? 'All Urgency' : URGENCY_LABELS[u]}</option>)}
                        </select>
                    </div>
                    <div className="ts-filter-bar__field">
                        <label>Assigned To</label>
                        <select value={filters.assignedToUserId} onChange={(e) => setFilters((f) => ({ ...f, assignedToUserId: e.target.value }))}>
                            <option value="">All Assignees</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div className="ts-filter-bar__actions">
                        <button className="btn btn--outline btn--sm" onClick={() => setFilters({ status: 'open', urgency: 'all', assignedToUserId: '' })}>Reset</button>
                    </div>
                </div>

                {selectedIds.length > 0 && (
                    <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '10px 16px', marginBottom: '12px', background: 'hsl(var(--muted) / 0.5)', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedIds.length} selected</span>
                        <button className="btn btn--primary btn--sm" onClick={() => handleBulkAction('completed')}>Mark Complete</button>
                        <button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('cancelled')}>Cancel Selected</button>
                    </div>
                )}

                {loading ? (
                    <LoadingState rows={5} />
                ) : tasks.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.checkSquare}</div>
                        <div className="empty-state__title">
                            {filters.status !== 'open' || filters.urgency !== 'all' || filters.assignedToUserId ? 'No tasks match your filters' : 'No open tasks'}
                        </div>
                        <div className="empty-state__desc">Click "New Task" to create a task, or adjust your filters.</div>
                    </div>
                ) : (
                    <>
                        <div className="sheet-card">
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col" style={{ width: 36 }}>
                                                <input type="checkbox" checked={selectedIds.length === tasks.length && tasks.length > 0} onChange={toggleSelectAll} />
                                            </th>
                                            <th scope="col">Title</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">Urgency</th>
                                            <th scope="col">Assigned To</th>
                                            <th scope="col">Due Date</th>
                                            <th scope="col" style={{ width: 160 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((task) => (
                                            <tr key={task.id} className={isOverdue(task) ? 'row--critical' : ''}>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelect(task.id)} />
                                                </td>
                                                <td>
                                                    <button className="link-btn" style={{ fontWeight: 500 }} onClick={() => { setEditingTask(task); setModalOpen(true); }}>
                                                        {task.title}
                                                    </button>
                                                </td>
                                                <td>
                                                    <span className={`ts-badge ts-badge--${task.status === 'open' ? 'draft' : task.status === 'in_progress' ? 'submitted' : task.status === 'completed' ? 'accepted' : 'danger'}`}>
                                                        {STATUS_LABELS[task.status]}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`ts-badge ts-badge--${task.urgency === 'high' ? 'danger' : task.urgency === 'medium' ? 'warning' : 'success'}`}>
                                                        {URGENCY_LABELS[task.urgency]}
                                                    </span>
                                                </td>
                                                <td>{task.assignedToUser?.name || task.assignedToRole || '—'}</td>
                                                <td className={isOverdue(task) ? 'text--danger' : ''} style={{ fontSize: 13 }}>{fmtDate(task.dueDate)}</td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                        {task.status === 'open' && (
                                                            <button className="btn btn--outline btn--xs" onClick={() => handleStatusChange(task, 'in_progress')}>Start</button>
                                                        )}
                                                        {(task.status === 'open' || task.status === 'in_progress') && (
                                                            <>
                                                                <button className="btn btn--success btn--xs" onClick={() => handleStatusChange(task, 'completed')}>Done</button>
                                                                <button className="btn btn--danger-ghost btn--icon" onClick={() => handleDelete(task)} title="Cancel task">{Icons.x}</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    </>
                )}

                {showSettings && (
                    <div style={{ marginTop: '2rem' }}>
                        <div className="sheet-card">
                            <div className="sheet-card__header">
                                <h3 className="sheet-card__title">{Icons.settings} Workflow Triggers</h3>
                            </div>
                            <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', padding: '0 20px 16px' }}>
                                Configure automatic task creation rules. Tasks are generated hourly when conditions are met.
                            </p>
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col">Name</th>
                                            <th scope="col">Type</th>
                                            <th scope="col">Enabled</th>
                                            <th scope="col">Threshold</th>
                                            <th scope="col">Urgency</th>
                                            <th scope="col">Assign To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {triggers.map((trigger) => (
                                            <tr key={trigger.id}>
                                                <td style={{ fontWeight: 500 }}>{trigger.name}</td>
                                                <td><span className="ts-badge ts-badge--submitted">{trigger.type}</span></td>
                                                <td>
                                                    <input type="checkbox" checked={trigger.enabled} onChange={(e) => handleTriggerUpdate(trigger.id, 'enabled', e.target.checked)} />
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <input type="number" className="input--sm" value={trigger.thresholdDays} onChange={(e) => handleTriggerUpdate(trigger.id, 'thresholdDays', Number(e.target.value))} style={{ width: '60px' }} />
                                                        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>days</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <select value={trigger.urgency} onChange={(e) => handleTriggerUpdate(trigger.id, 'urgency', e.target.value)} style={{ fontSize: 13 }}>
                                                        <option value="low">Low</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="high">High</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select value={trigger.assignToUserId || ''} onChange={(e) => handleTriggerUpdate(trigger.id, 'assignToUserId', e.target.value ? Number(e.target.value) : null)} style={{ fontSize: 13 }}>
                                                        <option value="">Role: {trigger.assignToRole || 'None'}</option>
                                                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {modalOpen && (
                <TaskModal
                    task={editingTask}
                    users={users}
                    onClose={() => { setModalOpen(false); setEditingTask(null); }}
                    onSaved={handleSaved}
                />
            )}
        </>
    );
}
