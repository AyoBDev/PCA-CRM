import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { useToast } from '../hooks/useToast';
import { ACTION_COLORS, PAGE_SIZE } from '../utils/constants';

const ALL_ACTIONS = Object.keys(ACTION_COLORS);

const ENTITY_TYPES = [
    'Client', 'Employee', 'User', 'Shift', 'Timesheet',
    'Authorization', 'PayrollRun', 'PermanentLink', 'InsuranceType', 'Service', 'Task', 'Receipt', 'AdminFile',
];

export default function HistoryPage() {
    const { showToast } = useToast();
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('');
    const [entityFilter, setEntityFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const limit = PAGE_SIZE;

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit };
            if (actionFilter) params.action = actionFilter;
            if (entityFilter) params.entityType = entityFilter;
            if (dateFrom) params.dateFrom = dateFrom;
            if (dateTo) params.dateTo = dateTo;
            const result = await api.getAuditLogs(params);
            setLogs(result.logs);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        } catch (err) {
            showToast(err.message, 'error');
        }
        setLoading(false);
    }, [page, actionFilter, entityFilter, dateFrom, dateTo, showToast]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    useEffect(() => { setPage(1); }, [actionFilter, entityFilter, dateFrom, dateTo]);

    const formatDateTime = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        });
    };

    const getActionBadge = (action) => {
        const color = ACTION_COLORS[action] || { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', label: action };
        return (
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: color.bg, color: color.text }}>
                {color.label}
            </span>
        );
    };

    const getDetails = (log) => {
        const changes = JSON.parse(log.changes || '[]');
        if (changes.length === 0) return log.entityName || '—';
        if (changes.length === 1) {
            const c = changes[0];
            return `${log.entityName ? log.entityName + ' — ' : ''}${c.field}: "${c.oldValue || '—'}" → "${c.newValue || '—'}"`;
        }
        return `${log.entityName ? log.entityName + ' — ' : ''}${changes.length} field(s) changed`;
    };

    const startEntry = (page - 1) * limit + 1;
    const endEntry = Math.min(page * limit, total);

    return (
        <>
            <GlobalToolbar
                title="History / Activity Log"
                subtitle="Track all changes across the system"
                icon={Icons.clock}
                hideUndo
                activityEntity={null}
            />
            <ContextBar>
                <ContextBar.Left>
                    <select
                        className="context-bar__select"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                    >
                        <option value="">All Actions</option>
                        {ALL_ACTIONS.map((a) => (
                            <option key={a} value={a}>{ACTION_COLORS[a]?.label || a}</option>
                        ))}
                    </select>
                    <select
                        className="context-bar__select"
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                    >
                        <option value="">All Sections</option>
                        {ENTITY_TYPES.map((e) => (
                            <option key={e} value={e}>{e}</option>
                        ))}
                    </select>
                    <input
                        type="date"
                        className="context-bar__input"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        title="From date"
                    />
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>to</span>
                    <input
                        type="date"
                        className="context-bar__input"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        title="To date"
                    />
                    {(actionFilter || entityFilter || dateFrom || dateTo) && (
                        <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => { setActionFilter(''); setEntityFilter(''); setDateFrom(''); setDateTo(''); }}
                        >
                            Clear Filters
                        </button>
                    )}
                </ContextBar.Left>
            </ContextBar>
            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : logs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.clock}</div>
                        <div className="empty-state__title">No activity found</div>
                        <div className="empty-state__desc">
                            {actionFilter || entityFilter || dateFrom || dateTo
                                ? 'Try adjusting your filters.'
                                : 'Activity will appear here as changes are made throughout the system.'}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="sheet-card">
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col" style={{ width: 170 }}>Date &amp; Time</th>
                                            <th scope="col" style={{ width: 140 }}>User</th>
                                            <th scope="col" style={{ width: 140 }}>Action</th>
                                            <th scope="col">Details</th>
                                            <th scope="col" style={{ width: 120 }}>Section</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id}>
                                                <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDateTime(log.createdAt)}</td>
                                                <td style={{ fontWeight: 500 }}>{log.userName}</td>
                                                <td>{getActionBadge(log.action)}</td>
                                                <td className="history-details-cell" title={getDetails(log)}>{getDetails(log)}</td>
                                                <td>
                                                    <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                                                        {log.entityType}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="history-pagination">
                            <span className="history-pagination__info">
                                Showing {startEntry} to {endEntry} of {total} entries
                            </span>
                            <div className="history-pagination__buttons">
                                <button
                                    className="btn btn--outline btn--sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage(page - 1)}
                                >
                                    Previous
                                </button>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 7) {
                                        pageNum = i + 1;
                                    } else if (page <= 4) {
                                        pageNum = i + 1;
                                    } else if (page >= totalPages - 3) {
                                        pageNum = totalPages - 6 + i;
                                    } else {
                                        pageNum = page - 3 + i;
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            className={`btn btn--sm ${pageNum === page ? 'btn--primary' : 'btn--outline'}`}
                                            onClick={() => setPage(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                <button
                                    className="btn btn--outline btn--sm"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
