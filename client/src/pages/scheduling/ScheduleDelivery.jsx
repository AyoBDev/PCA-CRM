import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

export default function ScheduleDelivery({ weekStart, shifts }) {
    const [expanded, setExpanded] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [sentIds, setSentIds] = useState(new Set());
    const [confirmEmp, setConfirmEmp] = useState(null);
    const [responses, setResponses] = useState([]);
    const { showToast } = useToast();

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = e => { if (e.key === 'Escape') setFullscreen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    useEffect(() => {
        if (!weekStart) return;
        api.getScheduleResponses(weekStart)
            .then(setResponses)
            .catch(() => {});
    }, [weekStart]);

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

    const responsesByEmp = useMemo(() => {
        const map = new Map();
        for (const r of responses) {
            if (!map.has(r.employeeId) || new Date(r.respondedAt) > new Date(map.get(r.employeeId).respondedAt)) {
                map.set(r.employeeId, r);
            }
        }
        return map;
    }, [responses]);

    const handleSendSchedule = async (emp) => {
        if (!emp.email && !emp.phone) {
            showToast('No email or phone on file for this employee', 'error');
            return;
        }
        setConfirmEmp(null);
        setSendingId(emp.id);
        try {
            const result = await api.sendScheduleNotifications({
                weekStart,
                employeeIds: [emp.id],
            });
            const r = result.results?.[0];
            if (r?.status === 'sent') {
                setSentIds(prev => new Set([...prev, emp.id]));
                showToast(`Schedule sent to ${emp.name} via ${r.method}`);
                setTimeout(() => setSentIds(prev => { const next = new Set(prev); next.delete(emp.id); return next; }), 3000);
            } else if (r?.status === 'skipped') {
                showToast(`Skipped: ${r.reason}`, 'error');
            } else if (r?.status === 'failed') {
                showToast(`Failed to send: ${r.reason}`, 'error');
            } else {
                showToast('No notification sent — check employee contact info', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Failed to send schedule', 'error');
        } finally {
            setSendingId(null);
        }
    };

    const getResponseBadge = (empId) => {
        const r = responsesByEmp.get(empId);
        if (!r) return null;
        const colors = {
            accepted: { bg: '#dcfce7', color: '#166534', label: 'Accepted' },
            rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
            changes_requested: { bg: '#fef3c7', color: '#92400e', label: 'Changes Requested' },
        };
        const c = colors[r.response] || { bg: '#f3f4f6', color: '#374151', label: r.response };
        return (
            <span title={r.responseNotes || ''} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
                {c.label}
            </span>
        );
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
                        <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '0 0 10px' }}>
                            Review and finalize schedules, then send to each employee. Employees can accept, reject, or request changes.
                        </p>
                        <div className="table-scroll">
                        <table className="data-table data-table--sheet">
                            <thead>
                                <tr>
                                    <th scope="col">Employee</th>
                                    <th scope="col">Email</th>
                                    <th scope="col">Shifts</th>
                                    <th scope="col">Response</th>
                                    <th scope="col" style={{ width: 160 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => {
                                    const hasContact = !!(emp.email || emp.phone);
                                    const isSending = sendingId === emp.id;
                                    const isSent = sentIds.has(emp.id);
                                    const empResponse = responsesByEmp.get(emp.id);
                                    return (
                                        <tr key={emp.id}>
                                            <td style={{ fontWeight: 500 }}>{emp.name}</td>
                                            <td>
                                                {emp.email ? (
                                                    <span style={{ fontSize: 12 }}>{emp.email}</span>
                                                ) : (
                                                    <span style={{ fontSize: 12, color: 'hsl(var(--destructive))', fontStyle: 'italic' }}>No email</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}>
                                                    {emp.shiftCount}
                                                </span>
                                            </td>
                                            <td>
                                                {getResponseBadge(emp.id) || <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                                                {empResponse?.responseNotes && (
                                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={empResponse.responseNotes}>
                                                        Note: {empResponse.responseNotes}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <button
                                                    className={`btn btn--sm ${isSent ? 'btn--outline' : 'btn--primary'}`}
                                                    style={{ fontSize: 11, padding: '3px 8px', gap: 4 }}
                                                    onClick={() => setConfirmEmp(emp)}
                                                    disabled={!hasContact || isSending}
                                                    title={!hasContact ? 'Add email or phone to this employee first' : 'Send schedule notification'}
                                                >
                                                    {isSending ? (
                                                        <>Sending...</>
                                                    ) : isSent ? (
                                                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="hsl(142 71% 45%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent!</>
                                                    ) : (
                                                        <>{Icons.share} Send Schedule</>
                                                    )}
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

            {confirmEmp && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Confirm Send Schedule</h3>
                        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
                            This will send the schedule notification to <strong>{confirmEmp.name}</strong> via {confirmEmp.email ? 'email' : 'SMS'}.
                            They will be able to view their schedule, accept, reject, or request changes.
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn--outline btn--sm" onClick={() => setConfirmEmp(null)}>Cancel</button>
                            <button className="btn btn--primary btn--sm" onClick={() => handleSendSchedule(confirmEmp)}>
                                Confirm & Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
