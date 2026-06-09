import { useState, useEffect, useCallback } from 'react';
import { listTasks, getTaskSummary, updateTask, deleteTask, bulkUpdateTasks, getUsers, listWorkflowTriggers, updateWorkflowTrigger } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useUndoStack } from '../hooks/useUndoStack';
import TaskModal from '../components/tasks/TaskModal';
import Icons from '../components/common/Icons';
import Pagination from '../components/common/Pagination';
import LoadingState from '../components/common/LoadingState';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'completed', 'cancelled'];
const URGENCY_OPTIONS = ['all', 'low', 'medium', 'high'];

const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const URGENCY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

export default function TasksPage() {
    const { showToast } = useToast();
    const { isAdmin } = useAuth();
    const undoState = useUndoStack();
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
    const [menuOpenId, setMenuOpenId] = useState(null);

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

    useEffect(() => {
        if (!menuOpenId) return;
        const close = () => setMenuOpenId(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [menuOpenId]);

    const handleStatusChange = async (task, newStatus) => {
        try {
            const oldStatus = task.status;
            const updated = await updateTask(task.id, { status: newStatus });
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            showToast(`Task marked as ${STATUS_LABELS[newStatus]}`);
            undoState.pushAction(`Changed "${task.title}" to ${STATUS_LABELS[newStatus]}`,
                async () => { await updateTask(task.id, { status: oldStatus }); fetchTasks(); },
                async () => { await updateTask(task.id, { status: newStatus }); fetchTasks(); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDelete = async (task) => {
        try {
            const oldStatus = task.status;
            await deleteTask(task.id);
            setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'cancelled' } : t)));
            showToast('Task cancelled');
            undoState.pushAction(`Cancelled "${task.title}"`,
                async () => { await updateTask(task.id, { status: oldStatus }); fetchTasks(); },
                async () => { await deleteTask(task.id); fetchTasks(); }
            );
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
            <GlobalToolbar
                title="Tasks"
                subtitle="Manage tasks and workflow automation"
                icon={Icons.checkSquare}
                activityEntity="Task"
                undoState={undoState}
                overflowItems={isAdmin ? [
                    { label: showSettings ? 'Hide Settings' : 'Settings', icon: Icons.settings, action: () => setShowSettings(!showSettings) },
                ] : []}
            />
            <ContextBar>
                <ContextBar.Right>
                    {isAdmin && (
                        <button className="btn btn--primary" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
                            {Icons.plus} New Task
                        </button>
                    )}
                </ContextBar.Right>
            </ContextBar>

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
                    {isAdmin && (
                        <div className="ts-filter-bar__field">
                            <label>Assigned To</label>
                            <select value={filters.assignedToUserId} onChange={(e) => setFilters((f) => ({ ...f, assignedToUserId: e.target.value }))}>
                                <option value="">All Assignees</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="ts-filter-bar__actions">
                        <button className="btn btn--outline btn--sm" onClick={() => setFilters({ status: 'open', urgency: 'all', assignedToUserId: '' })}>Reset</button>
                    </div>
                </div>

                {isAdmin && selectedIds.length > 0 && (
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
                        <div className="empty-state__desc">{isAdmin ? 'Click "New Task" to create a task, or adjust your filters.' : 'No tasks are assigned to you right now.'}</div>
                    </div>
                ) : (
                    <>
                        <div className="sheet-card">
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            {isAdmin && (
                                                <th scope="col" style={{ width: 36 }}>
                                                    <input type="checkbox" checked={selectedIds.length === tasks.length && tasks.length > 0} onChange={toggleSelectAll} />
                                                </th>
                                            )}
                                            <th scope="col">Title</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">Urgency</th>
                                            <th scope="col">Assigned To</th>
                                            <th scope="col">Due Date</th>
                                            <th scope="col" style={{ width: 60 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((task) => (
                                            <tr key={task.id} className={isOverdue(task) ? 'row--critical' : ''}>
                                                {isAdmin && (
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelect(task.id)} />
                                                    </td>
                                                )}
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
                                                    <div className="cl-row-menu" style={{ position: 'relative' }}>
                                                        <button
                                                            className="btn btn--ghost btn--icon"
                                                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === task.id ? null : task.id); }}
                                                            title="Actions"
                                                        >
                                                            {Icons.moreVertical}
                                                        </button>
                                                        {menuOpenId === task.id && (
                                                            <div className="cl-row-menu__dropdown">
                                                                {isAdmin && (
                                                                    <button className="cl-row-menu__item" onClick={() => { setEditingTask(task); setModalOpen(true); setMenuOpenId(null); }}>
                                                                        {Icons.edit} Edit
                                                                    </button>
                                                                )}
                                                                {task.status === 'open' && (
                                                                    <button className="cl-row-menu__item" onClick={() => { handleStatusChange(task, 'in_progress'); setMenuOpenId(null); }}>
                                                                        {Icons.chevronRight} Start
                                                                    </button>
                                                                )}
                                                                {(task.status === 'open' || task.status === 'in_progress') && (
                                                                    <button className="cl-row-menu__item" onClick={() => { handleStatusChange(task, 'completed'); setMenuOpenId(null); }}>
                                                                        {Icons.checkCircle} Complete
                                                                    </button>
                                                                )}
                                                                {isAdmin && (task.status === 'open' || task.status === 'in_progress') && (
                                                                    <button className="cl-row-menu__item cl-row-menu__item--danger" onClick={() => { handleDelete(task); setMenuOpenId(null); }}>
                                                                        {Icons.x} Cancel
                                                                    </button>
                                                                )}
                                                                {!isAdmin && (
                                                                    <button className="cl-row-menu__item" onClick={() => { setEditingTask(task); setModalOpen(true); setMenuOpenId(null); }}>
                                                                        {Icons.fileText} View / Notes
                                                                    </button>
                                                                )}
                                                            </div>
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
                    <div className="wf-triggers">
                        <div className="sheet-card">
                            <div className="sheet-card__header">
                                <h3 className="sheet-card__title">{Icons.settings} Workflow Triggers</h3>
                            </div>
                            <div className="wf-triggers__desc">
                                Configure automatic task creation rules. Tasks are generated hourly when conditions are met.
                            </div>
                            <div className="wf-triggers__list">
                                {triggers.map((trigger) => (
                                    <div key={trigger.id} className={`wf-trigger-card${!trigger.enabled ? ' wf-trigger-card--disabled' : ''}`}>
                                        <div className="wf-trigger-card__header">
                                            <div className="wf-trigger-card__info">
                                                <span className="wf-trigger-card__name">{trigger.name}</span>
                                                <span className="ts-badge ts-badge--submitted">{trigger.type.replace(/_/g, ' ')}</span>
                                            </div>
                                            <label className="wf-toggle">
                                                <input type="checkbox" checked={trigger.enabled} onChange={(e) => handleTriggerUpdate(trigger.id, 'enabled', e.target.checked)} />
                                                <span className="wf-toggle__track"><span className="wf-toggle__thumb" /></span>
                                                <span className="wf-toggle__label">{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
                                            </label>
                                        </div>
                                        <div className="wf-trigger-card__fields">
                                            <div className="form-group">
                                                <label>Threshold</label>
                                                <div className="wf-trigger-card__threshold">
                                                    <input type="number" value={trigger.thresholdDays} onChange={(e) => handleTriggerUpdate(trigger.id, 'thresholdDays', Number(e.target.value))} min="1" />
                                                    <span>days before</span>
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>Urgency</label>
                                                <select value={trigger.urgency} onChange={(e) => handleTriggerUpdate(trigger.id, 'urgency', e.target.value)}>
                                                    <option value="low">Low</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="high">High</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Assign To</label>
                                                <select value={trigger.assignToUserId || ''} onChange={(e) => handleTriggerUpdate(trigger.id, 'assignToUserId', e.target.value ? Number(e.target.value) : null)}>
                                                    <option value="">Role: {trigger.assignToRole || 'None'}</option>
                                                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                    readOnly={!isAdmin}
                />
            )}
        </>
    );
}
