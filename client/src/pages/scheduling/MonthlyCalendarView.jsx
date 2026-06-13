import React, { useState, useMemo, useCallback } from 'react';
import { hhmm12 } from '../../utils/time';
import { SERVICE_COLORS } from '../../utils/constants';

function toLocalDateStr(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        if (d.includes('T')) return d.split('T')[0];
        return d;
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_SHIFTS = 3;

export default function MonthlyCalendarView({ shifts, month, year, overlapIds, onEditShift, onDayClick }) {
    const [search, setSearch] = useState('');
    const [serviceFilter, setServiceFilter] = useState('');
    const [expandedDays, setExpandedDays] = useState({});

    const todayStr = useMemo(() => toLocalDateStr(new Date()), []);

    const filteredShifts = useMemo(() => {
        let filtered = (shifts || []).filter(s => s.status !== 'cancelled');

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter(s =>
                (s.client?.clientName || '').toLowerCase().includes(q) ||
                (s.displayEmployeeName || '').toLowerCase().includes(q) ||
                (s.serviceCode || '').toLowerCase().includes(q)
            );
        }

        if (serviceFilter) {
            filtered = filtered.filter(s => s.serviceCode === serviceFilter);
        }

        return filtered;
    }, [shifts, search, serviceFilter]);

    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = firstDay.getDay();

        const days = [];

        // Days from previous month to fill the first row
        for (let i = startDow - 1; i >= 0; i--) {
            const d = new Date(year, month, -i);
            days.push({ date: d, dateStr: toLocalDateStr(d), isCurrentMonth: false });
        }

        // Days of current month
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const date = new Date(year, month, d);
            days.push({ date, dateStr: toLocalDateStr(date), isCurrentMonth: true });
        }

        // Days from next month to fill the last row
        const remaining = 7 - (days.length % 7);
        if (remaining < 7) {
            for (let i = 1; i <= remaining; i++) {
                const d = new Date(year, month + 1, i);
                days.push({ date: d, dateStr: toLocalDateStr(d), isCurrentMonth: false });
            }
        }

        return days;
    }, [month, year]);

    const shiftsByDay = useMemo(() => {
        const map = {};
        for (const shift of filteredShifts) {
            const dateStr = toLocalDateStr(shift.shiftDate);
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push(shift);
        }
        return map;
    }, [filteredShifts]);

    const toggleExpanded = useCallback((dateStr) => {
        setExpandedDays(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
    }, []);

    const handleDayClick = useCallback((e, dateStr) => {
        e.stopPropagation();
        if (onDayClick) onDayClick(dateStr);
    }, [onDayClick]);

    const serviceOptions = useMemo(() => {
        return Object.entries(SERVICE_COLORS).map(([code, { label }]) => ({ code, label }));
    }, []);

    return (
        <div className="monthly-cal__container">
            {/* Toolbar */}
            <div className="monthly-cal__toolbar">
                <input
                    type="text"
                    className="monthly-cal__search"
                    placeholder="Search client, employee, service..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select
                    className="monthly-cal__filter"
                    value={serviceFilter}
                    onChange={e => setServiceFilter(e.target.value)}
                >
                    <option value="">All Services</option>
                    {serviceOptions.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Calendar Grid */}
            <div className="monthly-cal__grid">
                {/* Header row */}
                {DAY_NAMES.map(day => (
                    <div key={day} className="monthly-cal__header-cell">
                        {day}
                    </div>
                ))}

                {/* Day cells */}
                {calendarDays.map(({ date, dateStr, isCurrentMonth }) => {
                    const dayShifts = shiftsByDay[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isExpanded = expandedDays[dateStr];
                    const visibleShifts = isExpanded ? dayShifts : dayShifts.slice(0, MAX_VISIBLE_SHIFTS);
                    const hiddenCount = dayShifts.length - MAX_VISIBLE_SHIFTS;

                    return (
                        <div
                            key={dateStr}
                            className={[
                                'monthly-cal__day-cell',
                                !isCurrentMonth && 'monthly-cal__day-cell--outside',
                                isToday && 'monthly-cal__day-cell--today',
                            ].filter(Boolean).join(' ')}
                        >
                            <span
                                className="monthly-cal__day-number"
                                onClick={e => handleDayClick(e, dateStr)}
                            >
                                {date.getDate()}
                            </span>

                            <div className="monthly-cal__shifts">
                                {visibleShifts.map(shift => {
                                    const svc = SERVICE_COLORS[shift.serviceCode] || SERVICE_COLORS.PCS;
                                    const hasOverlap = overlapIds && overlapIds.has(shift.id);

                                    return (
                                        <div
                                            key={shift.id}
                                            className={[
                                                'monthly-cal__shift-block',
                                                hasOverlap && 'monthly-cal__shift-block--overlap',
                                            ].filter(Boolean).join(' ')}
                                            style={{
                                                backgroundColor: svc.bg,
                                                borderColor: hasOverlap ? '#EF4444' : svc.color,
                                            }}
                                            onClick={() => onEditShift && onEditShift(shift)}
                                            title={`${shift.client?.clientName || 'Unknown'} - ${shift.displayEmployeeName || 'Unassigned'} (${svc.label})`}
                                        >
                                            <span
                                                className="monthly-cal__shift-dot"
                                                style={{ backgroundColor: svc.color }}
                                            />
                                            <span className="monthly-cal__shift-label">
                                                {shift.displayEmployeeName || shift.client?.clientName || 'Shift'}
                                            </span>
                                            <span className="monthly-cal__shift-time">
                                                {hhmm12(shift.startTime)}
                                            </span>
                                        </div>
                                    );
                                })}

                                {!isExpanded && hiddenCount > 0 && (
                                    <button
                                        className="monthly-cal__more-btn"
                                        onClick={() => toggleExpanded(dateStr)}
                                    >
                                        +{hiddenCount} more
                                    </button>
                                )}
                                {isExpanded && dayShifts.length > MAX_VISIBLE_SHIFTS && (
                                    <button
                                        className="monthly-cal__more-btn"
                                        onClick={() => toggleExpanded(dateStr)}
                                    >
                                        Show less
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
