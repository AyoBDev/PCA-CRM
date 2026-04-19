import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

function toDateStr(d) {
    if (typeof d === 'string') {
        const idx = d.indexOf('T');
        if (idx === 10) return d.slice(0, 10);
    }
    return new Date(d).toISOString().slice(0, 10);
}

export default function ScheduleDelivery({ weekStart, shifts }) {
    const [expanded, setExpanded] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [links, setLinks] = useState([]);
    const [loadingLinks, setLoadingLinks] = useState(true);
    const [copiedId, setCopiedId] = useState(null);
    const [generatingId, setGeneratingId] = useState(null);
    const { showToast } = useToast();

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = e => { if (e.key === 'Escape') setFullscreen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const fetchLinks = useCallback(async () => {
        try {
            const data = await api.getEmployeeScheduleLinks();
            setLinks(data);
        } catch { /* silent */ }
        finally { setLoadingLinks(false); }
    }, []);

    useEffect(() => { fetchLinks(); }, [fetchLinks]);

    // Build a map of employeeId → link
    const linkMap = useMemo(() => {
        const map = {};
        for (const l of links) {
            if (l.active) map[l.employeeId] = l;
        }
        return map;
    }, [links]);

    // Get unique employees from shifts
    const employees = useMemo(() => {
        const map = new Map();
        const activeShifts = (shifts || []).filter(s => s.status !== 'cancelled');
        for (const s of activeShifts) {
            if (!s.employeeId || !s.employee) continue;
            if (!map.has(s.employeeId)) {
                map.set(s.employeeId, {
                    id: s.employeeId,
                    name: s.employee.name || '',
                    shiftCount: 0,
                });
            }
            map.get(s.employeeId).shiftCount++;
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [shifts]);

    const handleGenerateLink = async (employeeId) => {
        setGeneratingId(employeeId);
        try {
            await api.createEmployeeScheduleLink(employeeId);
            await fetchLinks();
            showToast('Schedule link created');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setGeneratingId(null);
        }
    };

    const handleCopyLink = async (link) => {
        try {
            await navigator.clipboard.writeText(link.url);
            setCopiedId(link.id);
            showToast('Link copied to clipboard');
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            showToast('Failed to copy', 'error');
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
                    <p style={{ color: '#71717a' }}>No shifts scheduled for this week.</p>
                ) : loadingLinks ? (
                    <p style={{ color: '#71717a' }}>Loading...</p>
                ) : (
                    <>
                        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 10px' }}>
                            Generate a permanent schedule link for each PCA. They can refresh it anytime to see the latest updates.
                        </p>
                        <table className="data-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Shifts This Week</th>
                                    <th>Schedule Link</th>
                                    <th style={{ width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => {
                                    const link = linkMap[emp.id];
                                    return (
                                        <tr key={emp.id}>
                                            <td style={{ fontWeight: 500 }}>{emp.name}</td>
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
                                                {link ? (
                                                    <span style={{ fontSize: 11, color: '#71717a', wordBreak: 'break-all' }}>
                                                        {link.url}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>No link yet</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    {link ? (
                                                        <button
                                                            className="btn btn--primary btn--sm"
                                                            style={{ fontSize: 11, padding: '3px 8px', gap: 4 }}
                                                            onClick={() => handleCopyLink(link)}
                                                        >
                                                            {Icons.copy} {copiedId === link.id ? 'Copied!' : 'Copy Link'}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn btn--outline btn--sm"
                                                            style={{ fontSize: 11, padding: '3px 8px', gap: 4 }}
                                                            onClick={() => handleGenerateLink(emp.id)}
                                                            disabled={generatingId === emp.id}
                                                        >
                                                            {Icons.share} {generatingId === emp.id ? 'Creating...' : 'Generate Link'}
                                                        </button>
                                                    )}
                                                </div>
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
