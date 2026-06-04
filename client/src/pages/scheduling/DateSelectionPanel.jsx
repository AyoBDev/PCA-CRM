import { useState, useMemo } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShiftDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${Number(d)}`;
}

function weekKey(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const sun = new Date(date);
    sun.setDate(date.getDate() - date.getDay());
    return sun.toISOString().split('T')[0];
}

export default function DateSelectionPanel({ shifts, selectedIds, onSelectionChange, actionLabel = 'Apply' }) {
    const [selectAllState, setSelectAllState] = useState(false);

    const groupedByWeek = useMemo(() => {
        const groups = {};
        for (const shift of shifts) {
            const raw = shift.shiftDate;
            const dateStr = typeof raw === 'string' && raw.includes('T') ? raw.split('T')[0] : String(raw);
            const wk = weekKey(dateStr);
            if (!groups[wk]) groups[wk] = [];
            groups[wk].push({ ...shift, dateStr });
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [shifts]);

    const allIds = shifts.map(s => s.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));

    const toggleAll = () => {
        if (allSelected) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(allIds));
        }
        setSelectAllState(!allSelected);
    };

    const selectNextNWeeks = (n) => {
        const today = new Date();
        const cutoff = new Date(today);
        cutoff.setDate(today.getDate() + n * 7);
        const ids = shifts
            .filter(s => {
                const dateStr = typeof s.shiftDate === 'string' && s.shiftDate.includes('T') ? s.shiftDate.split('T')[0] : String(s.shiftDate);
                return new Date(dateStr + 'T00:00:00') <= cutoff;
            })
            .map(s => s.id);
        onSelectionChange(new Set(ids));
    };

    const toggleShift = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange(next);
    };

    return (
        <div className="date-selection-panel">
            <div className="date-selection-panel__header">
                <span className="date-selection-panel__count">
                    {selectedIds.size} of {shifts.length} selected
                </span>
                <div className="date-selection-panel__quick">
                    <button className="btn btn--outline btn--xs" onClick={toggleAll}>
                        {allSelected ? 'Clear All' : 'Select All'}
                    </button>
                    <button className="btn btn--outline btn--xs" onClick={() => selectNextNWeeks(4)}>
                        Next 4 Weeks
                    </button>
                    <button className="btn btn--outline btn--xs" onClick={() => onSelectionChange(new Set())}>
                        Clear
                    </button>
                </div>
            </div>
            <div className="date-selection-panel__list">
                {groupedByWeek.map(([wkStart, weekShifts]) => (
                    <div key={wkStart} className="date-selection-panel__week">
                        <div className="date-selection-panel__week-header">
                            Week of {formatShiftDate(wkStart)}
                        </div>
                        {weekShifts.map(shift => (
                            <label key={shift.id} className="date-selection-panel__row">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(shift.id)}
                                    onChange={() => toggleShift(shift.id)}
                                />
                                <span className="date-selection-panel__date">
                                    {formatShiftDate(shift.dateStr)}
                                </span>
                                <span className="date-selection-panel__detail">
                                    {shift.client?.clientName || 'Unknown'}
                                </span>
                                <span className="date-selection-panel__time">
                                    {shift.startTime || ''} – {shift.endTime || ''}
                                </span>
                            </label>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
