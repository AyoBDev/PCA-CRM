import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Distinct colors for visually distinguishing multiple clients
const CLIENT_COLORS = [
    { color: '#3B82F6', bg: '#EFF6FF', border: '#93C5FD' },   // Blue
    { color: '#8B5CF6', bg: '#F5F3FF', border: '#C4B5FD' },   // Purple
    { color: '#06B6D4', bg: '#ECFEFF', border: '#67E8F9' },   // Cyan
    { color: '#F59E0B', bg: '#FFFBEB', border: '#FCD34D' },   // Amber
    { color: '#EC4899', bg: '#FDF2F8', border: '#F9A8D4' },   // Pink
    { color: '#22C55E', bg: '#F0FDF4', border: '#86EFAC' },   // Green
    { color: '#EF4444', bg: '#FEF2F2', border: '#FCA5A5' },   // Red
    { color: '#6366F1', bg: '#EEF2FF', border: '#A5B4FC' },   // Indigo
];

function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function computeShiftHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMin = sh * 60 + sm, endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return Math.round(((endMin - startMin) / 60) * 100) / 100;
}

function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSunday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - dt.getDay());
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtShort(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
}

function dayName(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export default function ScheduleViewPage() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [weekStart, setWeekStart] = useState(() => getSunday(localToday()));

    useEffect(() => {
        setLoading(true);
        setError(null);
        api.getScheduleView(token, weekStart)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token, weekStart]);

    // Use the server's weekStart to ensure dates align with shift dates
    const effectiveWeekStart = data?.weekStart || weekStart;
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const date = addDays(effectiveWeekStart, i);
            const dn = dayName(date);
            return { date, dayName: dn, label: `${dn} ${fmtShort(date)}` };
        });
    }, [effectiveWeekStart]);

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

    // Assign a distinct color to each unique client
    const clientColorMap = useMemo(() => {
        if (!data) return {};
        const uniqueClients = [...new Set(data.shifts.map(s => s.client?.clientName).filter(Boolean))].sort();
        const map = {};
        uniqueClients.forEach((name, i) => {
            map[name] = CLIENT_COLORS[i % CLIENT_COLORS.length];
        });
        return map;
    }, [data]);
    const hasMultipleClients = Object.keys(clientColorMap).length > 1;

    // Compute daily and weekly total hours
    const hoursSummary = useMemo(() => {
        if (!data || data.shifts.length === 0) return null;
        const dailyMap = {};
        let weeklyTotal = 0;
        for (const s of data.shifts) {
            const d = s.shiftDate.split('T')[0];
            const hrs = computeShiftHours(s.startTime, s.endTime);
            dailyMap[d] = (dailyMap[d] || 0) + hrs;
            weeklyTotal += hrs;
        }
        return { daily: dailyMap, weekly: Math.round(weeklyTotal * 100) / 100 };
    }, [data]);

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));
    const handleThisWeek = () => setWeekStart(getSunday(localToday()));

    if (error) {
        return (
            <div className="signing-page">
                <div className="signing-card" style={{ maxWidth: 500, textAlign: 'center' }}>
                    <svg style={{ width: 48, height: 48, color: 'hsl(var(--destructive))', marginBottom: 12 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    <h2 style={{ margin: '0 0 8px' }}>Schedule Unavailable</h2>
                    <p style={{ color: 'hsl(var(--muted-foreground))' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="signing-page">
            <div className="signing-card schedule-view-card">
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>
                        {data ? `${data.employee.name}'s Schedule` : 'Loading...'}
                    </h2>
                    <p style={{ color: 'hsl(var(--muted-foreground))', margin: 0, fontSize: 13 }}>
                        PCAlink
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
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading schedule...</div>
                ) : (
                    <>
                        {data.shifts.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                                No shifts scheduled for this week.
                            </div>
                        ) : (
                            <>
                            {/* Hours summary */}
                            {hoursSummary && (
                                <div className="schedule-view-hours">
                                    <div className="schedule-view-hours__weekly">
                                        <span className="schedule-view-hours__weekly-label">Weekly Total</span>
                                        <span className="schedule-view-hours__weekly-value">{hoursSummary.weekly} hrs</span>
                                    </div>
                                    <div className="schedule-view-hours__daily">
                                        {weekDays.map(({ date, dayName: dn }) => {
                                            const dayHrs = Math.round((hoursSummary.daily[date] || 0) * 100) / 100;
                                            return (
                                                <div key={date} className={`schedule-view-hours__day ${dayHrs > 0 ? 'schedule-view-hours__day--active' : ''}`}>
                                                    <span className="schedule-view-hours__day-name">{dn.slice(0, 3)}</span>
                                                    <span className="schedule-view-hours__day-hrs">{dayHrs > 0 ? `${dayHrs}h` : '—'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <table className="schedule-view-table">
                                <thead>
                                    <tr>
                                        <th>Day</th>
                                        <th>Time</th>
                                        <th>Client</th>
                                        <th>Service</th>
                                        <th>Account</th>
                                        <th>Sandata Client ID</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weekDays.filter(({ date }) => (shiftsByDate[date] || []).length > 0).map(({ date, dayName: dn }) => {
                                        const dayShifts = shiftsByDate[date];
                                        return dayShifts.map((shift, idx) => {
                                            const cc = hasMultipleClients && shift.client?.clientName ? clientColorMap[shift.client.clientName] : null;
                                            return (
                                            <tr key={shift.id} style={cc ? { borderLeft: `3px solid ${cc.color}`, background: cc.bg } : undefined}>
                                                {idx === 0 && (
                                                    <td rowSpan={dayShifts.length} className="schedule-view-table__day">
                                                        <span className="schedule-view-table__day-name">{dn}</span>
                                                        <span className="schedule-view-table__day-date">{fmtShort(date)}</span>
                                                    </td>
                                                )}
                                                <td className="schedule-view-table__time" data-label="Time">{hhmm12(shift.startTime)} - {hhmm12(shift.endTime)}</td>
                                                <td className="schedule-view-table__client" data-label="Client">
                                                    {cc && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cc.color, marginRight: 6, verticalAlign: 'middle' }} />}
                                                    {shift.client?.clientName || '—'}
                                                </td>
                                                <td data-label="Service">
                                                    <span className="schedule-view-table__service-badge">
                                                        {shift.serviceLabel || shift.serviceCode}
                                                    </span>
                                                </td>
                                                <td data-label="Account">{shift.accountNumber || '—'}</td>
                                                <td data-label="Sandata ID">{shift.sandataClientId || '—'}</td>
                                                <td className="schedule-view-table__details" data-label="Details">
                                                    {shift.client?.address && <div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.client.address)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>{shift.client.address}</a></div>}
                                                    <div className="schedule-view-table__meta">
                                                        {shift.client?.phone && <span>{shift.client.phone}</span>}
                                                        {shift.client?.gateCode && <span>Gate: {shift.client.gateCode}</span>}
                                                    </div>
                                                    {(shift.notes || shift.client?.notes) && (
                                                        <div className="schedule-view-table__notes">{shift.notes || shift.client?.notes}</div>
                                                    )}
                                                </td>
                                            </tr>
                                        );});
                                    })}
                                </tbody>
                            </table>
                            </>
                        )}

                        {/* Client color legend */}
                        {hasMultipleClients && data.shifts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '12px 0', borderTop: '1px solid hsl(var(--border))', marginTop: 8 }}>
                                {Object.entries(clientColorMap).map(([name, cc]) => (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cc.color, flexShrink: 0 }} />
                                        <span style={{ color: 'hsl(var(--foreground))' }}>{name}</span>
                                    </div>
                                ))}
                            </div>
                        )}

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
