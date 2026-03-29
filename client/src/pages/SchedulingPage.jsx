import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { hhmm12 } from '../utils/time';
import { useToast } from '../hooks/useToast';
import ScheduleDelivery from './scheduling/ScheduleDelivery';

const SERVICE_COLORS = {
    PCS:   { color: '#3B82F6', bg: '#EFF6FF', label: 'PCA' },
    S5125: { color: '#22C55E', bg: '#F0FDF4', label: 'Attendant Care' },
    S5130: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Homemaker' },
    SDPC:  { color: '#F59E0B', bg: '#FFFBEB', label: 'SDPC' },
    S5135: { color: '#EC4899', bg: '#FDF2F8', label: 'Companion' },
    S5150: { color: '#06B6D4', bg: '#ECFEFF', label: 'Respite' },
};

// Helper: get YYYY-MM-DD from a date value.
// For ISO strings from the server (stored as UTC midnight), extract the UTC date portion
// so a shift on "2026-03-15T00:00:00.000Z" always shows as March 15 regardless of timezone.
// For local Date objects (like our days array), use local date.
function toLocalDateStr(d) {
    if (typeof d === 'string') {
        // If it looks like an ISO string with 'T', extract YYYY-MM-DD from the string directly
        const idx = d.indexOf('T');
        if (idx === 10) return d.slice(0, 10);
        return new Date(d).toISOString().slice(0, 10);
    }
    // For Date objects (our locally-constructed day array), use local date parts
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ShiftFormModal({ shift, clients, employees, onSave, onDelete, onClose, defaultDate, defaultClientId, defaultEmployeeId, defaultStartTime }) {
    const [clientId, setClientId] = useState(shift?.clientId || defaultClientId || '');
    const [employeeId, setEmployeeId] = useState(shift?.employeeId || defaultEmployeeId || '');
    const [serviceCode, setServiceCode] = useState(shift?.serviceCode || 'PCS');
    const [shiftDate, setShiftDate] = useState(shift?.shiftDate ? toLocalDateStr(shift.shiftDate) : (defaultDate || ''));
    const [startTime, setStartTime] = useState(shift?.startTime || defaultStartTime || '09:00');
    const [endTime, setEndTime] = useState(shift?.endTime || '13:00');
    const [notes, setNotes] = useState(shift?.notes || '');
    const [status, setStatus] = useState(shift?.status || 'scheduled');
    const [recurring, setRecurring] = useState(false);
    const [repeatUntil, setRepeatUntil] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [empSearch, setEmpSearch] = useState(() => {
        if (shift?.employeeId) { const e = employees.find(e => e.id === shift.employeeId); return e ? e.name : ''; }
        if (defaultEmployeeId) { const e = employees.find(e => e.id === Number(defaultEmployeeId)); return e ? e.name : ''; }
        return '';
    });
    const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
    const empRef = useRef(null);
    const [authInfo, setAuthInfo] = useState(null);
    const [accountNumber, setAccountNumber] = useState(shift?.accountNumber || '');
    const [sandataClientId, setSandataClientId] = useState(shift?.sandataClientId || '');

    // Client details (pre-filled when client selected)
    const selectedClient = clients.find(c => c.id === Number(clientId));
    const [clientAddress, setClientAddress] = useState(selectedClient?.address || '');
    const [clientPhone, setClientPhone] = useState(selectedClient?.phone || '');
    const [clientGateCode, setClientGateCode] = useState(selectedClient?.gateCode || '');
    const [clientNotes, setClientNotes] = useState(selectedClient?.notes || '');

    useEffect(() => {
        if (clientId && serviceCode && shiftDate) {
            api.getAuthCheck({ clientId, serviceCode, weekStart: shiftDate })
                .then(setAuthInfo)
                .catch(() => setAuthInfo(null));
        } else {
            setAuthInfo(null);
        }
    }, [clientId, serviceCode, shiftDate]);

    useEffect(() => {
        const c = clients.find(cl => cl.id === Number(clientId));
        if (c) {
            setClientAddress(c.address || '');
            setClientPhone(c.phone || '');
            setClientGateCode(c.gateCode || '');
            setClientNotes(c.notes || '');
        }
    }, [clientId, clients]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (empRef.current && !empRef.current.contains(e.target)) setEmpDropdownOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(empSearch.toLowerCase())
    );

    const computeHours = () => {
        if (!startTime || !endTime) return { hours: 0, units: 0 };
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        const hours = Math.round(((endMin - startMin) / 60) * 100) / 100;
        return { hours, units: Math.round(hours * 4) };
    };

    const { hours, units } = computeHours();
    const colorInfo = SERVICE_COLORS[serviceCode] || { color: '#6B7280', label: serviceCode };

    // Compute how many total shifts the recurring option will create (including original)
    const recurringCount = (() => {
        if (!recurring || !repeatUntil || !shiftDate) return 0;
        const start = new Date(shiftDate + 'T12:00:00Z');
        const end = new Date(repeatUntil + 'T12:00:00Z');
        if (end < start) return 0;
        return Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    })();
    // Min date for repeat-until: at least 7 days after shiftDate
    const repeatUntilMin = (() => {
        if (!shiftDate) return '';
        const d = new Date(shiftDate + 'T12:00:00Z');
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
    })();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!empSearch.trim()) return;
        setSaving(true);
        try {
            // If no employee selected from list, create a new one
            let resolvedEmployeeId = employeeId;
            if (!resolvedEmployeeId && empSearch.trim()) {
                const newEmp = await api.createEmployee({ name: empSearch.trim() });
                resolvedEmployeeId = String(newEmp.id);
                setEmployeeId(resolvedEmployeeId);
            }
            const data = {
                clientId: Number(clientId), employeeId: Number(resolvedEmployeeId), serviceCode, shiftDate, startTime, endTime, notes,
                accountNumber, sandataClientId,
            };
            if (shift) data.status = status;
            if (!shift && recurring && repeatUntil) data.repeatUntil = repeatUntil;

            // Patch client details if changed
            if (clientId) {
                const c = clients.find(cl => cl.id === Number(clientId));
                if (c) {
                    const patch = {};
                    if (clientAddress !== (c.address || '')) patch.address = clientAddress;
                    if (clientPhone !== (c.phone || '')) patch.phone = clientPhone;
                    if (clientGateCode !== (c.gateCode || '')) patch.gateCode = clientGateCode;
                    if (clientNotes !== (c.notes || '')) patch.notes = clientNotes;
                    if (Object.keys(patch).length > 0) {
                        await api.patchClient(Number(clientId), patch);
                    }
                }
            }

            await onSave(data);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{shift ? 'Edit Shift' : 'Create Shift'}</h2>
            <p className="modal__desc">{shift ? 'Update the shift details below.' : 'Schedule a new caregiver shift.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftClient">Client</label>
                        <select id="shiftClient" value={clientId} onChange={e => setClientId(e.target.value)} required>
                            <option value="">Select client…</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                        </select>
                    </div>
                    <div className="form-group" ref={empRef} style={{ position: 'relative' }}>
                        <label htmlFor="shiftEmployee">Employee</label>
                        <input
                            id="shiftEmployee"
                            value={empSearch}
                            onChange={e => { setEmpSearch(e.target.value); setEmployeeId(''); setEmpDropdownOpen(true); }}
                            onFocus={() => setEmpDropdownOpen(true)}
                            placeholder="Type to search or add new…"
                            autoComplete="off"
                            required
                        />
                        {employeeId && (
                            <input type="hidden" name="employeeId" value={employeeId} />
                        )}
                        {empDropdownOpen && (
                            <ul style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                                borderRadius: 'var(--radius)', maxHeight: 180, overflowY: 'auto',
                                margin: 0, padding: 0, listStyle: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            }}>
                                {filteredEmployees.length === 0 && empSearch.trim() && (
                                    <li
                                        onClick={() => { setEmployeeId(''); setEmpDropdownOpen(false); }}
                                        style={{ padding: '8px 12px', fontSize: 13, color: 'hsl(142 71% 45%)', cursor: 'pointer' }}
                                    >
                                        + Create "{empSearch.trim()}" as new employee
                                    </li>
                                )}
                                {filteredEmployees.map(e => (
                                    <li
                                        key={e.id}
                                        onClick={() => { setEmployeeId(String(e.id)); setEmpSearch(e.name); setEmpDropdownOpen(false); }}
                                        style={{
                                            padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                            background: String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : undefined,
                                        }}
                                        onMouseEnter={ev => ev.currentTarget.style.background = 'hsl(var(--muted))'}
                                        onMouseLeave={ev => ev.currentTarget.style.background = String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : ''}
                                    >
                                        {e.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftService">Service</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorInfo.color, flexShrink: 0 }} />
                            <select id="shiftService" value={serviceCode} onChange={e => setServiceCode(e.target.value)} style={{ flex: 1 }}>
                                {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                    <option key={code} value={code}>{info.label} ({code})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftDate">Date</label>
                        <input id="shiftDate" type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} required />
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftAccountNumber">Account Number</label>
                        <select id="shiftAccountNumber" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required={!shift}>
                            <option value="">Select account…</option>
                            <option value="71040">71040</option>
                            <option value="71119">71119</option>
                            <option value="71120">71120</option>
                            <option value="71635">71635</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftSandataId">SANDATA Client ID</label>
                        <input id="shiftSandataId" value={sandataClientId} onChange={e => setSandataClientId(e.target.value)} placeholder="Optional…" />
                    </div>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftStart">Start Time</label>
                        <input id="shiftStart" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="shiftEnd">End Time</label>
                        <input id="shiftEnd" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
                    </div>
                </div>
                <div className="sched-hours-display" style={{ borderLeftColor: colorInfo.color }}>
                    <span className="sched-hours-display__value">{hours}</span>
                    <span className="sched-hours-display__label">hours</span>
                    <span className="sched-hours-display__sep">/</span>
                    <span className="sched-hours-display__value">{units}</span>
                    <span className="sched-hours-display__label">units</span>
                </div>
                {authInfo && (
                    <div className={`sched-auth-info ${authInfo.remaining < 0 ? 'sched-auth-info--over' : authInfo.remaining < units ? 'sched-auth-info--warn' : ''}`}>
                        <span>Authorized: {authInfo.authorized} units/week</span>
                        <span>Scheduled: {authInfo.scheduled} units</span>
                        <span>Remaining: {authInfo.remaining} units</span>
                        {authInfo.remaining < units && authInfo.remaining >= 0 && (
                            <div className="sched-auth-info__warning">
                                This shift uses {units} units but only {authInfo.remaining} remain
                            </div>
                        )}
                        {authInfo.remaining < 0 && (
                            <div className="sched-auth-info__warning sched-auth-info__warning--over">
                                Authorization already exceeded by {Math.abs(authInfo.remaining)} units
                            </div>
                        )}
                    </div>
                )}
                {!shift && (
                    <div className="sched-recurring">
                        <label className="sched-recurring__toggle">
                            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
                            <span>Repeat weekly</span>
                        </label>
                        {recurring && (
                            <div className="sched-recurring__options">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="repeatUntil">Repeat until</label>
                                    <input
                                        id="repeatUntil"
                                        type="date"
                                        value={repeatUntil}
                                        onChange={e => setRepeatUntil(e.target.value)}
                                        min={repeatUntilMin || shiftDate}
                                        required={recurring}
                                    />
                                </div>
                                {recurringCount > 1 && (
                                    <div className="sched-recurring__preview">
                                        Will create <strong>{recurringCount} total shifts</strong> (1 original + {recurringCount - 1} repeat{recurringCount - 1 > 1 ? 's' : ''}) — {recurringCount * units} total units
                                    </div>
                                )}
                                {recurring && repeatUntil && recurringCount <= 1 && (
                                    <div className="sched-recurring__preview" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Select a date at least 1 week after the shift date.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {shift && (
                    <div className="form-group">
                        <label htmlFor="shiftStatus">Status</label>
                        <select id="shiftStatus" value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="shiftNotes">Notes</label>
                    <input id="shiftNotes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
                </div>
                {clientId && (
                    <fieldset style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                        <legend style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', padding: '0 6px' }}>
                            Client Details (saved to client record)
                        </legend>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label htmlFor="clientAddress">Address</label>
                                <input id="clientAddress" value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Address…" />
                            </div>
                            <div className="form-group">
                                <label htmlFor="clientPhone">Phone</label>
                                <input id="clientPhone" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone…" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="clientGateCode">Gate Code</label>
                            <input id="clientGateCode" value={clientGateCode} onChange={e => setClientGateCode(e.target.value)} placeholder="Gate code…" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="clientNotesField">Notes</label>
                            <textarea id="clientNotesField" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Notes about this client…" rows={2} />
                        </div>
                    </fieldset>
                )}
                <div className="form-actions">
                    {shift && !confirmDelete && (
                        <button type="button" className="btn btn--outline" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
                            {Icons.trash} Delete
                        </button>
                    )}
                    {shift && confirmDelete && (
                        <div style={{ display: 'flex', gap: 6, marginRight: 'auto' }}>
                            <button type="button" className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => onDelete(shift.id, false)}>
                                Delete This Shift
                            </button>
                            {shift.recurringGroupId && (
                                <button type="button" className="btn" style={{ background: 'hsl(0 60% 45%)', color: '#fff' }} onClick={() => onDelete(shift.id, true)}>
                                    Delete All in Series
                                </button>
                            )}
                        </div>
                    )}
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : authInfo && authInfo.remaining < units ? (shift ? 'Update Anyway' : 'Save Anyway') : (shift ? 'Update Shift' : 'Create Shift')}</button>
                </div>
            </form>
        </Modal>
    );
}

function ScheduleCard({ title, icon, headerActions, children }) {
    return (
        <div className="sched-card">
            <div className="sched-card__header">
                <div className="sched-card__header-left">
                    <span className="sched-card__header-icon">{icon}</span>
                    <span className="sched-card__header-title">{title}</span>
                </div>
                {headerActions && <div className="sched-card__header-actions">{headerActions}</div>}
            </div>
            <div className="sched-card__body">{children}</div>
        </div>
    );
}

function getUsageColor(scheduled, authorized) {
    if (authorized === 0) return '#9ca3af'; // gray for no auth
    const pct = (scheduled / authorized) * 100;
    if (pct >= 100) return '#ef4444'; // red
    if (pct >= 75) return '#f59e0b';  // yellow/amber
    return '#22c55e'; // green
}

function getUsageLabel(scheduled, authorized) {
    if (authorized === 0) return 'No authorization';
    const remaining = authorized - scheduled;
    if (remaining < 0) return `Over by ${Math.abs(remaining)} units`;
    return `${remaining} units remaining`;
}

function AuthSummaryBar({ unitSummary }) {
    if (!unitSummary || Object.keys(unitSummary).length === 0) return null;
    let totalAuth = 0, totalSched = 0;
    for (const data of Object.values(unitSummary)) {
        totalAuth += data.authorized || 0;
        totalSched += data.scheduled || 0;
    }
    const totalAuthHrs = Math.round((totalAuth / 4) * 100) / 100;
    const totalSchedHrs = Math.round((totalSched / 4) * 100) / 100;
    const remainHrs = Math.round((totalAuthHrs - totalSchedHrs) * 100) / 100;
    return (
        <div className="sched-auth-bar">
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Authorized Hours</span>
                <span className="sched-auth-bar__value">{totalAuthHrs} hrs</span>
            </div>
            <div className="sched-auth-bar__sep" />
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Scheduled Hours</span>
                <span className="sched-auth-bar__value" style={{ color: getUsageColor(totalSched, totalAuth) }}>{totalSchedHrs} hrs</span>
            </div>
            <div className="sched-auth-bar__sep" />
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Hours Remaining</span>
                <span className={`sched-auth-bar__value ${remainHrs < 0 ? 'sched-auth-bar__value--over' : 'sched-auth-bar__value--remain'}`}>{remainHrs} hrs</span>
            </div>
            {Object.entries(unitSummary).map(([code, data]) => {
                const colorInfo = SERVICE_COLORS[code] || { color: '#6B7280', label: code };
                const usageColor = getUsageColor(data.scheduled, data.authorized);
                return (
                    <Fragment key={code}>
                        <div className="sched-auth-bar__sep" />
                        <div className="sched-auth-bar__item sched-auth-bar__item--service" title={getUsageLabel(data.scheduled, data.authorized)}>
                            <span className="sched-auth-bar__dot" style={{ background: colorInfo.color }} />
                            <span className="sched-auth-bar__label">{colorInfo.label}</span>
                            <span className="sched-auth-bar__value" style={{ color: usageColor }}>{data.scheduled}/{data.authorized}u</span>
                            {data.scheduled >= data.authorized && data.authorized > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }} title="At or over limit">&#x26A0;</span>}
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}

const GRID_START_HOUR = 4;
const GRID_END_HOUR = 24;
const HOUR_HEIGHT = 60;

function ScheduleWeekGrid({ shifts, weekStart, onAddShift, onEditShift, viewMode, overlapIds }) {
    const days = [];
    const ws = new Date(weekStart + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days.push(d);
    }
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayStr = toLocalDateStr(new Date());
    const hours = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) hours.push(h);
    const totalHeight = hours.length * HOUR_HEIGHT;

    const fmtHour = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

    // Group shifts by date string
    const shiftsByDate = {};
    for (const s of shifts) {
        const d = toLocalDateStr(s.shiftDate);
        if (!shiftsByDate[d]) shiftsByDate[d] = [];
        shiftsByDate[d].push(s);
    }

    // Compute overlap columns for a set of shifts in one day
    const computeColumns = (dayShifts) => {
        const toMin = (t) => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
        const sorted = [...dayShifts].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
        const columns = [];
        const active = [];

        for (const s of sorted) {
            let sStart = toMin(s.startTime);
            let sEnd = toMin(s.endTime);
            if (sEnd <= sStart) sEnd += 24 * 60;

            let col = 0;
            const usedCols = new Set();
            for (const a of active) {
                let aEnd = toMin(a.shift.endTime);
                if (aEnd <= toMin(a.shift.startTime)) aEnd += 24 * 60;
                if (sStart < aEnd) usedCols.add(a.col);
            }
            while (usedCols.has(col)) col++;
            active.push({ shift: s, col });
            columns.push({ shift: s, col });
        }

        const maxCol = columns.length > 0 ? Math.max(...columns.map(c => c.col)) + 1 : 1;
        return columns.map(c => ({ ...c, totalCols: maxCol }));
    };

    const handleDayClick = (e, dateStr) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hour = Math.floor(y / HOUR_HEIGHT) + GRID_START_HOUR;
        const snapped = Math.max(GRID_START_HOUR, Math.min(GRID_END_HOUR - 1, hour));
        const time = `${String(snapped).padStart(2, '0')}:00`;
        onAddShift(dateStr, time);
    };

    return (
        <div className="sched-wg">
            <div className="sched-wg__header">
                <div className="sched-wg__gutter" />
                {days.map((day, i) => {
                    const dateStr = toLocalDateStr(day);
                    const isToday = dateStr === todayStr;
                    return (
                        <div key={i} className={`sched-wg__day-header ${isToday ? 'sched-wg__day-header--today' : ''}`}>
                            <span className="sched-wg__day-abbr">{dayAbbr[i]}</span>
                            <span className="sched-wg__day-num">{day.getMonth() + 1}/{day.getDate()}</span>
                        </div>
                    );
                })}
            </div>

            <div className="sched-wg__body" style={{ height: totalHeight }}>
                <div className="sched-wg__gutter">
                    {hours.map(h => (
                        <div key={h} className="sched-wg__hour-label" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}>
                            {fmtHour(h)}
                        </div>
                    ))}
                </div>

                {days.map((day, i) => {
                    const dateStr = toLocalDateStr(day);
                    const isToday = dateStr === todayStr;
                    const dayShifts = shiftsByDate[dateStr] || [];
                    const positioned = computeColumns(dayShifts);

                    return (
                        <div
                            key={i}
                            className={`sched-wg__day-col ${isToday ? 'sched-wg__day-col--today' : ''}`}
                            onClick={(e) => handleDayClick(e, dateStr)}
                        >
                            {hours.map(h => (
                                <div key={h} className="sched-wg__hline" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }} />
                            ))}

                            {positioned.map(({ shift: s, col, totalCols }) => {
                                const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: s.serviceCode };
                                const isOverlap = overlapIds && overlapIds.has(s.id);
                                const isCancelled = s.status === 'cancelled';

                                const [sh, sm] = (s.startTime || '09:00').split(':').map(Number);
                                const [eh, em] = (s.endTime || '13:00').split(':').map(Number);
                                let startMin = sh * 60 + sm;
                                let endMin = eh * 60 + em;
                                if (endMin <= startMin) endMin += 24 * 60;
                                const gridStartMin = GRID_START_HOUR * 60;
                                const gridEndMin = GRID_END_HOUR * 60;
                                const clippedStart = Math.max(startMin, gridStartMin);
                                const clippedEnd = Math.min(endMin, gridEndMin);
                                const top = ((clippedStart - gridStartMin) / 60) * HOUR_HEIGHT;
                                const height = Math.max(((clippedEnd - clippedStart) / 60) * HOUR_HEIGHT, 20);
                                const isClipped = endMin > gridEndMin;

                                const colWidth = 100 / totalCols;
                                const left = col * colWidth;

                                return (
                                    <button
                                        key={s.id}
                                        className={`sched-wg__block ${isCancelled ? 'sched-wg__block--cancelled' : ''} ${isOverlap ? 'sched-wg__block--overlap' : ''}`}
                                        style={{
                                            top: top + 'px',
                                            height: height + 'px',
                                            left: left + '%',
                                            width: colWidth + '%',
                                            '--block-color': colorInfo.color,
                                            '--block-bg': isOverlap ? 'hsl(0 84% 97%)' : colorInfo.bg,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); onEditShift(s); }}
                                        title={`${colorInfo.label} — ${hhmm12(s.startTime)} - ${hhmm12(s.endTime)} (${s.hours}h)`}
                                    >
                                        <span className="sched-wg__block-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span>
                                        <span className="sched-wg__block-time">{hhmm12(s.startTime)}-{hhmm12(s.endTime)}</span>
                                        {viewMode === 'client' && <span className="sched-wg__block-label">{s.displayEmployeeName || 'Unassigned'}</span>}
                                        {viewMode !== 'client' && <span className="sched-wg__block-label">{s.client?.clientName || ''}</span>}
                                        {isClipped && <span className="sched-wg__block-clip" title="Continues next day">...</span>}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ScheduleOverviewTable({ shifts, overlapIds, onEditShift }) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sorted = [...shifts].sort((a, b) => {
        const da = new Date(a.shiftDate).getTime();
        const db = new Date(b.shiftDate).getTime();
        if (da !== db) return da - db;
        return (a.startTime || '').localeCompare(b.startTime || '');
    });

    return (
        <div className="sched-overview-table-wrap">
            <table className="sched-overview-table">
                <thead>
                    <tr>
                        <th>Day</th>
                        <th>Client</th>
                        <th>Employee</th>
                        <th>Service</th>
                        <th>Time</th>
                        <th>Hours</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'hsl(var(--muted-foreground))' }}>No shifts this week</td></tr>
                    )}
                    {sorted.map(s => {
                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', label: s.serviceCode };
                        const isOverlap = overlapIds && overlapIds.has(s.id);
                        const dateStr = toLocalDateStr(s.shiftDate);
                        const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
                        return (
                            <tr key={s.id} className={`sched-overview-table__row ${isOverlap ? 'sched-overview-table__row--overlap' : ''} ${s.status === 'cancelled' ? 'sched-overview-table__row--cancelled' : ''}`} onClick={() => onEditShift(s)} style={{ cursor: 'pointer' }}>
                                <td>{dayNames[dayIdx]}</td>
                                <td>{s.client?.clientName || '—'}</td>
                                <td>{s.displayEmployeeName || '—'}</td>
                                <td><span className="sched-service-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span></td>
                                <td className="sched-overview-table__time">{hhmm12(s.startTime)} - {hhmm12(s.endTime)}</td>
                                <td>{s.hours}h</td>
                                <td><span className={`sched-status sched-status--${s.status}`}>{s.status}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function SchedulingPage() {
    const { showToast } = useToast();
    const [clients, setClients] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [overlaps, setOverlaps] = useState([]);
    const [unitSummary, setUnitSummary] = useState({});
    const [unitSummaries, setUnitSummaries] = useState({});
    const [employees, setEmployees] = useState([]);
    const [clientInfo, setClientInfo] = useState(null);
    const [employeeInfo, setEmployeeInfo] = useState(null);
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return toLocalDateStr(d);
    });
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [viewMode, setViewMode] = useState('overview');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    const fetchClients = useCallback(async () => {
        try { setClients(await api.getClients()); }
        catch (_) { /* silent */ }
    }, []);

    const fetchEmployees = useCallback(async () => {
        try {
            const data = await api.getEmployees({ active: 'true' });
            setEmployees(data);
        } catch (err) { showToast(err.message, 'error'); }
    }, [showToast]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            if (viewMode === 'client' && selectedClientId) {
                const data = await api.getClientSchedule(selectedClientId, weekStart);
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary(data.unitSummary || {});
                setUnitSummaries({});
                setClientInfo(data.client || null);
                setEmployeeInfo(null);
            } else if (viewMode === 'employee' && selectedEmployeeId) {
                const data = await api.getEmployeeSchedule(selectedEmployeeId, weekStart);
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary({});
                setUnitSummaries({});
                setClientInfo(null);
                setEmployeeInfo(data.employee || null);
            } else {
                const data = await api.getShifts(weekStart, {});
                setShifts(data.shifts || []);
                setOverlaps(data.overlaps || []);
                setUnitSummary({});
                setUnitSummaries(data.unitSummaries || {});
                setClientInfo(null);
                setEmployeeInfo(null);
            }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoading(false); }
    }, [weekStart, viewMode, selectedClientId, selectedEmployeeId, showToast]);

    useEffect(() => { fetchClients(); }, [fetchClients]);
    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        setSelectedClientId('');
        setSelectedEmployeeId('');
        setClientInfo(null);
        setEmployeeInfo(null);
        setUnitSummary({});
    }, [viewMode]);

    const navigateWeek = (dir) => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + dir * 7);
        setWeekStart(toLocalDateStr(d));
    };

    const goToday = () => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        setWeekStart(toLocalDateStr(d));
    };

    const weekEndDate = (() => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + 6);
        return d;
    })();

    const handleSaveShift = async (data) => {
        try {
            if (modal.shift) {
                await api.updateShift(modal.shift.id, data);
                showToast('Shift updated');
            } else {
                const result = await api.createShift(data);
                if (result.count) showToast(`${result.count} recurring shifts created`);
                else showToast('Shift created');
            }
            setModal(null);
            fetchData();
            fetchEmployees();
        } catch (err) {
            if (err.isOverlap) {
                setModal(prev => ({ ...prev, overlapWarning: err.message, overlapData: data, overlapConflicts: err.conflicts }));
            } else {
                showToast(err.message, 'error');
            }
        }
    };

    const handleForceSaveShift = async () => {
        if (!modal?.overlapData) return;
        try {
            const data = { ...modal.overlapData, force: true };
            if (modal.shift) {
                await api.updateShift(modal.shift.id, data);
                showToast('Shift updated (overlap allowed)');
            } else {
                const result = await api.createShift(data);
                if (result.count) showToast(`${result.count} recurring shifts created (overlaps allowed)`);
                else showToast('Shift created (overlap allowed)');
            }
            setModal(null);
            fetchData();
            fetchEmployees();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteShift = async (shiftId, deleteGroup = false) => {
        try {
            const result = await api.deleteShift(shiftId, { group: deleteGroup });
            const count = result?.deleted || 1;
            showToast(count > 1 ? `${count} shifts deleted` : 'Shift deleted');
            setModal(null);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAllShifts = async () => {
        try {
            const result = await api.deleteAllShifts();
            showToast(`${result.deleted} shift${result.deleted !== 1 ? 's' : ''} deleted`);
            fetchData();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleAddShift = (dateStr, startTime) => {
        setModal({ type: 'shift', shift: null, defaultDate: dateStr, defaultStartTime: startTime });
    };

    const handleEditShift = (shift) => {
        setModal({ type: 'shift', shift });
    };

    const overlapIds = useMemo(() => {
        const set = new Set();
        for (const o of overlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [overlaps]);

    const formatWeekLabel = () => {
        const ws = new Date(weekStart + 'T00:00:00');
        const opts = { month: 'short', day: 'numeric' };
        return `${ws.toLocaleDateString('en-US', opts)} — ${weekEndDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
    };

    const displayUnitSummary = useMemo(() => {
        if (viewMode === 'client' && Object.keys(unitSummary).length > 0) return unitSummary;
        if (viewMode === 'overview' && Object.keys(unitSummaries).length > 0) {
            const combined = {};
            for (const cid of Object.keys(unitSummaries)) {
                const s = unitSummaries[cid];
                for (const code of Object.keys(s)) {
                    if (!combined[code]) combined[code] = { authorized: 0, scheduled: 0, remaining: 0 };
                    combined[code].authorized += s[code].authorized;
                    combined[code].scheduled += s[code].scheduled;
                    combined[code].remaining += s[code].remaining;
                }
            }
            return combined;
        }
        return {};
    }, [viewMode, unitSummary, unitSummaries]);

    const weekStats = useMemo(() => {
        const totalHours = shifts.reduce((sum, s) => sum + (s.status !== 'cancelled' ? (s.hours || 0) : 0), 0);
        const totalUnits = shifts.reduce((sum, s) => sum + (s.status !== 'cancelled' ? (s.units || 0) : 0), 0);
        const activeShifts = shifts.filter(s => s.status !== 'cancelled').length;
        return { totalHours: Math.round(totalHours * 100) / 100, totalUnits, activeShifts };
    }, [shifts]);

    return (
        <>
            {/* Header */}
            <div className="content-header">
                <h1 className="content-header__title">Scheduling</h1>
                <div className="content-header__actions">
                    {shifts.length > 0 && (
                        <button className="btn btn--outline btn--sm" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)' }} onClick={() => setModal({ type: 'confirmDeleteAll' })}>
                            {Icons.trash} Delete All
                        </button>
                    )}
                    <button className="btn btn--outline btn--sm" title="Send Schedule (Coming Soon)" disabled>
                        {Icons.share} Send Schedule
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'shift', shift: null })}>
                        {Icons.plus} Add Shift
                    </button>
                </div>
            </div>

            <div className="page-content">
                {/* Week Nav + View Toggle Row */}
                <div className="sched-toolbar">
                    <div className="sched-week-nav">
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(-1)}>{Icons.chevronLeft}</button>
                        <button className="btn btn--outline btn--sm" onClick={goToday}>Today</button>
                        <span className="sched-week-nav__label">{formatWeekLabel()}</span>
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(1)}>{Icons.chevronRight}</button>
                    </div>
                    <div className="sched-view-toggle">
                        <button className={`sched-view-toggle__btn ${viewMode === 'overview' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('overview')}>
                            {Icons.calendar} Overview
                        </button>
                        <button className={`sched-view-toggle__btn ${viewMode === 'client' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('client')}>
                            {Icons.user} Client
                        </button>
                        <button className={`sched-view-toggle__btn ${viewMode === 'employee' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('employee')}>
                            {Icons.users} Employee
                        </button>
                    </div>
                </div>

                {/* Overlap Warnings */}
                {overlaps.length > 0 && (
                    <div className="sched-overlap-warning">
                        {Icons.alertTriangle}
                        <div>
                            <strong>Overlap{overlaps.length > 1 ? 's' : ''} Detected ({overlaps.length})</strong>
                            <div>{overlaps.map((o, i) => <div key={i}>{o.employeeName} — {o.date}</div>)}</div>
                        </div>
                    </div>
                )}

                {/* Client View */}
                {viewMode === 'client' && (
                    <ScheduleCard
                        title="Client Schedule"
                        icon={Icons.user}
                        headerActions={
                            <select className="sched-card__select" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                                <option value="">Select a client…</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                            </select>
                        }
                    >
                        {!selectedClientId ? (
                            <div className="sched-prompt">
                                {Icons.user}
                                <div>Select a client to view their weekly schedule and authorization tracking.</div>
                            </div>
                        ) : loading ? (
                            <div className="sched-prompt">Loading…</div>
                        ) : (
                            <>
                                {clientInfo && (
                                    <div className="sched-client-info">
                                        <div className="sched-client-info__details">
                                            {clientInfo.address && <span className="sched-client-info__tag">{Icons.layoutDashboard} {clientInfo.address}</span>}
                                            {clientInfo.phone && <span className="sched-client-info__tag">{Icons.user} {clientInfo.phone}</span>}
                                            {clientInfo.gateCode && <span className="sched-client-info__tag sched-client-info__tag--gate">Gate: {clientInfo.gateCode}</span>}
                                        </div>
                                        {clientInfo.notes && <div className="sched-client-info__notes">{clientInfo.notes}</div>}
                                    </div>
                                )}
                                <AuthSummaryBar unitSummary={displayUnitSummary} />
                                <ScheduleWeekGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="client" overlapIds={overlapIds} />
                            </>
                        )}
                    </ScheduleCard>
                )}

                {/* Employee View */}
                {viewMode === 'employee' && (
                    <ScheduleCard
                        title="Employee Schedule"
                        icon={Icons.users}
                        headerActions={
                            <select className="sched-card__select" value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)}>
                                <option value="">Select an employee…</option>
                                {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        }
                    >
                        {!selectedEmployeeId ? (
                            <div className="sched-prompt">
                                {Icons.users}
                                <div>Select an employee to view their schedule and detect overlaps.</div>
                            </div>
                        ) : loading ? (
                            <div className="sched-prompt">Loading…</div>
                        ) : (
                            <>
                                {employeeInfo && (
                                    <div className="sched-employee-info">
                                        <strong>{employeeInfo.name}</strong>
                                        {employeeInfo.phone && <span> — {employeeInfo.phone}</span>}
                                        {employeeInfo.email && <span> — {employeeInfo.email}</span>}
                                    </div>
                                )}
                                <ScheduleWeekGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="employee" overlapIds={overlapIds} />
                            </>
                        )}
                    </ScheduleCard>
                )}

                {/* Overview: Week Stats + Schedule Table + Data Table */}
                {viewMode === 'overview' && (
                    <>
                        {!loading && shifts.length > 0 && (
                            <div className="sched-stats-bar">
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.activeShifts}</span>
                                    <span className="sched-stats-bar__label">shifts</span>
                                </div>
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.totalHours}</span>
                                    <span className="sched-stats-bar__label">hours</span>
                                </div>
                                <div className="sched-stats-bar__item">
                                    <span className="sched-stats-bar__value">{weekStats.totalUnits}</span>
                                    <span className="sched-stats-bar__label">units</span>
                                </div>
                                {overlaps.length > 0 && (
                                    <div className="sched-stats-bar__item sched-stats-bar__item--warn">
                                        <span className="sched-stats-bar__value">{overlaps.length}</span>
                                        <span className="sched-stats-bar__label">overlap{overlaps.length > 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        <AuthSummaryBar unitSummary={displayUnitSummary} />
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'hsl(var(--muted-foreground))' }}>Loading shifts…</div>
                        ) : (
                            <>
                                <ScheduleWeekGrid shifts={shifts} weekStart={weekStart} onAddShift={handleAddShift} onEditShift={handleEditShift} viewMode="overview" overlapIds={overlapIds} />
                                {shifts.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>
                                        No shifts scheduled this week. Click + on any day to get started.
                                    </div>
                                )}
                            </>
                        )}

                        {/* Weekly Schedule Overview Table */}
                        {!loading && shifts.length > 0 && (
                            <ScheduleCard title="Weekly Schedule Overview" icon={Icons.table}>
                                <ScheduleOverviewTable shifts={shifts} overlapIds={overlapIds} onEditShift={handleEditShift} />
                            </ScheduleCard>
                        )}
                    </>
                )}

                {/* Schedule Delivery */}
                <ScheduleDelivery weekStart={weekStart} />

                {/* Service Legend */}
                <div className="sched-legend">
                    {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                        <span key={code} className="sched-legend__item">
                            <span className="sched-legend__dot" style={{ background: info.color }} />
                            {info.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Shift Modal */}
            {modal?.type === 'shift' && !modal.overlapWarning && (
                <ShiftFormModal
                    shift={modal.shift}
                    defaultDate={modal.defaultDate}
                    defaultStartTime={modal.defaultStartTime}
                    defaultClientId={viewMode === 'client' ? selectedClientId : ''}
                    defaultEmployeeId={viewMode === 'employee' ? selectedEmployeeId : ''}
                    clients={clients}
                    employees={employees}
                    onSave={handleSaveShift}
                    onDelete={handleDeleteShift}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Overlap Confirmation Modal */}
            {modal?.type === 'shift' && modal.overlapWarning && (
                <Modal onClose={() => setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}>
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'hsl(38 92% 50%)' }}>{Icons.alertTriangle}</span> Overlap Detected
                    </h2>
                    <div className="sched-overlap-confirm">
                        <p className="sched-overlap-confirm__msg">{modal.overlapWarning}</p>
                        {modal.overlapConflicts && modal.overlapConflicts.length > 0 && (
                            <div className="sched-overlap-confirm__list">
                                {modal.overlapConflicts.map((c, i) => (
                                    <div key={i} className="sched-overlap-confirm__item">
                                        <strong>{c.date}</strong> — conflicts with {c.conflictWith.clientName} ({hhmm12(c.conflictWith.startTime)} - {hhmm12(c.conflictWith.endTime)})
                                    </div>
                                ))}
                            </div>
                        )}
                        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: '12px 0 0' }}>
                            Do you want to create this shift anyway?
                        </p>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}>
                            Go Back
                        </button>
                        <button className="btn" style={{ background: 'hsl(38 92% 50%)', color: '#fff' }} onClick={handleForceSaveShift}>
                            Create Anyway
                        </button>
                    </div>
                </Modal>
            )}

            {/* Delete All Confirmation Modal */}
            {modal?.type === 'confirmDeleteAll' && (
                <Modal onClose={() => setModal(null)}>
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertTriangle}</span> Delete All Shifts
                    </h2>
                    <p style={{ fontSize: 14, color: 'hsl(var(--foreground))', margin: '8px 0 16px' }}>
                        This will permanently delete <strong>all {shifts.length} shift{shifts.length !== 1 ? 's' : ''}</strong>. This action cannot be undone.
                    </p>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setModal(null)}>Cancel</button>
                        <button className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => { handleDeleteAllShifts(); setModal(null); }}>
                            Delete All Shifts
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
}
