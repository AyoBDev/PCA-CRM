import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

export default function ScheduleDelivery({ weekStart, shifts }) {
    const [expanded, setExpanded] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [bulkSending, setBulkSending] = useState(false);
    const [sentIds, setSentIds] = useState(new Set());
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkMessage, setBulkMessage] = useState('');
    const [notifStatus, setNotifStatus] = useState([]);
    const [scheduleLinks, setScheduleLinks] = useState([]);
    const [empSearch, setEmpSearch] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = e => { if (e.key === 'Escape') setFullscreen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const loadStatus = useCallback(async () => {
        if (!weekStart) return;
        try {
            const data = await api.getNotificationStatus(weekStart);
            setNotifStatus(data);
        } catch {}
    }, [weekStart]);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    useEffect(() => {
        api.getEmployeeScheduleLinks().then(setScheduleLinks).catch(() => {});
    }, []);

    const employees = useMemo(() => {
        const map = new Map();
        const activeShifts = (shifts || []).filter(s => s.status !== 'cancelled');
        for (const s of activeShifts) {
            if (!s.employeeId || !s.employee) continue;
            if (!map.has(s.employeeId)) {
                map.set(s.employeeId, {
                    id: s.employeeId,
                    name: s.employee.name || '',
                    email: s.employee.email || '',
                    phone: s.employee.phone || '',
                    shiftCount: 0,
                });
            }
            map.get(s.employeeId).shiftCount++;
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [shifts]);

    const statusByEmp = useMemo(() => {
        const map = new Map();
        for (const n of notifStatus) {
            const empId = n.employee?.id || n.employeeId;
            if (!map.has(empId)) {
                map.set(empId, n);
            }
        }
        return map;
    }, [notifStatus]);

    const filteredEmployees = useMemo(() => {
        if (!empSearch.trim()) return employees;
        const q = empSearch.trim().toLowerCase();
        return employees.filter(e =>
            e.name.toLowerCase().includes(q) ||
            (e.email || '').toLowerCase().includes(q)
        );
    }, [employees, empSearch]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const withContact = filteredEmployees.filter(e => e.email);
        if (selectedIds.size === withContact.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(withContact.map(e => e.id)));
        }
    };

    const handleBulkSend = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        setBulkSending(true);
        try {
            const result = await api.sendScheduleNotifications({
                weekStart,
                employeeIds: ids,
                message: bulkMessage,
            });
            const sentCount = result.results?.filter(r => r.status === 'sent').length || 0;
            showToast(`Schedule sent to ${sentCount} employee${sentCount !== 1 ? 's' : ''}`);
            setSelectedIds(new Set());
            setShowBulkModal(false);
            setBulkMessage('');
            loadStatus();
        } catch (err) {
            showToast(err.message || 'Failed to send schedules', 'error');
        } finally {
            setBulkSending(false);
        }
    };

    const handleSendAll = () => {
        const withContact = filteredEmployees.filter(e => e.email);
        setSelectedIds(new Set(withContact.map(e => e.id)));
        setShowBulkModal(true);
    };

    return (
        <div className={`sched-card ${!expanded ? 'sched-card--collapsed' : ''} ${fullscreen ? 'sched-card--fullscreen' : ''}`} style={{ marginTop: fullscreen ? 0 : 16 }}>
            <div className="sched-card__header" onClick={!fullscreen ? () => setExpanded(e => !e) : undefined} style={!fullscreen ? { cursor: 'pointer' } : undefined}>
                <div className="sched-card__header-left">
                    {!fullscreen && (
                        <span className={`sched-card__chevron ${expanded ? 'sched-card__chevron--open' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </span>
                    )}
                    <div className="sched-card__header-title">Send Schedule</div>
                </div>
                <div className="sched-card__header-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        className="sched-card__expand-btn"
                        title={fullscreen ? 'Exit fullscreen' : 'Expand'}
                        onClick={() => { setFullscreen(f => !f); if (!expanded) setExpanded(true); }}
                    >
                        {fullscreen ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        )}
                    </button>
                </div>
            </div>
            {(expanded || fullscreen) && <div className="sched-card__body">
                {employees.length === 0 ? (
                    <p style={{ color: 'hsl(var(--muted-foreground))' }}>No shifts scheduled for this week.</p>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                            <button className="btn btn--outline btn--sm" style={{ fontSize: 11 }} onClick={toggleSelectAll}>
                                {selectedIds.size > 0 ? 'Deselect All' : 'Select All'}
                            </button>
                            <button className="btn btn--primary btn--sm" style={{ fontSize: 11 }} disabled={selectedIds.size === 0} onClick={() => setShowBulkModal(true)}>
                                Send Selected ({selectedIds.size})
                            </button>
                            <button className="btn btn--outline btn--sm" style={{ fontSize: 11 }} onClick={handleSendAll}>
                                Send All
                            </button>
                            <div style={{ flex: 1 }} />
                            <input
                                type="text"
                                className="context-bar__search"
                                placeholder="Search employee..."
                                value={empSearch}
                                onChange={e => setEmpSearch(e.target.value)}
                                style={{ width: 200, margin: 0 }}
                            />
                        </div>
                        <div className="table-scroll">
                        <table className="data-table data-table--sheet data-table--dark-header">
                            <thead>
                                <tr>
                                    <th scope="col" style={{ width: 36 }}>
                                        <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === filteredEmployees.filter(e => e.email).length} onChange={toggleSelectAll} />
                                    </th>
                                    <th scope="col">Employee</th>
                                    <th scope="col">Contact</th>
                                    <th scope="col">Shifts</th>
                                    <th scope="col">Sent</th>
                                    <th scope="col">Opened</th>
                                    <th scope="col">Response</th>
                                    <th scope="col" style={{ width: 100 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map(emp => {
                                    const hasContact = !!emp.email;
                                    const isSending = sendingId === emp.id;
                                    const isSent = sentIds.has(emp.id);
                                    const status = statusByEmp.get(emp.id);
                                    return (
                                        <tr key={emp.id}>
                                            <td><input type="checkbox" checked={selectedIds.has(emp.id)} onChange={() => toggleSelect(emp.id)} disabled={!hasContact} /></td>
                                            <td style={{ fontWeight: 500 }}>{emp.name}</td>
                                            <td>
                                                {emp.email ? (
                                                    <span style={{ fontSize: 12 }} title={emp.email}>{emp.email.length > 20 ? emp.email.slice(0, 20) + '...' : emp.email}</span>
                                                ) : (
                                                    <span style={{ fontSize: 12, color: 'hsl(var(--destructive))', fontStyle: 'italic' }}>No email</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}>
                                                    {emp.shiftCount}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                {status?.sentAt ? new Date(status.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                {status?.openedAt ? new Date(status.openedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td>
                                                {status?.response ? (() => {
                                                    const colors = { accepted: { bg: '#dcfce7', color: '#166534', label: 'Accepted' }, rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' }, changes_requested: { bg: '#fef3c7', color: '#92400e', label: 'Changes Req.' } };
                                                    const c = colors[status.response] || { bg: '#f3f4f6', color: '#374151', label: status.response };
                                                    return <span title={status.respondedAt ? new Date(status.respondedAt).toLocaleString() : ''} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
                                                })() : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn--outline btn--sm"
                                                    style={{ fontSize: 11, padding: '3px 8px' }}
                                                    onClick={() => { setSelectedIds(new Set([emp.id])); setShowBulkModal(true); }}
                                                    disabled={!hasContact || isSending}
                                                >
                                                    {isSending ? 'Sending...' : isSent ? 'Sent!' : status?.sentAt ? 'Resend' : 'Send'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                    </>
                )}
            </div>}
            {fullscreen && <div className="sched-card__backdrop" onClick={() => setFullscreen(false)} />}

            {showBulkModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Send Schedule to {selectedIds.size} employee{selectedIds.size !== 1 ? 's' : ''}</h3>
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                            Week of {weekStart}
                        </p>
                        {selectedIds.size === 1 && (() => {
                            const empId = [...selectedIds][0];
                            const link = scheduleLinks.find(l => l.employeeId === empId);
                            if (!link) return null;
                            const url = `${window.location.origin}/schedule/view/${link.token}`;
                            return (
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Schedule Link:</label>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <input readOnly value={url} style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid #e4e4e7', background: '#f9fafb', color: '#374151' }} />
                                        <button className="btn btn--outline btn--sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => { navigator.clipboard.writeText(url); showToast('Link copied'); }}>
                                            Copy Link
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Message (optional):</label>
                        <textarea
                            value={bulkMessage}
                            onChange={e => setBulkMessage(e.target.value)}
                            placeholder="e.g. Please review your weekend shifts carefully."
                            style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 13, marginBottom: 12, resize: 'vertical' }}
                        />
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, maxHeight: 120, overflowY: 'auto' }}>
                            <strong>Recipients:</strong>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                                {employees.filter(e => selectedIds.has(e.id)).map(e => (
                                    <li key={e.id}>{e.name} ({e.email || 'No email'})</li>
                                ))}
                            </ul>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn--outline btn--sm" onClick={() => { setShowBulkModal(false); setBulkMessage(''); }} disabled={bulkSending}>Cancel</button>
                            <button className="btn btn--primary btn--sm" onClick={handleBulkSend} disabled={bulkSending}>
                                {bulkSending ? 'Sending...' : 'Send Schedules'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
