import { useState, useMemo, useEffect } from 'react';
import Icons from '../../components/common/Icons';
import SearchableSelect from '../../components/common/SearchableSelect';
import { hhmm12 } from '../../utils/time';
import { SERVICE_COLORS, DAY_NAMES_SHORT, DAY_NAMES_FULL } from '../../utils/constants';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = DAY_NAMES_SHORT;

export default function FutureShiftsView({ shifts, clients, employees, onEditShift, onBulkDelete, loading, onFilterChange }) {
    const [filterClient, setFilterClient] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterService, setFilterService] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (onFilterChange) onFilterChange({ clientId: filterClient, employeeId: filterEmployee });
    }, [filterClient, filterEmployee, onFilterChange]);

    const clientOptions = useMemo(() => [
        { value: '', label: 'All Clients' },
        ...clients.map(c => ({ value: String(c.id), label: c.clientName }))
    ], [clients]);

    const employeeOptions = useMemo(() => [
        { value: '', label: 'All Employees' },
        ...employees.map(e => ({ value: String(e.id), label: e.name }))
    ], [employees]);

    const serviceOptions = useMemo(() => {
        const codes = [...new Set(shifts.filter(s => s.serviceCode).map(s => s.serviceCode))];
        return codes.sort();
    }, [shifts]);

    const filteredShifts = useMemo(() => {
        return shifts
            .filter(s => s.status !== 'cancelled')
            .filter(s => !filterClient || String(s.clientId) === filterClient)
            .filter(s => !filterEmployee || String(s.employeeId) === filterEmployee)
            .filter(s => !filterService || s.serviceCode === filterService);
    }, [shifts, filterClient, filterEmployee, filterService]);

    const groupedByMonth = useMemo(() => {
        const groups = {};
        filteredShifts.forEach(shift => {
            const raw = shift.shiftDate;
            const dateStr = typeof raw === 'string' && raw.includes('T') ? raw.split('T')[0] : String(raw);
            const [y, m] = dateStr.split('-');
            const key = `${y}-${m}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    label: `${MONTHS[Number(m) - 1]} ${y}`,
                    shifts: []
                };
            }
            groups[key].shifts.push(shift);
        });
        return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredShifts]);

    function resetFilters() {
        setFilterClient('');
        setFilterEmployee('');
        setFilterService('');
    }

    function toggleSelect(id) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleMonthAll(monthShifts) {
        const monthIds = monthShifts.map(s => s.id);
        const allSelected = monthIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                monthIds.forEach(id => next.delete(id));
            } else {
                monthIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    function selectRecurringGroup(recurringGroupId) {
        const groupShifts = filteredShifts.filter(s => s.recurringGroupId === recurringGroupId);
        setSelectedIds(prev => {
            const next = new Set(prev);
            groupShifts.forEach(s => next.add(s.id));
            return next;
        });
    }

    function handleDeleteConfirm() {
        onBulkDelete([...selectedIds]);
        setSelectedIds(new Set());
        setConfirmDelete(false);
    }

    function clearSelection() {
        setSelectedIds(new Set());
        setConfirmDelete(false);
    }

    if (loading) {
        return (
            <div className="future-shifts__loading" style={{ padding: '3rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                Loading shifts...
            </div>
        );
    }

    const hasActiveFilters = filterClient || filterEmployee || filterService;

    return (
        <div className="future-shifts">
            {/* Filter bar */}
            <div className="future-shifts__filters">
                <div className="future-shifts__filter">
                    <SearchableSelect
                        options={clientOptions}
                        value={filterClient}
                        onChange={setFilterClient}
                        placeholder="All Clients"
                        className="future-shifts__select-input"
                    />
                </div>
                <div className="future-shifts__filter">
                    <SearchableSelect
                        options={employeeOptions}
                        value={filterEmployee}
                        onChange={setFilterEmployee}
                        placeholder="All Employees"
                        className="future-shifts__select-input"
                    />
                </div>
                <select
                    className="future-shifts__service-select"
                    value={filterService}
                    onChange={e => setFilterService(e.target.value)}
                >
                    <option value="">All Services</option>
                    {serviceOptions.map(code => (
                        <option key={code} value={code}>
                            {SERVICE_COLORS[code]?.label || code}
                        </option>
                    ))}
                </select>
                {hasActiveFilters && (
                    <button className="btn btn--outline btn--sm" onClick={resetFilters}>
                        Reset
                    </button>
                )}
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="future-shifts__bulk-bar" style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                }}>
                    <span style={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                        {selectedIds.size} selected
                    </span>
                    {!confirmDelete ? (
                        <button className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>
                            <span className="icon" style={{ width: 14, height: 14 }}>{Icons.trash}</span>
                            Delete Selected
                        </button>
                    ) : (
                        <>
                            <span style={{ color: 'hsl(0 84% 60%)', fontWeight: 500 }}>Are you sure?</span>
                            <button className="btn btn--danger btn--sm" onClick={handleDeleteConfirm}>
                                Yes, Delete {selectedIds.size}
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={() => setConfirmDelete(false)}>
                                Cancel
                            </button>
                        </>
                    )}
                    <button className="btn btn--ghost btn--sm" onClick={clearSelection} style={{ marginLeft: 'auto' }}>
                        Clear Selection
                    </button>
                </div>
            )}

            {/* Empty state */}
            {filteredShifts.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state__icon">{Icons.calendar}</div>
                    <h3 className="empty-state__title">No upcoming shifts</h3>
                    <p className="empty-state__desc">
                        {hasActiveFilters
                            ? 'No shifts match your current filters. Try adjusting or resetting them.'
                            : 'There are no future shifts scheduled yet.'}
                    </p>
                </div>
            )}

            {/* Grouped tables */}
            {groupedByMonth.map(group => {
                const monthIds = group.shifts.map(s => s.id);
                const allMonthSelected = monthIds.length > 0 && monthIds.every(id => selectedIds.has(id));
                const someMonthSelected = monthIds.some(id => selectedIds.has(id)) && !allMonthSelected;

                return (
                    <div key={group.key} className="future-shifts__month" style={{ marginBottom: '1.5rem' }}>
                        <div className="future-shifts__month-header" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem 0',
                            marginBottom: '0.5rem',
                        }}>
                            <input
                                type="checkbox"
                                checked={allMonthSelected}
                                ref={el => { if (el) el.indeterminate = someMonthSelected; }}
                                onChange={() => toggleMonthAll(group.shifts)}
                            />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                                {group.label}
                            </h3>
                            <span className="ts-badge ts-badge--draft">{group.shifts.length}</span>
                        </div>
                        <div className="sheet-card">
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 36 }}></th>
                                            <th>Date</th>
                                            <th>Day</th>
                                            <th>Client</th>
                                            <th>Employee</th>
                                            <th>Service</th>
                                            <th>Time</th>
                                            <th>Account</th>
                                            <th>Recurring</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.shifts.map(shift => {
                                            const raw = shift.shiftDate;
                                            const isoStr = typeof raw === 'string' && raw.includes('T') ? raw.split('T')[0] : String(raw);
                                            const [y, m, day] = isoStr.split('-');
                                            const d = new Date(Number(y), Number(m) - 1, Number(day));
                                            const dayName = DAYS[d.getDay()];
                                            const dateStr = `${MONTHS[Number(m) - 1].slice(0, 3)} ${Number(day)}`;
                                            const svc = SERVICE_COLORS[shift.serviceCode] || null;
                                            const timeStr = shift.startTime && shift.endTime
                                                ? `${hhmm12(shift.startTime)} – ${hhmm12(shift.endTime)}`
                                                : '';

                                            return (
                                                <tr key={shift.id}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(shift.id)}
                                                            onChange={() => toggleSelect(shift.id)}
                                                        />
                                                    </td>
                                                    <td>{dateStr}</td>
                                                    <td>{dayName}</td>
                                                    <td>
                                                        <button
                                                            className="btn btn--ghost btn--xs"
                                                            style={{ color: 'hsl(217 91% 60%)', textDecoration: 'underline', padding: 0 }}
                                                            onClick={() => onEditShift(shift)}
                                                        >
                                                            {shift.client?.clientName || 'Unknown'}
                                                        </button>
                                                    </td>
                                                    <td>{shift.displayEmployeeName || 'Unassigned'}</td>
                                                    <td>
                                                        {svc ? (
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '2px 8px',
                                                                borderRadius: 'var(--radius)',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 500,
                                                                color: svc.color,
                                                                background: svc.bg,
                                                            }}>
                                                                {svc.label}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                                {shift.serviceCode || '—'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>{timeStr}</td>
                                                    <td>{shift.accountNumber || '—'}</td>
                                                    <td>
                                                        {shift.recurringGroupId ? (
                                                            <button
                                                                className="btn btn--ghost btn--xs"
                                                                title="Select all shifts in this recurring group"
                                                                onClick={() => selectRecurringGroup(shift.recurringGroupId)}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <span className="icon" style={{ width: 14, height: 14 }}>{Icons.repeat}</span>
                                                                Series
                                                            </button>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
