import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from './Icons';

// Human-readable labels for actions
const ACTION_LABELS = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    ARCHIVE: 'Archived',
    RESTORE: 'Restored',
    SUBMIT: 'Submitted',
    EXPORT: 'Exported',
    LOGIN: 'Logged in',
    TOGGLE_ACTIVE: 'Toggled active',
    RESET_PASSWORD: 'Reset password',
    PERMANENT_DELETE: 'Permanently deleted',
    BULK_DELETE: 'Bulk deleted',
};

// Action colors
const ACTION_COLORS = {
    CREATE: '#16a34a',
    UPDATE: '#2563eb',
    DELETE: '#dc2626',
    ARCHIVE: '#f59e0b',
    RESTORE: '#16a34a',
    SUBMIT: '#7c3aed',
    PERMANENT_DELETE: '#dc2626',
    BULK_DELETE: '#dc2626',
    LOGIN: '#6b7280',
    TOGGLE_ACTIVE: '#f59e0b',
    RESET_PASSWORD: '#f59e0b',
};

function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChangesDetail({ changes }) {
    let parsed;
    try { parsed = typeof changes === 'string' ? JSON.parse(changes) : changes; } catch { return null; }
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return (
        <div className="activity-changes">
            {parsed.map((c, i) => (
                <div key={i} className="activity-change">
                    <span className="activity-change__field">{c.field}:</span>
                    <span className="activity-change__old">{c.oldValue || '(empty)'}</span>
                    <span className="activity-change__arrow">&rarr;</span>
                    <span className="activity-change__new">{c.newValue || '(empty)'}</span>
                </div>
            ))}
        </div>
    );
}

function ActivityItem({ log }) {
    const [expanded, setExpanded] = useState(false);
    const color = ACTION_COLORS[log.action] || '#6b7280';
    const label = ACTION_LABELS[log.action] || log.action;
    let parsed;
    try { parsed = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes; } catch { parsed = []; }
    const hasChanges = Array.isArray(parsed) && parsed.length > 0;

    return (
        <div className="activity-item" onClick={() => hasChanges && setExpanded(!expanded)} style={hasChanges ? { cursor: 'pointer' } : undefined}>
            <div className="activity-item__header">
                <span className="activity-item__badge" style={{ background: color + '18', color }}>
                    {label}
                </span>
                <span className="activity-item__time">{formatTime(log.createdAt)}</span>
            </div>
            <div className="activity-item__body">
                <span className="activity-item__user">{log.userName}</span>
                {log.entityName && (
                    <span className="activity-item__entity">{log.entityType}: {log.entityName}</span>
                )}
                {!log.entityName && log.entityType && (
                    <span className="activity-item__entity">{log.entityType}</span>
                )}
            </div>
            {expanded && hasChanges && <ChangesDetail changes={parsed} />}
            {hasChanges && !expanded && (
                <div className="activity-item__expand-hint">{parsed.length} field{parsed.length > 1 ? 's' : ''} changed</div>
            )}
        </div>
    );
}

function ActivityDrawerPanel({ entityType, entityId, onClose }) {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const fetchLogs = useCallback(async (p = 1) => {
        setLoading(true);
        try {
            if (entityId) {
                const result = await api.getEntityAuditLogs(entityType, entityId, { page: p, limit: 25 });
                setLogs(result.logs || []);
                setTotal(result.total || 0);
                setPage(result.page || 1);
            } else {
                const params = { page: p, limit: 25 };
                if (entityType) params.entityType = entityType;
                const result = await api.getAuditLogs(params);
                setLogs(result.logs || []);
                setTotal(result.total || 0);
                setPage(result.page || 1);
            }
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId]);

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const totalPages = Math.ceil(total / 25);
    const filterLabel = entityId ? `${entityType} #${entityId}` : (entityType || 'All');

    return (
        <div className="activity-drawer-backdrop" onClick={onClose}>
            <aside className="activity-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="activity-drawer__header">
                    <h3 className="activity-drawer__title">Activity Log</h3>
                    <span className="activity-drawer__filter">{filterLabel}</span>
                    <button className="activity-drawer__close" onClick={onClose} title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="activity-drawer__body">
                    {loading && logs.length === 0 && (
                        <div className="activity-drawer__loading">Loading...</div>
                    )}
                    {!loading && logs.length === 0 && (
                        <div className="activity-drawer__empty">No activity recorded yet</div>
                    )}
                    {logs.map((log) => (
                        <ActivityItem key={log.id} log={log} />
                    ))}
                </div>

                {totalPages > 1 && (
                    <div className="activity-drawer__pagination">
                        <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => fetchLogs(page - 1)}>Prev</button>
                        <span className="activity-drawer__page-info">{page} / {totalPages}</span>
                        <button className="btn btn--outline btn--sm" disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)}>Next</button>
                    </div>
                )}
            </aside>
        </div>
    );
}

/**
 * Page-level activity button — place inside content-header__actions.
 * Opens a drawer showing logs filtered by entityType.
 */
export function ActivityButton({ entityType }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button className="btn btn--outline btn--sm" onClick={() => setOpen(true)} title="Activity Log">
                {Icons.clock} Activity
            </button>
            {open && <ActivityDrawerPanel entityType={entityType} onClose={() => setOpen(false)} />}
        </>
    );
}

/**
 * Entity-level activity button — place inside entity drawers/detail views.
 * Opens a drawer showing logs for a specific entity.
 */
export function EntityActivityButton({ entityType, entityId }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button className="btn btn--outline btn--sm" onClick={() => setOpen(true)} title="View History">
                {Icons.clock} History
            </button>
            {open && <ActivityDrawerPanel entityType={entityType} entityId={entityId} onClose={() => setOpen(false)} />}
        </>
    );
}
