import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function getSunday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function fmtShort(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export default function ScheduleViewPage() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [weekStart, setWeekStart] = useState(() => getSunday(new Date().toISOString().split('T')[0]));

    useEffect(() => {
        setLoading(true);
        setError(null);
        api.getScheduleView(token, weekStart)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token, weekStart]);

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i);
            return { date, dayName: DAY_NAMES[i], label: `${DAY_NAMES[i]} ${fmtShort(date)}` };
        });
    }, [weekStart]);

    // Group shifts by date
    const shiftsByDate = useMemo(() => {
        if (!data) return {};
        const map = {};
        for (const s of data.shifts) {
            const d = s.shiftDate.split('T')[0];
            if (!map[d]) map[d] = [];
            map[d].push(s);
        }
        return map;
    }, [data]);

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));
    const handleThisWeek = () => setWeekStart(getSunday(new Date().toISOString().split('T')[0]));

    if (error) {
        return (
            <div className="signing-page">
                <div className="signing-card" style={{ maxWidth: 500, textAlign: 'center' }}>
                    <svg style={{ width: 48, height: 48, color: 'hsl(0 84% 60%)', marginBottom: 12 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    <h2 style={{ margin: '0 0 8px' }}>Schedule Unavailable</h2>
                    <p style={{ color: '#71717a' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="signing-page">
            <div className="signing-card" style={{ maxWidth: 900, width: '95%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>
                        {data ? `${data.employee.name}'s Schedule` : 'Loading...'}
                    </h2>
                    <p style={{ color: '#71717a', margin: 0, fontSize: 13 }}>
                        NV Best PCA Services
                    </p>
                </div>

                {/* Week navigation */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
                    <button className="btn btn--outline btn--sm" onClick={handlePrevWeek}>&larr; Prev</button>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                        Week of {fmtShort(weekStart)} &ndash; {fmtShort(addDays(weekStart, 6))}
                    </span>
                    <button className="btn btn--outline btn--sm" onClick={handleNextWeek}>Next &rarr;</button>
                    <button className="btn btn--outline btn--sm" onClick={handleThisWeek} style={{ fontSize: 11 }}>Today</button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#71717a' }}>Loading schedule...</div>
                ) : (
                    <>
                        {/* Schedule table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th>Day</th>
                                        <th>Time</th>
                                        <th>Client</th>
                                        <th>SANDATA ID</th>
                                        <th>Service</th>
                                        <th>Account #</th>
                                        <th>Address</th>
                                        <th>Phone</th>
                                        <th>Gate Code</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weekDays.map(({ date, dayName }) => {
                                        const dayShifts = shiftsByDate[date] || [];
                                        if (dayShifts.length === 0) {
                                            return (
                                                <tr key={date} style={{ background: 'hsl(var(--muted) / 0.3)' }}>
                                                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{dayName} {fmtShort(date)}</td>
                                                    <td colSpan={9} style={{ color: '#a1a1aa', fontStyle: 'italic' }}>No shift</td>
                                                </tr>
                                            );
                                        }
                                        return dayShifts.map((shift, idx) => (
                                            <tr key={shift.id}>
                                                {idx === 0 && (
                                                    <td rowSpan={dayShifts.length} style={{ fontWeight: 500, whiteSpace: 'nowrap', verticalAlign: 'top', borderRight: '1px solid hsl(var(--border))' }}>
                                                        {dayName}<br /><span style={{ fontSize: 11, color: '#71717a' }}>{fmtShort(date)}</span>
                                                    </td>
                                                )}
                                                <td style={{ whiteSpace: 'nowrap' }}>{hhmm12(shift.startTime)} - {hhmm12(shift.endTime)}</td>
                                                <td style={{ fontWeight: 500 }}>{shift.client?.clientName || '—'}</td>
                                                <td style={{ fontSize: 12, color: '#71717a' }}>{shift.sandataClientId || '—'}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                                                        fontSize: 11, fontWeight: 600,
                                                        background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))',
                                                    }}>
                                                        {shift.serviceLabel || shift.serviceCode}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12 }}>{shift.accountNumber || '—'}</td>
                                                <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shift.client?.address || '—'}</td>
                                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{shift.client?.phone || '—'}</td>
                                                <td style={{ fontSize: 12 }}>{shift.client?.gateCode || '—'}</td>
                                                <td style={{ fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shift.notes || shift.client?.notes || '—'}</td>
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: '#a1a1aa' }}>
                            Last refreshed: {new Date().toLocaleString()}
                            <br />Refresh this page anytime to see schedule updates.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
