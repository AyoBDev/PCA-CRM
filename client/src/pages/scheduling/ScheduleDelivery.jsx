import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

export default function ScheduleDelivery({ weekStart, shifts }) {
    const [expanded, setExpanded] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [sentIds, setSentIds] = useState(new Set());
    const { showToast } = useToast();

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = e => { if (e.key === 'Escape') setFullscreen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    // Get unique employees from shifts (include email from shift.employee)
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

    const handleSendSchedule = async (emp) => {
        if (!emp.email && !emp.phone) {
            showToast('No email or phone on file for this employee', 'error');
            return;
        }
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
                            Send the weekly schedule link to each PCA via email or SMS. They can refresh the link anytime to see updates.
                        </p>
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Email</th>
                                    <th>Shifts This Week</th>
                                    <th style={{ width: 150 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => {
                                    const hasContact = !!(emp.email || emp.phone);
                                    const isSending = sendingId === emp.id;
                                    const isSent = sentIds.has(emp.id);
                                    return (
                                        <tr key={emp.id}>
                                            <td style={{ fontWeight: 500 }}>{emp.name}</td>
                                            <td>
                                                {emp.email ? (
                                                    <span style={{ fontSize: 12 }}>{emp.email}</span>
                                                ) : (
                                                    <span style={{ fontSize: 12, color: 'hsl(var(--destructive))', fontStyle: 'italic' }}>No email on file</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block', padding: '1px 8px', borderRadius: 10,
                                                    fontSize: 12, fontWeight: 600,
                                                    background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))',
                                                }}>
                                                    {emp.shiftCount}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className={`btn btn--sm ${isSent ? 'btn--outline' : 'btn--primary'}`}
                                                    style={{ fontSize: 11, padding: '3px 8px', gap: 4 }}
                                                    onClick={() => handleSendSchedule(emp)}
                                                    disabled={!hasContact || isSending}
                                                    title={!hasContact ? 'Add email or phone to this employee first' : 'Send schedule link via email/SMS'}
                                                >
                                                    {isSending ? (
                                                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Sending...</>
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
                    </>
                )}
            </div>}
            {fullscreen && <div className="sched-card__backdrop" onClick={() => setFullscreen(false)} />}
        </div>
    );
}
