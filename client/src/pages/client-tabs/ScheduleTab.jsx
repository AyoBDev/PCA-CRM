import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { hhmm12 } from '../../utils/time';
import { SERVICE_COLORS, DAY_NAMES_SHORT } from '../../utils/constants';

const DAY_NAMES = DAY_NAMES_SHORT;

function getSunday(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart) {
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(weekStart + 'T00:00:00');
    end.setDate(end.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`;
}

export default function ScheduleTab({ navigate, clientId }) {
    const [weekStart, setWeekStart] = useState(() => getSunday(new Date()));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchSchedule = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.getClientSchedule(clientId, weekStart);
            setData(result);
        } catch (err) {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [clientId, weekStart]);

    useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

    const prevWeek = () => setWeekStart(addDays(weekStart, -7));
    const nextWeek = () => setWeekStart(addDays(weekStart, 7));
    const goToday = () => setWeekStart(getSunday(new Date()));

    const shiftsByDay = {};
    if (data?.shifts) {
        for (const shift of data.shifts) {
            const dateStr = shift.shiftDate.slice(0, 10);
            if (!shiftsByDay[dateStr]) shiftsByDay[dateStr] = [];
            shiftsByDay[dateStr].push(shift);
        }
    }

    const totalHours = data?.shifts?.reduce((sum, s) => sum + (s.hours || 0), 0) || 0;
    const totalUnits = data?.shifts?.reduce((sum, s) => sum + (s.units || 0), 0) || 0;

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Client Schedule</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn--outline btn--xs" onClick={goToday}>Today</button>
                        <button className="btn btn--outline btn--sm" onClick={() => navigate('/scheduling')}>
                            {Icons.calendar} Full Schedule
                        </button>
                    </div>
                </div>
                <div className="cp-card__body">
                    {/* Week Navigation */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <button className="btn btn--ghost btn--icon" onClick={prevWeek}>{Icons.chevronLeft}</button>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{formatWeekLabel(weekStart)}</span>
                        <button className="btn btn--ghost btn--icon" onClick={nextWeek}>{Icons.chevronRight}</button>
                    </div>

                    {loading ? (
                        <div className="cp-empty-state-card">
                            <p>Loading schedule...</p>
                        </div>
                    ) : !data || data.shifts.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.calendar}</div>
                            <p>No shifts scheduled this week.</p>
                        </div>
                    ) : (
                        <>
                            {/* Weekly Summary */}
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: 'hsl(var(--muted))', borderRadius: 8 }}>
                                <div style={{ fontSize: 13 }}>
                                    <strong>{data.shifts.length}</strong> shift{data.shifts.length !== 1 ? 's' : ''}
                                </div>
                                <div style={{ fontSize: 13 }}>
                                    <strong>{totalHours.toFixed(1)}</strong> hours
                                </div>
                                <div style={{ fontSize: 13 }}>
                                    <strong>{totalUnits}</strong> units
                                </div>
                                {data.unitSummary && data.unitSummary.length > 0 && (
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 12 }}>
                                        {data.unitSummary.map(s => {
                                            const info = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', label: s.serviceCode };
                                            return (
                                                <span key={s.serviceCode} style={{ color: info.color }}>
                                                    {info.label}: {s.scheduledUnits}/{s.authorizedUnits}u
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Day-by-day shifts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {DAY_NAMES.map((day, i) => {
                                    const dateStr = addDays(weekStart, i);
                                    const shifts = shiftsByDay[dateStr] || [];
                                    const isToday = dateStr === new Date().toISOString().slice(0, 10);
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                                            <div style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
                                                <div style={{ fontSize: 11, color: isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', fontWeight: isToday ? 700 : 500 }}>{day}</div>
                                                <div style={{ fontSize: 16, fontWeight: isToday ? 700 : 400, color: isToday ? 'hsl(var(--primary))' : 'inherit' }}>{dateStr.slice(8)}</div>
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {shifts.length === 0 ? (
                                                    <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 0' }}>—</div>
                                                ) : (
                                                    shifts.map(shift => {
                                                        const info = SERVICE_COLORS[shift.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: shift.serviceCode };
                                                        return (
                                                            <div
                                                                key={shift.id}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 10,
                                                                    padding: '6px 10px',
                                                                    borderRadius: 6,
                                                                    background: info.bg,
                                                                    borderLeft: `3px solid ${info.color}`,
                                                                }}
                                                            >
                                                                <span style={{ fontSize: 12, fontWeight: 600, color: info.color, minWidth: 70 }}>
                                                                    {hhmm12(shift.startTime)} – {hhmm12(shift.endTime)}
                                                                </span>
                                                                <span style={{ fontSize: 12, color: info.color, fontWeight: 500 }}>
                                                                    {info.label}
                                                                </span>
                                                                {shift.displayEmployeeName && (
                                                                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                                                        {shift.displayEmployeeName}
                                                                    </span>
                                                                )}
                                                                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                                                                    {shift.hours}h / {shift.units}u
                                                                </span>
                                                                {shift.status === 'cancelled' && (
                                                                    <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 4 }}>Cancelled</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
