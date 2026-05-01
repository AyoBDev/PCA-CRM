import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { hhmm12 } from '../utils/time';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';
import ScheduleDelivery from './scheduling/ScheduleDelivery';

const VALID_ACCOUNT_NUMBERS = ['71040', '71119', '71120', '71635'];

// Distinct colors for visually distinguishing multiple clients
const CLIENT_COLORS = [
    { color: '#3B82F6', bg: '#EFF6FF' },   // Blue
    { color: '#8B5CF6', bg: '#F5F3FF' },   // Purple
    { color: '#06B6D4', bg: '#ECFEFF' },   // Cyan
    { color: '#F59E0B', bg: '#FFFBEB' },   // Amber
    { color: '#EC4899', bg: '#FDF2F8' },   // Pink
    { color: '#22C55E', bg: '#F0FDF4' },   // Green
    { color: '#EF4444', bg: '#FEF2F2' },   // Red
    { color: '#6366F1', bg: '#EEF2FF' },   // Indigo
    { color: '#14B8A6', bg: '#F0FDFA' },   // Teal
    { color: '#F97316', bg: '#FFF7ED' },   // Orange
];

function buildClientColorMap(shifts) {
    const names = [...new Set(shifts.map(s => s.client?.clientName).filter(Boolean))].sort();
    const map = {};
    names.forEach((name, i) => {
        map[name] = CLIENT_COLORS[i % CLIENT_COLORS.length];
    });
    return map;
}

const SERVICE_COLORS = {
    PCS:   { color: '#3B82F6', bg: '#EFF6FF', label: 'PCA' },
    S5125: { color: '#22C55E', bg: '#F0FDF4', label: 'Attendant Care' },
    S5130: { color: '#8B5CF6', bg: '#F5F3FF', label: 'Homemaker' },
    SDPC:  { color: '#F59E0B', bg: '#FFFBEB', label: 'SDPC' },
    S5135: { color: '#EC4899', bg: '#FDF2F8', label: 'Companion' },
    S5150: { color: '#06B6D4', bg: '#ECFEFF', label: 'Respite' },
};

// Reusable searchable dropdown for Client/Employee selection
import SearchableSelect from '../components/common/SearchableSelect';

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

function ShiftFormModal({ shift, clients, employees, onSave, onRepeat, onDelete, onClose, defaultDate, defaultClientId, defaultEmployeeId, defaultStartTime, weekStart: propWeekStart, draft, onClearDraft }) {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const isEdit = !!shift;

    // Shared fields — restore from draft if available (create mode only)
    const d = !isEdit && draft;
    const [clientId, setClientId] = useState(d?.clientId || shift?.clientId || defaultClientId || '');
    const [employeeId, setEmployeeId] = useState(d?.employeeId || shift?.employeeId || defaultEmployeeId || '');
    const [notes, setNotes] = useState(d?.notes || shift?.notes || '');
    const [status, setStatus] = useState(shift?.status || 'scheduled');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [accountNumber, setAccountNumber] = useState(d?.accountNumber || shift?.accountNumber || '');
    const [sandataClientId, setSandataClientId] = useState(d?.sandataClientId || shift?.sandataClientId || '');

    // Employee search
    const [empSearch, setEmpSearch] = useState(() => {
        if (d?.empSearch) return d.empSearch;
        if (shift?.employeeId) { const e = employees.find(e => e.id === shift.employeeId); return e ? e.name : ''; }
        if (defaultEmployeeId) { const e = employees.find(e => e.id === Number(defaultEmployeeId)); return e ? e.name : ''; }
        return '';
    });
    const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
    const [creatingNewEmp, setCreatingNewEmp] = useState(false);
    const [newEmpEmail, setNewEmpEmail] = useState('');
    const empRef = useRef(null);

    // Client details
    const selectedClient = clients.find(c => c.id === Number(clientId));
    const [clientAddress, setClientAddress] = useState(selectedClient?.address || '');
    const [clientPhone, setClientPhone] = useState(selectedClient?.phone || '');
    const [clientGateCode, setClientGateCode] = useState(selectedClient?.gateCode || '');
    const [clientNotes, setClientNotes] = useState(selectedClient?.notes || '');

    // Authorized services for the selected client (from master sheet)
    // Resolves TIMESHEETS entries via serviceName matching, includes units
    function deriveCode(auth) {
        if (auth.serviceCode && auth.serviceCode !== 'TIMESHEETS') return auth.serviceCode;
        if (!auth.serviceName) return null;
        const lower = auth.serviceName.toLowerCase();
        if (lower.includes('self') && (lower.includes('directed') || lower.includes('direct'))) return 'SDPC';
        if (lower.includes('personal') && lower.includes('care')) return 'PCS';
        if (lower === 'pas' || lower === 'pca') return 'PCS';
        if (lower.includes('homemaker') || lower === 'hm') return 'S5130';
        if (lower.includes('attendant')) return 'S5125';
        if (lower.includes('companion')) return 'S5135';
        if (lower.includes('respite')) return 'S5150';
        return null;
    }

    const authorizedServiceMap = useMemo(() => {
        if (!selectedClient?.authorizations?.length) return {};
        const now = new Date();
        const map = {};
        for (const auth of selectedClient.authorizations) {
            if (auth.authorizationEndDate && new Date(auth.authorizationEndDate) < now) continue;
            const code = deriveCode(auth);
            if (!code) continue;
            if (!map[code]) map[code] = { units: 0, category: '' };
            map[code].units += auth.authorizedUnits || 0;
            if (auth.serviceCategory && !map[code].category) {
                map[code].category = auth.serviceCategory;
            }
        }
        return map;
    }, [selectedClient]);

    const authorizedServices = useMemo(() => Object.keys(authorizedServiceMap), [authorizedServiceMap]);

    // Edit mode: single day fields
    const [serviceCode, setServiceCode] = useState(shift?.serviceCode || 'PCS');
    const [shiftDate, setShiftDate] = useState(shift?.shiftDate ? toLocalDateStr(shift.shiftDate) : (defaultDate || ''));
    const [startTime, setStartTime] = useState(shift?.startTime || defaultStartTime || '09:00');
    const [endTime, setEndTime] = useState(shift?.endTime || '13:00');

    // Create mode: multi-day schedule
    // Each day entry: { enabled, serviceCode, startTime, endTime }
    const wsDate = propWeekStart ? new Date(propWeekStart + 'T00:00:00') : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(wsDate);
        d.setDate(wsDate.getDate() + i);
        weekDates.push(toLocalDateStr(d));
    }

    const [dayEntries, setDayEntries] = useState(() =>
        d?.dayEntries || DAY_NAMES.map((_, i) => ({
            enabled: defaultDate ? weekDates[i] === defaultDate : false,
            serviceCode: 'PCS',
            startTime: defaultStartTime || '09:00',
            endTime: '13:00',
            accountNumber: accountNumber || '',
            sandataClientId: '',
        }))
    );

    const [recurring, setRecurring] = useState(d?.recurring || false);
    const [repeatUntil, setRepeatUntil] = useState(d?.repeatUntil || '');

    // Edit mode: repeat weekly (retroactive)
    const [editRepeat, setEditRepeat] = useState(false);
    const [editRepeatUntil, setEditRepeatUntil] = useState('');

    const [authInfo, setAuthInfo] = useState(null);

    const updateDayEntry = (idx, field, value) => {
        setDayEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
    };

    const enabledCount = dayEntries.filter(d => d.enabled).length;

    // Apply same time/service to all enabled days
    const applyToAll = (sourceIdx) => {
        const src = dayEntries[sourceIdx];
        setDayEntries(prev => prev.map((e, i) => e.enabled && i !== sourceIdx ? { ...e, serviceCode: src.serviceCode, startTime: src.startTime, endTime: src.endTime, accountNumber: src.accountNumber, sandataClientId: src.sandataClientId } : e));
    };

    useEffect(() => {
        if (isEdit && clientId && serviceCode && shiftDate) {
            api.getAuthCheck({ clientId, serviceCode, weekStart: shiftDate })
                .then(setAuthInfo).catch(() => setAuthInfo(null));
        } else {
            setAuthInfo(null);
        }
    }, [isEdit, clientId, serviceCode, shiftDate]);

    useEffect(() => {
        const c = clients.find(cl => cl.id === Number(clientId));
        if (c) {
            setClientAddress(c.address || '');
            setClientPhone(c.phone || '');
            setClientGateCode(c.gateCode || '');
            setClientNotes(c.notes || '');
        }
    }, [clientId, clients]);

    // Reset service code when client changes if current selection isn't authorized
    useEffect(() => {
        if (authorizedServices.length > 0 && !authorizedServices.includes(serviceCode)) {
            setServiceCode(authorizedServices[0]);
        }
        if (authorizedServices.length > 0) {
            setDayEntries(prev => prev.map(e => ({
                ...e,
                serviceCode: authorizedServices.includes(e.serviceCode) ? e.serviceCode : authorizedServices[0],
            })));
        }
    }, [authorizedServices]);

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

    const computeHrs = (sT, eT) => {
        if (!sT || !eT) return { hours: 0, units: 0 };
        const [sh, sm] = sT.split(':').map(Number);
        const [eh, em] = eT.split(':').map(Number);
        let startMin = sh * 60 + sm, endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        const hours = Math.round(((endMin - startMin) / 60) * 100) / 100;
        return { hours, units: Math.round(hours * 4) };
    };

    // Edit mode hours
    const { hours, units } = computeHrs(startTime, endTime);
    const editColorInfo = SERVICE_COLORS[serviceCode] || { color: '#6B7280', label: serviceCode };

    // Create mode totals
    const totalCreateUnits = dayEntries.reduce((sum, d) => {
        if (!d.enabled) return sum;
        return sum + computeHrs(d.startTime, d.endTime).units;
    }, 0);
    const totalCreateHours = dayEntries.reduce((sum, d) => {
        if (!d.enabled) return sum;
        return sum + computeHrs(d.startTime, d.endTime).hours;
    }, 0);

    // Recurring count
    const recurringCount = (() => {
        if (!recurring || !repeatUntil) return 0;
        const firstEnabled = weekDates.find((_, i) => dayEntries[i].enabled);
        if (!firstEnabled) return 0;
        const start = new Date(firstEnabled + 'T12:00:00Z');
        const end = new Date(repeatUntil + 'T12:00:00Z');
        if (end < start) return 0;
        return Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    })();

    const repeatUntilMin = (() => {
        const firstEnabled = weekDates.find((_, i) => dayEntries[i].enabled);
        if (!firstEnabled) return '';
        const d = new Date(firstEnabled + 'T12:00:00Z');
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
    })();

    // Edit mode repeat: compute preview count and min date
    const editRepeatMin = (() => {
        if (!shiftDate) return '';
        const d = new Date(shiftDate + 'T12:00:00Z');
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
    })();

    const editRepeatCount = (() => {
        if (!editRepeat || !editRepeatUntil || !shiftDate) return 0;
        const start = new Date(shiftDate + 'T12:00:00Z');
        const end = new Date(editRepeatUntil + 'T12:00:00Z');
        if (end < start) return 0;
        return Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000));
    })();

    // Collect current form state as a draft snapshot
    const collectDraft = () => ({
        clientId, employeeId, empSearch, notes, accountNumber, sandataClientId,
        dayEntries, recurring, repeatUntil,
    });

    const handleClose = () => {
        if (!isEdit) {
            onClose(collectDraft());
        } else {
            onClose();
        }
    };

    const handleClear = () => {
        setClientId('');
        setEmployeeId('');
        setEmpSearch('');
        setNotes('');
        setAccountNumber('');
        setSandataClientId('');
        setRecurring(false);
        setRepeatUntil('');
        setDayEntries(DAY_NAMES.map(() => ({
            enabled: false,
            serviceCode: 'PCS',
            startTime: '09:00',
            endTime: '13:00',
            accountNumber: '',
            sandataClientId: '',
        })));
        if (onClearDraft) onClearDraft();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!empSearch.trim()) return;
        setSaving(true);
        try {
            let resolvedEmployeeId = employeeId;
            if (!resolvedEmployeeId && empSearch.trim()) {
                const empData = { name: empSearch.trim() };
                if (newEmpEmail.trim()) empData.email = newEmpEmail.trim();
                const newEmp = await api.createEmployee(empData);
                resolvedEmployeeId = String(newEmp.id);
                setEmployeeId(resolvedEmployeeId);
            }

            // Patch client details if changed
            if (clientId) {
                const c = clients.find(cl => cl.id === Number(clientId));
                if (c) {
                    const patch = {};
                    if (clientAddress !== (c.address || '')) patch.address = clientAddress;
                    if (clientPhone !== (c.phone || '')) patch.phone = clientPhone;
                    if (clientGateCode !== (c.gateCode || '')) patch.gateCode = clientGateCode;
                    if (clientNotes !== (c.notes || '')) patch.notes = clientNotes;
                    if (Object.keys(patch).length > 0) await api.patchClient(Number(clientId), patch);
                }
            }

            if (isEdit) {
                // Single shift update
                const data = {
                    clientId: Number(clientId), employeeId: Number(resolvedEmployeeId),
                    serviceCode, shiftDate, startTime, endTime, notes, status,
                    accountNumber, sandataClientId,
                };
                await onSave(data);
                // If repeat weekly was toggled on, create recurring copies
                if (editRepeat && editRepeatUntil && onRepeat) {
                    await onRepeat(shift.id, { repeatUntil: editRepeatUntil });
                }
            } else {
                // Multi-day bulk create
                const bulkShifts = [];
                for (let i = 0; i < 7; i++) {
                    if (!dayEntries[i].enabled) continue;
                    const entry = { serviceCode: dayEntries[i].serviceCode, shiftDate: weekDates[i], startTime: dayEntries[i].startTime, endTime: dayEntries[i].endTime, accountNumber: dayEntries[i].accountNumber || '', sandataClientId: dayEntries[i].sandataClientId || '' };
                    bulkShifts.push(entry);
                    // If recurring, add weekly copies
                    if (recurring && repeatUntil) {
                        const weekMs = 7 * 24 * 60 * 60 * 1000;
                        let cursorMs = new Date(weekDates[i] + 'T12:00:00Z').getTime() + weekMs;
                        const endMs = new Date(repeatUntil + 'T12:00:00Z').getTime();
                        while (cursorMs <= endMs) {
                            bulkShifts.push({ ...entry, shiftDate: new Date(cursorMs).toISOString().slice(0, 10) });
                            cursorMs += weekMs;
                        }
                    }
                }
                const data = {
                    clientId: Number(clientId), employeeId: Number(resolvedEmployeeId),
                    notes, accountNumber, sandataClientId, shifts: bulkShifts,
                };
                await onSave(data);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={handleClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Shift' : 'Create Weekly Schedule'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the shift details below.' : 'Select days, set service type and times for each.'}</p>
            <form onSubmit={handleSubmit}>
                {/* Client + Employee row */}
                <div className="form-grid-2">
                    <div className="form-group">
                        <label htmlFor="shiftClient">Client</label>
                        <SearchableSelect
                            id="shiftClient"
                            options={clients.map(c => ({ value: c.id, label: c.clientName }))}
                            value={clientId}
                            onChange={setClientId}
                            placeholder="Type to search clients…"
                        />
                        {clientId && authorizedServices.length === 0 && (
                            <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>This client has no active authorizations. Cannot create shifts.</p>
                        )}
                    </div>
                    <div className="form-group" ref={empRef} style={{ position: 'relative' }}>
                        <label htmlFor="shiftEmployee">Employee</label>
                        <input
                            id="shiftEmployee"
                            value={empSearch}
                            onChange={e => { setEmpSearch(e.target.value); setEmployeeId(''); setCreatingNewEmp(false); setNewEmpEmail(''); setEmpDropdownOpen(true); }}
                            onFocus={() => setEmpDropdownOpen(true)}
                            placeholder="Type to search or add new…"
                            autoComplete="off"
                            required
                        />
                        {empDropdownOpen && (
                            <ul style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                                borderRadius: 'var(--radius)', maxHeight: 180, overflowY: 'auto',
                                margin: 0, padding: 0, listStyle: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            }}>
                                {filteredEmployees.length === 0 && empSearch.trim() && (
                                    <li onClick={() => { setEmployeeId(''); setCreatingNewEmp(true); setEmpDropdownOpen(false); }}
                                        style={{ padding: '8px 12px', fontSize: 13, color: 'hsl(142 71% 45%)', cursor: 'pointer' }}>
                                        + Create "{empSearch.trim()}" as new employee
                                    </li>
                                )}
                                {filteredEmployees.map(e => (
                                    <li key={e.id}
                                        onClick={() => { setEmployeeId(String(e.id)); setEmpSearch(e.name); setCreatingNewEmp(false); setNewEmpEmail(''); setEmpDropdownOpen(false); }}
                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, background: String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : undefined }}
                                        onMouseEnter={ev => ev.currentTarget.style.background = 'hsl(var(--muted))'}
                                        onMouseLeave={ev => ev.currentTarget.style.background = String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : ''}>
                                        {e.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* New employee email field */}
                {creatingNewEmp && !employeeId && (
                    <div className="form-group" style={{ marginTop: 0 }}>
                        <label htmlFor="newEmpEmail" style={{ fontSize: 13 }}>
                            New employee email <span style={{ color: '#71717a', fontWeight: 400 }}>(for schedule notifications)</span>
                        </label>
                        <input
                            id="newEmpEmail"
                            type="email"
                            value={newEmpEmail}
                            onChange={e => setNewEmpEmail(e.target.value)}
                            placeholder="employee@email.com"
                            style={{ fontSize: 13 }}
                        />
                    </div>
                )}

                {/* Authorized services summary */}
                {clientId && authorizedServices.length > 0 && (
                    <table className="sched-modal-auth-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Service</th>
                                <th>Units</th>
                                <th>Hours</th>
                            </tr>
                        </thead>
                        <tbody>
                            {authorizedServices.map(code => {
                                const info = SERVICE_COLORS[code] || { color: '#6B7280', label: code };
                                const svcData = authorizedServiceMap[code];
                                const units = svcData?.units || 0;
                                const hrs = Math.round((units / 4) * 100) / 100;
                                return (
                                    <tr key={code}>
                                        <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{svcData?.category || '—'}</td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                                                {info.label} ({code})
                                            </span>
                                        </td>
                                        <td>{units}</td>
                                        <td>{hrs}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* Account + Sandata row */}
                {isEdit ? (
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label htmlFor="shiftAccountNumber">Account Number</label>
                            <select id="shiftAccountNumber" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}>
                                <option value="">Select account…</option>
                                {VALID_ACCOUNT_NUMBERS.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="shiftSandataId">Sandata Client ID</label>
                            <input id="shiftSandataId" value={sandataClientId} onChange={e => setSandataClientId(e.target.value)} placeholder="Optional…" />
                        </div>
                    </div>
                ) : null}

                {isEdit ? (
                    /* ─── EDIT MODE: single day ─── */
                    <>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label htmlFor="shiftService">Service</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: editColorInfo.color, flexShrink: 0 }} />
                                    <select id="shiftService" value={serviceCode} onChange={e => setServiceCode(e.target.value)} style={{ flex: 1 }}>
                                        {clientId && authorizedServices.length > 0
                                            ? authorizedServices.map(code => {
                                                const info = SERVICE_COLORS[code] || { label: code };
                                                const cat = authorizedServiceMap[code]?.category;
                                                return <option key={code} value={code}>{cat ? `${cat} — ` : ''}{info.label} ({code})</option>;
                                            })
                                            : Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                                <option key={code} value={code}>{info.label} ({code})</option>
                                            ))
                                        }
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
                                <label htmlFor="shiftStart">Start Time</label>
                                <input id="shiftStart" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="shiftEnd">End Time</label>
                                <input id="shiftEnd" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
                            </div>
                        </div>
                        <div className="sched-hours-display" style={{ borderLeftColor: editColorInfo.color }}>
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
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="shiftStatus">Status</label>
                            <select id="shiftStatus" value={status} onChange={e => setStatus(e.target.value)}>
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        {/* Repeat Weekly — only show for shifts not already in a recurring group */}
                        {!shift.recurringGroupId && (
                            <div className="sched-recurring">
                                <label className="sched-recurring__toggle">
                                    <input type="checkbox" checked={editRepeat} onChange={e => setEditRepeat(e.target.checked)} />
                                    <span>Repeat weekly</span>
                                </label>
                                {editRepeat && (
                                    <div className="sched-recurring__options">
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label htmlFor="editRepeatUntil">Repeat until</label>
                                            <input id="editRepeatUntil" type="date" value={editRepeatUntil}
                                                onChange={e => setEditRepeatUntil(e.target.value)}
                                                min={editRepeatMin} required={editRepeat} />
                                        </div>
                                        {editRepeatCount > 0 && (
                                            <div className="sched-recurring__preview">
                                                Will create <strong>{editRepeatCount} additional shift{editRepeatCount !== 1 ? 's' : ''}</strong> (weekly copies)
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    /* ─── CREATE MODE: multi-day weekly ─── */
                    <>
                        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Days of the Week</label>
                        <div className="sched-day-grid">
                            {DAY_NAMES.map((day, i) => {
                                const entry = dayEntries[i];
                                const dayColorInfo = SERVICE_COLORS[entry.serviceCode] || { color: '#6B7280', label: entry.serviceCode };
                                const { hours: dH, units: dU } = computeHrs(entry.startTime, entry.endTime);
                                return (
                                    <div key={i} className={`sched-day-row ${entry.enabled ? 'sched-day-row--active' : ''}`}>
                                        <div className="sched-day-row__header">
                                            <label className="sched-day-row__toggle">
                                                <input type="checkbox" checked={entry.enabled} onChange={e => updateDayEntry(i, 'enabled', e.target.checked)} />
                                                <span className="sched-day-row__day">{day}</span>
                                                <span className="sched-day-row__date">{weekDates[i].slice(5)}</span>
                                            </label>
                                            {entry.enabled && (
                                                <span className="sched-day-row__badge" style={{ background: `color-mix(in srgb, ${dayColorInfo.color} 15%, white)`, color: dayColorInfo.color }}>
                                                    {dH}h / {dU}u
                                                </span>
                                            )}
                                        </div>
                                        {entry.enabled && (
                                            <div className="sched-day-row__fields">
                                                <div className="sched-day-row__field">
                                                    <label className="sched-day-row__field-label">Service</label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: dayColorInfo.color, flexShrink: 0 }} />
                                                        <select value={entry.serviceCode} onChange={e => updateDayEntry(i, 'serviceCode', e.target.value)} className="sched-day-row__input">
                                                            {clientId && authorizedServices.length > 0
                                                                ? authorizedServices.map(code => {
                                                                    const info = SERVICE_COLORS[code] || { label: code };
                                                                    const cat = authorizedServiceMap[code]?.category;
                                                                    return <option key={code} value={code}>{cat ? `${cat} — ` : ''}{info.label}</option>;
                                                                })
                                                                : Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                                                    <option key={code} value={code}>{info.label}</option>
                                                                ))
                                                            }
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="sched-day-row__field">
                                                    <label className="sched-day-row__field-label">Start</label>
                                                    <input type="time" value={entry.startTime} onChange={e => updateDayEntry(i, 'startTime', e.target.value)} className="sched-day-row__input" required />
                                                </div>
                                                <div className="sched-day-row__field">
                                                    <label className="sched-day-row__field-label">End</label>
                                                    <input type="time" value={entry.endTime} onChange={e => updateDayEntry(i, 'endTime', e.target.value)} className="sched-day-row__input" required />
                                                </div>
                                                <div className="sched-day-row__field">
                                                    <label className="sched-day-row__field-label">Account</label>
                                                    <select value={entry.accountNumber} onChange={e => updateDayEntry(i, 'accountNumber', e.target.value)} className="sched-day-row__input">
                                                        <option value="">—</option>
                                                        {VALID_ACCOUNT_NUMBERS.map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </div>
                                                <div className="sched-day-row__field">
                                                    <label className="sched-day-row__field-label">Sandata Client ID</label>
                                                    <input value={entry.sandataClientId} onChange={e => updateDayEntry(i, 'sandataClientId', e.target.value)} className="sched-day-row__input" placeholder="—" />
                                                </div>
                                                {enabledCount > 1 && (
                                                    <button type="button" className="sched-day-row__apply" title="Apply this service and times to all selected days" onClick={() => applyToAll(i)}>
                                                        Apply to all
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {enabledCount > 0 && (
                            <div className="sched-hours-display" style={{ borderLeftColor: 'hsl(217 91% 50%)' }}>
                                <span className="sched-hours-display__value">{enabledCount}</span>
                                <span className="sched-hours-display__label">day{enabledCount !== 1 ? 's' : ''}</span>
                                <span className="sched-hours-display__sep">/</span>
                                <span className="sched-hours-display__value">{totalCreateHours}</span>
                                <span className="sched-hours-display__label">hours</span>
                                <span className="sched-hours-display__sep">/</span>
                                <span className="sched-hours-display__value">{totalCreateUnits}</span>
                                <span className="sched-hours-display__label">units</span>
                            </div>
                        )}

                        <div className="sched-recurring">
                            <label className="sched-recurring__toggle">
                                <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
                                <span>Repeat weekly</span>
                            </label>
                            {recurring && (
                                <div className="sched-recurring__options">
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label htmlFor="repeatUntil">Repeat until</label>
                                        <input id="repeatUntil" type="date" value={repeatUntil}
                                            onChange={e => setRepeatUntil(e.target.value)}
                                            min={repeatUntilMin} required={recurring} />
                                    </div>
                                    {recurringCount > 1 && enabledCount > 0 && (
                                        <div className="sched-recurring__preview">
                                            Will create <strong>{enabledCount * recurringCount} total shifts</strong> ({enabledCount} days × {recurringCount} weeks) — {totalCreateUnits * recurringCount} total units
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
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
                    {isEdit && !confirmDelete && (
                        <button type="button" className="btn btn--outline" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
                            {Icons.trash} Delete
                        </button>
                    )}
                    {isEdit && confirmDelete && (
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
                    {!isEdit && (clientId || employeeId || empSearch || dayEntries.some(de => de.enabled)) && (
                        <button type="button" className="btn btn--outline" style={{ marginRight: 'auto', color: 'hsl(var(--muted-foreground))', fontSize: 12 }} onClick={handleClear}>
                            Clear
                        </button>
                    )}
                    <button type="button" className="btn btn--outline" onClick={handleClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={saving || (!isEdit && enabledCount === 0) || (clientId && authorizedServices.length === 0)}>
                        {saving ? 'Saving…' : isEdit ? 'Update Shift' : `Create ${enabledCount} Shift${enabledCount !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function ScheduleCard({ title, icon, headerActions, children, collapsible = true, defaultExpanded = true, showPdf = false, pdfShifts = [], pdfWeekStart, pdfRowBy }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
        if (!fullscreen) return;
        const onKey = e => { if (e.key === 'Escape') setFullscreen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const handleSavePdf = () => {
        if (!pdfShifts || pdfShifts.length === 0) return;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const sorted = [...pdfShifts].sort((a, b) => {
            const da = new Date(a.shiftDate).getTime();
            const db = new Date(b.shiftDate).getTime();
            if (da !== db) return da - db;
            return (a.startTime || '').localeCompare(b.startTime || '');
        });

        // ── Detail table ──
        const detailRows = sorted.map(s => {
            const dateStr = toLocalDateStr(s.shiftDate);
            const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
            const day = dayNames[dayIdx];
            const time = `${hhmm12(s.startTime)} – ${hhmm12(s.endTime)}`;
            const client = s.client?.clientName || '—';
            const employee = s.displayEmployeeName || s.employeeName || '—';
            const colorInfo = SERVICE_COLORS[s.serviceCode] || { label: s.serviceCode || '—' };
            const service = colorInfo.label;
            const account = s.accountNumber || '—';
            const sandataId = s.sandataClientId || '—';
            const details = [
                s.client?.address,
                s.client?.phone,
                s.client?.gateCode ? `Gate: ${s.client.gateCode}` : null,
                s.notes,
            ].filter(Boolean).join(' · ');
            const cancelled = s.status === 'cancelled';
            return `<tr${cancelled ? ' class="cancelled"' : ''}>
                <td>${day}</td><td>${client}</td><td>${employee}</td><td>${service}</td><td>${time}</td><td>${account}</td><td>${sandataId}</td><td class="details">${details || '—'}</td>
            </tr>`;
        }).join('\n');

        // ── Calendar matrix ──
        let matrixHtml = '';
        if (pdfWeekStart) {
            const ws = new Date(pdfWeekStart + 'T00:00:00');
            const days = [];
            const dayHeaders = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(ws);
                d.setDate(ws.getDate() + i);
                const dateStr = toLocalDateStr(d);
                days.push(dateStr);
                dayHeaders.push(`<th class="matrix-day-head">${dayAbbr[i]}<br><span class="matrix-day-num">${d.getDate()}</span></th>`);
            }

            const rowBy = pdfRowBy || 'employee';
            const rowMap = new Map();
            for (const s of sorted) {
                const key = rowBy === 'employee'
                    ? (s.displayEmployeeName || s.employeeName || 'Unassigned')
                    : (s.client?.clientName || 'Unknown');
                if (!rowMap.has(key)) rowMap.set(key, {});
                const dateStr = toLocalDateStr(s.shiftDate);
                if (!rowMap.get(key)[dateStr]) rowMap.get(key)[dateStr] = [];
                rowMap.get(key)[dateStr].push(s);
            }

            const rowLabel = rowBy === 'employee' ? 'Employee' : 'Client';
            const matrixRows = [...rowMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, cells]) => {
                const tds = days.map(dateStr => {
                    const cellShifts = cells[dateStr] || [];
                    if (cellShifts.length === 0) return '<td class="matrix-cell empty">—</td>';
                    const chips = cellShifts.map(s => {
                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { label: s.serviceCode || '—' };
                        const name = rowBy === 'employee' ? (s.client?.clientName || '—') : (s.displayEmployeeName || '—');
                        return `<div class="chip"><strong>${name}</strong><br>${hhmm12(s.startTime)}–${hhmm12(s.endTime)}<br><span class="chip-svc">${colorInfo.label}</span></div>`;
                    }).join('');
                    return `<td class="matrix-cell">${chips}</td>`;
                }).join('');
                return `<tr><td class="matrix-row-label">${label}</td>${tds}</tr>`;
            }).join('\n');

            matrixHtml = `
<h2 class="section-title">Weekly Calendar</h2>
<table class="matrix">
    <thead><tr><th class="matrix-row-head">${rowLabel}</th>${dayHeaders.join('')}</tr></thead>
    <tbody>${matrixRows}</tbody>
</table>`;
        }

        const printWin = window.open('', '_blank');
        if (!printWin) return;
        printWin.document.write(`<!DOCTYPE html><html><head><title>${title} — PCAlink</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #09090b; background: #fff; margin: 0; }
.pdf-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #18181b; }
.pdf-header h1 { font-size: 20px; margin: 0; }
.pdf-header span { font-size: 12px; color: #71717a; }
.section-title { font-size: 15px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e4e4e7; }

/* Detail table */
table.detail { width: 100%; border-collapse: collapse; font-size: 12px; }
table.detail th { text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; background: #f4f4f5; border-bottom: 2px solid #e4e4e7; }
table.detail td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
table.detail tr:nth-child(even) { background: #fafafa; }
table.detail .cancelled { opacity: 0.45; text-decoration: line-through; }
table.detail .details { font-size: 11px; color: #71717a; max-width: 200px; }

/* Matrix table */
table.matrix { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; border: 1px solid #e4e4e7; border-radius: 6px; }
table.matrix th { background: #f4f4f5; color: #71717a; font-weight: 600; padding: 8px 6px; text-align: center; border-bottom: 1px solid #e4e4e7; font-size: 11px; }
.matrix-row-head { width: 120px; text-align: left !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
.matrix-day-head { font-size: 11px; }
.matrix-day-num { font-size: 14px; font-weight: 700; }
.matrix-row-label { font-weight: 600; font-size: 12px; padding: 8px 10px; background: #fafafa; border-right: 1px solid #e4e4e7; vertical-align: top; }
.matrix-cell { padding: 4px; vertical-align: top; border-right: 1px solid #f4f4f5; }
.matrix-cell.empty { color: #d4d4d8; text-align: center; vertical-align: middle; }
table.matrix tbody tr:not(:last-child) td { border-bottom: 1px solid #f4f4f5; }
.chip { padding: 4px 6px; margin-bottom: 3px; border-left: 3px solid #71717a; border-radius: 3px; background: #f9fafb; line-height: 1.4; }
.chip strong { font-size: 11px; }
.chip-svc { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: #71717a; }

@media print { body { padding: 16px; } @page { margin: 0.4in; size: landscape; } }
</style>
</head><body>
<div class="pdf-header">
    <h1>${title}</h1>
    <span>PCAlink — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
</div>
<h2 class="section-title">Shift Details</h2>
<table class="detail">
    <thead><tr><th>Day</th><th>Client</th><th>Employee</th><th>Service</th><th>Time</th><th>Account</th><th>Sandata ID</th><th>Details</th></tr></thead>
    <tbody>${detailRows}</tbody>
</table>
${matrixHtml}
</body></html>`);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => { printWin.print(); }, 400);
    };

    return (
        <div className={`sched-card ${!expanded ? 'sched-card--collapsed' : ''} ${fullscreen ? 'sched-card--fullscreen' : ''}`}>
            <div className="sched-card__header" onClick={collapsible && !fullscreen ? () => setExpanded(e => !e) : undefined} style={collapsible && !fullscreen ? { cursor: 'pointer' } : undefined}>
                <div className="sched-card__header-left">
                    {collapsible && !fullscreen && (
                        <span className={`sched-card__chevron ${expanded ? 'sched-card__chevron--open' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </span>
                    )}
                    <span className="sched-card__header-icon">{icon}</span>
                    <span className="sched-card__header-title">{title}</span>
                </div>
                <div className="sched-card__header-actions" onClick={e => e.stopPropagation()}>
                    {headerActions}
                    {showPdf && expanded && (
                        <button
                            className="btn btn--outline btn--sm"
                            title="Save as PDF"
                            onClick={handleSavePdf}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                            {Icons.download} PDF
                        </button>
                    )}
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
            {(expanded || fullscreen) && <div className="sched-card__body">{children}</div>}
            {fullscreen && <div className="sched-card__backdrop" onClick={() => setFullscreen(false)} />}
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

function HoursSummaryBar({ summaryViewBy, unitSummaries, shifts }) {
    if (summaryViewBy === 'client') {
        let totalAuth = 0, totalSched = 0;
        for (const cid of Object.keys(unitSummaries || {})) {
            for (const data of Object.values(unitSummaries[cid])) {
                totalAuth += data.authorized || 0;
                totalSched += data.scheduled || 0;
            }
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
            </div>
        );
    }

    // Employee mode — no "authorized" concept. Show total scheduled + employee count.
    const totalSchedHrs = Math.round(
        shifts.filter(s => s.status !== 'cancelled').reduce((sum, s) => sum + (s.hours || 0), 0) * 100
    ) / 100;
    const employeeIds = new Set(shifts.filter(s => s.status !== 'cancelled' && s.employeeId).map(s => s.employeeId));
    return (
        <div className="sched-auth-bar">
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Active Employees</span>
                <span className="sched-auth-bar__value">{employeeIds.size}</span>
            </div>
            <div className="sched-auth-bar__sep" />
            <div className="sched-auth-bar__item">
                <span className="sched-auth-bar__label">Scheduled Hours</span>
                <span className="sched-auth-bar__value sched-auth-bar__value--remain">{totalSchedHrs} hrs</span>
            </div>
        </div>
    );
}

function ScheduleOverviewTable({ shifts, overlapIds, onEditShift, clientColorMap }) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sorted = [...shifts].sort((a, b) => {
        const da = new Date(a.shiftDate).getTime();
        const db = new Date(b.shiftDate).getTime();
        if (da !== db) return da - db;
        return (a.startTime || '').localeCompare(b.startTime || '');
    });
    const hasMultipleClients = clientColorMap && Object.keys(clientColorMap).length > 1;

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
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'hsl(var(--muted-foreground))' }}>No shifts this week</td></tr>
                    )}
                    {sorted.map(s => {
                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', label: s.serviceCode };
                        const isOverlap = overlapIds && overlapIds.has(s.id);
                        const dateStr = toLocalDateStr(s.shiftDate);
                        const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
                        const cc = hasMultipleClients && s.client?.clientName ? clientColorMap[s.client.clientName] : null;
                        return (
                            <tr key={s.id} className={`sched-overview-table__row ${isOverlap ? 'sched-overview-table__row--overlap' : ''} ${s.status === 'cancelled' ? 'sched-overview-table__row--cancelled' : ''}`} onClick={() => onEditShift(s)} style={{ cursor: 'pointer', borderLeft: cc ? `3px solid ${cc.color}` : undefined }}>
                                <td>{dayNames[dayIdx]}</td>
                                <td>
                                    {cc && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cc.color, marginRight: 6, verticalAlign: 'middle' }} />}
                                    {s.client?.clientName || '—'}
                                </td>
                                <td>{s.displayEmployeeName || '—'}</td>
                                <td><span className="sched-service-badge" style={{ background: colorInfo.color }}>{colorInfo.label}</span></td>
                                <td className="sched-overview-table__time">{hhmm12(s.startTime)} - {hhmm12(s.endTime)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// Matrix view: rows = employee/client, columns = 7 days of the week, cells = shift chips
function ScheduleMatrix({ shifts, weekStart, rowBy, onEditShift, overlapIds, clientColorMap }) {
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];
    const dayHeads = [];
    const ws = new Date(weekStart + 'T00:00:00');
    const todayStr = toLocalDateStr(new Date());
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        const dateStr = toLocalDateStr(d);
        days.push(dateStr);
        dayHeads.push({ abbr: dayAbbr[i], date: d.getDate(), dateStr, isToday: dateStr === todayStr });
    }

    // Group shifts by row key → date → shifts
    const rows = new Map(); // rowKey → { label, cells: { dateStr → shift[] } }
    for (const s of shifts) {
        const rowKey = rowBy === 'employee'
            ? (s.displayEmployeeName || s.employeeName || 'Unassigned')
            : (s.client?.clientName || 'Unknown');
        if (!rows.has(rowKey)) {
            rows.set(rowKey, { label: rowKey, cells: {} });
        }
        const row = rows.get(rowKey);
        const dateStr = toLocalDateStr(s.shiftDate);
        if (!row.cells[dateStr]) row.cells[dateStr] = [];
        row.cells[dateStr].push(s);
    }

    const rowList = Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label));

    if (rowList.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: 24, color: 'hsl(var(--muted-foreground))' }}>
                No shifts scheduled this week.
            </div>
        );
    }

    return (
        <div className="sched-matrix-wrap">
            <table className="sched-matrix">
                <thead>
                    <tr>
                        <th className="sched-matrix__row-head">{rowBy === 'employee' ? 'Employee' : 'Client'}</th>
                        {dayHeads.map((dh) => (
                            <th key={dh.dateStr} className={`sched-matrix__day-head${dh.isToday ? ' sched-matrix__day-head--today' : ''}`}>
                                <span className="sched-matrix__day-abbr">{dh.abbr}</span>
                                <span className="sched-matrix__day-num">{dh.date}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rowList.map((row) => {
                        const rowCC = rowBy === 'client' && clientColorMap && Object.keys(clientColorMap).length > 1 ? clientColorMap[row.label] : null;
                        return (
                        <tr key={row.label}>
                            <td className="sched-matrix__row-label">
                                {rowCC && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: rowCC.color, marginRight: 6, verticalAlign: 'middle' }} />}
                                {row.label}
                            </td>
                            {days.map((dateStr) => {
                                const cellShifts = row.cells[dateStr] || [];
                                const isToday = dateStr === todayStr;
                                return (
                                    <td key={dateStr} className={`sched-matrix__cell${isToday ? ' sched-matrix__cell--today' : ''}${cellShifts.length === 0 ? ' sched-matrix__cell--empty' : ''}`}>
                                        {cellShifts.length === 0 ? (
                                            <span className="sched-matrix__cell-placeholder">·</span>
                                        ) : cellShifts.map((s) => {
                                            const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: s.serviceCode };
                                            const isOverlap = overlapIds && overlapIds.has(s.id);
                                            const isCancelled = s.status === 'cancelled';
                                            const label = rowBy === 'employee'
                                                ? (s.client?.clientName || '—')
                                                : (s.displayEmployeeName || 'Unassigned');
                                            const cc = clientColorMap && Object.keys(clientColorMap).length > 1 && s.client?.clientName ? clientColorMap[s.client.clientName] : null;
                                            return (
                                                <button
                                                    key={s.id}
                                                    className={`sched-matrix__chip ${isCancelled ? 'sched-matrix__chip--cancelled' : ''} ${isOverlap ? 'sched-matrix__chip--overlap' : ''}`}
                                                    style={{
                                                        '--chip-color': cc ? cc.color : colorInfo.color,
                                                        background: cc ? cc.bg : undefined,
                                                    }}
                                                    onClick={() => onEditShift(s)}
                                                    title={`${label} — ${colorInfo.label} — ${hhmm12(s.startTime)} - ${hhmm12(s.endTime)}`}
                                                >
                                                    <span className="sched-matrix__chip-name">{label}</span>
                                                    <span className="sched-matrix__chip-meta">
                                                        <span className="sched-matrix__chip-time">{hhmm12(s.startTime)}–{hhmm12(s.endTime)}</span>
                                                        <span className="sched-matrix__chip-service">{colorInfo.label}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </td>
                                );
                            })}
                        </tr>
                    );})}
                </tbody>
            </table>
        </div>
    );
}

export default function SchedulingPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);

    // Global week data (drives bottom overview table + summary)
    const [allShifts, setAllShifts] = useState([]);
    const [allOverlaps, setAllOverlaps] = useState([]);
    const [unitSummaries, setUnitSummaries] = useState({});
    const [loadingAll, setLoadingAll] = useState(true);

    // Top-left: selected client's schedule
    const [selectedClientId, setSelectedClientId] = useState('');
    const [clientShifts, setClientShifts] = useState([]);
    const [clientOverlaps, setClientOverlaps] = useState([]);
    const [clientInfo, setClientInfo] = useState(null);
    const [clientUnitSummary, setClientUnitSummary] = useState({});
    const [loadingClient, setLoadingClient] = useState(false);

    // Top-right: selected employee's schedule
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeShifts, setEmployeeShifts] = useState([]);
    const [employeeOverlaps, setEmployeeOverlaps] = useState([]);
    const [employeeInfo, setEmployeeInfo] = useState(null);
    const [loadingEmployee, setLoadingEmployee] = useState(false);

    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return toLocalDateStr(d);
    });
    const [modal, setModal] = useState(null);
    const createDraftRef = useRef(null);
    const [summaryViewBy, setSummaryViewBy] = useState('client');

    // Build client color maps for visual distinction
    const allClientColorMap = useMemo(() => buildClientColorMap(allShifts), [allShifts]);
    const employeeClientColorMap = useMemo(() => buildClientColorMap(employeeShifts), [employeeShifts]);

    const fetchClients = useCallback(async () => {
        try {
            const data = await api.getClients();
            data.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
            setClients(data);
        } catch (_) { /* silent */ }
    }, []);

    const fetchEmployees = useCallback(async () => {
        try {
            const data = await api.getEmployees({ active: 'true' });
            data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setEmployees(data);
        } catch (err) { showToast(err.message, 'error'); }
    }, [showToast]);

    const fetchAllShifts = useCallback(async () => {
        try {
            setLoadingAll(true);
            const data = await api.getShifts(weekStart, {});
            setAllShifts(data.shifts || []);
            setAllOverlaps(data.overlaps || []);
            setUnitSummaries(data.unitSummaries || {});
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingAll(false); }
    }, [weekStart, showToast]);

    const fetchClientSchedule = useCallback(async () => {
        if (!selectedClientId) {
            setClientShifts([]);
            setClientOverlaps([]);
            setClientInfo(null);
            setClientUnitSummary({});
            return;
        }
        try {
            setLoadingClient(true);
            const data = await api.getClientSchedule(selectedClientId, weekStart);
            setClientShifts(data.shifts || []);
            setClientOverlaps(data.overlaps || []);
            setClientInfo(data.client || null);
            setClientUnitSummary(data.unitSummary || {});
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingClient(false); }
    }, [selectedClientId, weekStart, showToast]);

    const fetchEmployeeSchedule = useCallback(async () => {
        if (!selectedEmployeeId) {
            setEmployeeShifts([]);
            setEmployeeOverlaps([]);
            setEmployeeInfo(null);
            return;
        }
        try {
            setLoadingEmployee(true);
            const data = await api.getEmployeeSchedule(selectedEmployeeId, weekStart);
            setEmployeeShifts(data.shifts || []);
            setEmployeeOverlaps(data.overlaps || []);
            setEmployeeInfo(data.employee || null);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingEmployee(false); }
    }, [selectedEmployeeId, weekStart, showToast]);

    const refetchAll = useCallback(() => {
        fetchAllShifts();
        fetchClientSchedule();
        fetchEmployeeSchedule();
    }, [fetchAllShifts, fetchClientSchedule, fetchEmployeeSchedule]);

    useEffect(() => { fetchClients(); }, [fetchClients]);
    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
    useEffect(() => { fetchAllShifts(); }, [fetchAllShifts]);
    useEffect(() => { fetchClientSchedule(); }, [fetchClientSchedule]);
    useEffect(() => { fetchEmployeeSchedule(); }, [fetchEmployeeSchedule]);

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
                const count = result.count || (result.shifts ? result.shifts.length : 0);
                if (count > 1) showToast(`${count} shifts created`);
                else showToast('Shift created');
            }
            setModal(null);
            createDraftRef.current = null;
            refetchAll();
            fetchEmployees();
        } catch (err) {
            if (err.isOverlap) {
                setModal(prev => ({ ...prev, overlapWarning: err.message, overlapData: data, overlapConflicts: err.conflicts }));
            } else {
                showToast(err.message, 'error');
            }
        }
    };

    const handleRepeatShift = async (shiftId, data) => {
        try {
            const result = await api.repeatShift(shiftId, data);
            showToast(`${result.count} weekly shift${result.count !== 1 ? 's' : ''} created`);
            refetchAll();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDeleteShift = async (shiftId, deleteGroup = false) => {
        try {
            const result = await api.deleteShift(shiftId, { group: deleteGroup });
            const count = result?.archived || 1;
            setModal(null);
            refetchAll();
            if (!deleteGroup) {
                showUndoToast('Shift archived', async () => {
                    await api.restoreShift(shiftId);
                    refetchAll();
                });
            } else {
                showToast(`${count} shift(s) archived`);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAllShifts = async () => {
        try {
            await api.deleteAllShifts();
            showToast('All shifts archived');
            refetchAll();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleAddShift = (dateStr, startTime) => {
        setModal({ type: 'shift', shift: null, defaultDate: dateStr, defaultStartTime: startTime });
    };

    const handleEditShift = (shift) => {
        setModal({ type: 'shift', shift });
    };

    const allOverlapIds = useMemo(() => {
        const set = new Set();
        for (const o of allOverlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [allOverlaps]);

    const clientOverlapIds = useMemo(() => {
        const set = new Set();
        for (const o of clientOverlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [clientOverlaps]);

    const employeeOverlapIds = useMemo(() => {
        const set = new Set();
        for (const o of employeeOverlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [employeeOverlaps]);

    const formatWeekLabel = () => {
        const ws = new Date(weekStart + 'T00:00:00');
        const opts = { month: 'short', day: 'numeric' };
        return `${ws.toLocaleDateString('en-US', opts)} — ${weekEndDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
    };

    return (
        <>
            {/* Header */}
            <div className="content-header">
                <h1 className="content-header__title">Scheduling</h1>
                <div className="content-header__actions">
                    {isAdmin && <ActivityButton entityType="Shift" />}
                    {allShifts.length > 0 && (
                        <button className="btn btn--outline btn--sm" style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 80%)' }} onClick={() => setModal({ type: 'confirmDeleteAll' })}>
                            {Icons.trash} Delete All
                        </button>
                    )}
                    <button className="btn btn--outline btn--sm" title="Send Schedule (Coming Soon)" disabled>
                        {Icons.share} Send Schedule
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'shift', shift: null })}>
                        {Icons.plus} Create Shift
                    </button>
                </div>
            </div>

            <div className="page-content">
                {/* Week Nav */}
                <div className="sched-toolbar">
                    <div className="sched-week-nav">
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(-1)}>{Icons.chevronLeft}</button>
                        <button className="btn btn--outline btn--sm" onClick={goToday}>Today</button>
                        <span className="sched-week-nav__label">{formatWeekLabel()}</span>
                        <button className="btn btn--outline btn--sm" onClick={() => navigateWeek(1)}>{Icons.chevronRight}</button>
                    </div>
                </div>

                {/* Overlap Warnings */}
                {allOverlaps.length > 0 && (
                    <div className="sched-overlap-warning">
                        {Icons.alertTriangle}
                        <div>
                            <strong>Overlap{allOverlaps.length > 1 ? 's' : ''} Detected ({allOverlaps.length})</strong>
                            <div>{allOverlaps.map((o, i) => <div key={i}>{o.employeeName} — {o.date}</div>)}</div>
                        </div>
                    </div>
                )}

                {/* Dashboard Row: Client Card + Employee Card side-by-side */}
                <div className="sched-dashboard-row">
                    <ScheduleCard
                        title="Client Schedule"
                        icon={Icons.users}
                        showPdf={!!selectedClientId && clientShifts.length > 0}
                        pdfShifts={clientShifts}
                        pdfWeekStart={weekStart}
                        pdfRowBy="employee"
                        headerActions={
                            <SearchableSelect
                                className="sched-card__select"
                                options={clients.map(c => ({ value: c.id, label: c.clientName }))}
                                value={selectedClientId}
                                onChange={setSelectedClientId}
                                placeholder="Search clients…"
                            />
                        }
                    >
                        {!selectedClientId ? (
                            <div className="sched-prompt">
                                {Icons.user}
                                <div>Select a client to view their weekly schedule.</div>
                            </div>
                        ) : loadingClient ? (
                            <div className="sched-prompt">Loading…</div>
                        ) : (
                            <>
                                {clientInfo && (
                                    <div className="sched-client-info">
                                        <div className="sched-client-info__details">
                                            {clientInfo.address && <span className="sched-client-info__tag">{Icons.layoutDashboard} <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientInfo.address)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>{clientInfo.address}</a></span>}
                                            {clientInfo.phone && <span className="sched-client-info__tag">{Icons.user} {clientInfo.phone}</span>}
                                            {clientInfo.gateCode && <span className="sched-client-info__tag sched-client-info__tag--gate">Gate: {clientInfo.gateCode}</span>}
                                        </div>
                                        {clientInfo.notes && <div className="sched-client-info__notes">{clientInfo.notes}</div>}
                                    </div>
                                )}
                                {Object.keys(clientUnitSummary).length > 0 && (
                                    <table className="sched-auth-table">
                                        <thead>
                                            <tr>
                                                <th>Service</th>
                                                <th>Authorized</th>
                                                <th>Scheduled</th>
                                                <th>Remaining</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(clientUnitSummary).map(([code, data]) => {
                                                const colorInfo = SERVICE_COLORS[code] || { color: '#6B7280', label: code };
                                                const authHrs = Math.round((data.authorized / 4) * 100) / 100;
                                                const schedHrs = Math.round((data.scheduled / 4) * 100) / 100;
                                                const remainHrs = Math.round(((data.authorized - data.scheduled) / 4) * 100) / 100;
                                                return (
                                                    <tr key={code}>
                                                        <td>
                                                            <span className="sched-auth-table__svc">
                                                                <span className="sched-auth-table__dot" style={{ background: colorInfo.color }} />
                                                                {colorInfo.label}
                                                            </span>
                                                        </td>
                                                        <td>{authHrs} hrs</td>
                                                        <td>{schedHrs} hrs</td>
                                                        <td style={{ color: remainHrs < 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{remainHrs} hrs</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                                <ScheduleMatrix shifts={clientShifts} weekStart={weekStart} rowBy="employee" onEditShift={handleEditShift} overlapIds={clientOverlapIds} clientColorMap={null} />
                            </>
                        )}
                    </ScheduleCard>

                    <ScheduleCard
                        title="Employee Schedule"
                        icon={Icons.user}
                        showPdf={!!selectedEmployeeId && employeeShifts.length > 0}
                        pdfShifts={employeeShifts}
                        pdfWeekStart={weekStart}
                        pdfRowBy="client"
                        headerActions={
                            <SearchableSelect
                                className="sched-card__select"
                                options={employees.map(e => ({ value: e.id, label: e.name }))}
                                value={selectedEmployeeId}
                                onChange={setSelectedEmployeeId}
                                placeholder="Search employees…"
                            />
                        }
                    >
                        {!selectedEmployeeId ? (
                            <div className="sched-prompt">
                                {Icons.users}
                                <div>Select an employee to view their weekly schedule.</div>
                            </div>
                        ) : loadingEmployee ? (
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
                                {employeeShifts.length > 0 && (() => {
                                    const activeShifts = employeeShifts.filter(s => s.status !== 'cancelled');
                                    const weeklyHrs = Math.round(activeShifts.reduce((sum, s) => sum + (s.hours || 0), 0) * 100) / 100;

                                    // Daily totals
                                    const ws = new Date(weekStart + 'T00:00:00');
                                    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                    const dailyTotals = [];
                                    for (let i = 0; i < 7; i++) {
                                        const d = new Date(ws);
                                        d.setDate(ws.getDate() + i);
                                        const dateStr = toLocalDateStr(d);
                                        const dayHrs = activeShifts.filter(s => toLocalDateStr(s.shiftDate) === dateStr).reduce((sum, s) => sum + (s.hours || 0), 0);
                                        dailyTotals.push({ abbr: dayAbbr[i], hrs: Math.round(dayHrs * 100) / 100 });
                                    }

                                    // Per-client breakdown
                                    const clientMap = new Map();
                                    for (const s of activeShifts) {
                                        const name = s.client?.clientName || 'Unknown';
                                        clientMap.set(name, (clientMap.get(name) || 0) + (s.hours || 0));
                                    }
                                    const clientBreakdown = [...clientMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, hrs]) => ({ name, hrs: Math.round(hrs * 100) / 100 }));

                                    return (
                                        <div className="sched-emp-totals">
                                            <div className="sched-emp-totals__weekly">
                                                <span className="sched-emp-totals__weekly-label">Weekly Total</span>
                                                <span className="sched-emp-totals__weekly-value">{weeklyHrs} hrs</span>
                                            </div>
                                            <div className="sched-emp-totals__daily">
                                                {dailyTotals.map(d => (
                                                    <div key={d.abbr} className={`sched-emp-totals__day ${d.hrs > 0 ? 'sched-emp-totals__day--active' : ''}`}>
                                                        <span className="sched-emp-totals__day-name">{d.abbr}</span>
                                                        <span className="sched-emp-totals__day-hrs">{d.hrs > 0 ? `${d.hrs}h` : '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {clientBreakdown.length > 0 && (
                                                <div className="sched-emp-totals__clients">
                                                    <span className="sched-emp-totals__clients-label">Per Client</span>
                                                    {clientBreakdown.map(c => (
                                                        <div key={c.name} className="sched-emp-totals__client-row">
                                                            <span>{c.name}</span>
                                                            <span className="sched-emp-totals__client-hrs">{c.hrs} hrs</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                <ScheduleMatrix shifts={employeeShifts} weekStart={weekStart} rowBy="client" onEditShift={handleEditShift} overlapIds={employeeOverlapIds} clientColorMap={employeeClientColorMap} />
                            </>
                        )}
                    </ScheduleCard>
                </div>

                {/* Weekly Schedule Overview (always global) */}
                <ScheduleCard
                    title="Weekly Schedule Overview"
                    icon={Icons.table}
                    showPdf={allShifts.length > 0}
                    pdfShifts={allShifts}
                    pdfWeekStart={weekStart}
                    pdfRowBy="client"
                    headerActions={
                        <div className="sched-view-toggle">
                            <span className="sched-view-toggle__label">View By:</span>
                            <button className={`sched-view-toggle__btn ${summaryViewBy === 'client' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setSummaryViewBy('client')}>
                                Client
                            </button>
                            <button className={`sched-view-toggle__btn ${summaryViewBy === 'employee' ? 'sched-view-toggle__btn--active' : ''}`} onClick={() => setSummaryViewBy('employee')}>
                                Employee
                            </button>
                        </div>
                    }
                >
                    {loadingAll ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'hsl(var(--muted-foreground))' }}>Loading shifts…</div>
                    ) : allShifts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>
                            No shifts scheduled this week. Click + Create Shift to get started.
                        </div>
                    ) : (
                        <ScheduleOverviewTable shifts={allShifts} overlapIds={allOverlapIds} onEditShift={handleEditShift} clientColorMap={allClientColorMap} />
                    )}
                </ScheduleCard>

                {/* Schedule Delivery */}
                <ScheduleDelivery weekStart={weekStart} shifts={allShifts} />

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
            {modal?.type === 'shift' && (
                <ShiftFormModal
                    shift={modal.shift}
                    defaultDate={modal.defaultDate}
                    defaultStartTime={modal.defaultStartTime}
                    defaultClientId={selectedClientId || ''}
                    defaultEmployeeId={selectedEmployeeId || ''}
                    clients={clients}
                    employees={employees}
                    weekStart={weekStart}
                    onSave={handleSaveShift}
                    onRepeat={handleRepeatShift}
                    onDelete={handleDeleteShift}
                    onClose={(draft) => {
                        if (draft && !modal.shift) createDraftRef.current = draft;
                        setModal(null);
                    }}
                    draft={!modal.shift ? createDraftRef.current : null}
                    onClearDraft={() => { createDraftRef.current = null; }}
                />
            )}

            {/* Overlap Error Modal — renders on top of the shift form so form state is preserved */}
            {modal?.type === 'shift' && modal.overlapWarning && (
                <div className="modal-backdrop" style={{ zIndex: 110 }} onClick={e => e.target === e.currentTarget && setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}><div className="modal">
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#ef4444' }}>{Icons.alertTriangle}</span> Overlap Detected
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
                            Please fix the scheduling conflict before saving. A PCA cannot be scheduled for multiple clients at the same time.
                        </p>
                    </div>
                    <div className="form-actions">
                        <button className="btn" onClick={() => setModal(prev => ({ ...prev, overlapWarning: null, overlapData: null, overlapConflicts: null }))}>
                            Go Back & Fix
                        </button>
                    </div>
                </div></div>
            )}

            {/* Delete All Confirmation Modal */}
            {modal?.type === 'confirmDeleteAll' && (
                <Modal onClose={() => setModal(null)}>
                    <h2 className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertTriangle}</span> Delete All Shifts
                    </h2>
                    <p style={{ fontSize: 14, color: 'hsl(var(--foreground))', margin: '8px 0 16px' }}>
                        This will permanently delete <strong>all {allShifts.length} shift{allShifts.length !== 1 ? 's' : ''}</strong>. This action cannot be undone.
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
