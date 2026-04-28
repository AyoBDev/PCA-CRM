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
                                        return dayShifts.map((shift, idx) => (
                                            <tr key={shift.id}>
                                                {idx === 0 && (
                                                    <td rowSpan={dayShifts.length} className="schedule-view-table__day">
                                                        <span className="schedule-view-table__day-name">{dn}</span>
                                                        <span className="schedule-view-table__day-date">{fmtShort(date)}</span>
                                                    </td>
                                                )}
                                                <td className="schedule-view-table__time" data-label="Time">{hhmm12(shift.startTime)} - {hhmm12(shift.endTime)}</td>
                                                <td className="schedule-view-table__client" data-label="Client">{shift.client?.clientName || '—'}</td>
                                                <td data-label="Service">
                                                    <span className="schedule-view-table__service-badge">
                                                        {shift.serviceLabel || shift.serviceCode}
                                                    </span>
                                                </td>
                                                <td data-label="Account">{shift.accountNumber || '—'}</td>
                                                <td data-label="Sandata ID">{shift.sandataClientId || '—'}</td>
                                                <td className="schedule-view-table__details" data-label="Details">
                                                    {shift.client?.address && <div>{shift.client.address}</div>}
                                                    <div className="schedule-view-table__meta">
                                                        {shift.client?.phone && <span>{shift.client.phone}</span>}
                                                        {shift.client?.gateCode && <span>Gate: {shift.client.gateCode}</span>}
                                                    </div>
                                                    {(shift.notes || shift.client?.notes) && (
                                                        <div className="schedule-view-table__notes">{shift.notes || shift.client?.notes}</div>
                                                    )}
                                                </td>
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
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
