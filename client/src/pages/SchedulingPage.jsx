import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { hhmm12 } from '../utils/time';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useNearbyEmployees, conflictLabel } from '../hooks/useNearbyEmployees';
import ScheduleDelivery from './scheduling/ScheduleDelivery';
import MonthlyCalendarView from './scheduling/MonthlyCalendarView';
import FutureShiftsView from './scheduling/FutureShiftsView';
import CalloutPanel from './scheduling/CalloutPanel';
import { getAccountForCategory, ACCOUNT_NUMBER_OPTIONS } from '../utils/accountMapping';
import UndoBanner from '../components/common/UndoBanner';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import DateSelectionPanel from './scheduling/DateSelectionPanel';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import { useUndoStack } from '../hooks/useUndoStack';
import { SERVICE_COLORS, DAY_NAMES_SHORT } from '../utils/constants';
import { CLIENT_COLORS } from '../utils/ui';
import { deriveServiceCode } from '../utils/serviceCodes';
import { toLocalDateStr } from '../utils/dates';

function buildClientColorMap(shifts) {
    const names = [...new Set(shifts.map(s => s.client?.clientName).filter(Boolean))].sort();
    const map = {};
    names.forEach((name, i) => {
        map[name] = CLIENT_COLORS[i % CLIENT_COLORS.length];
    });
    return map;
}


// Reusable searchable dropdown for Client/Employee selection
import SearchableSelect from '../components/common/SearchableSelect';

// Helper: get YYYY-MM-DD from a date value.

function ShiftFormModal({ shift, clients, employees, onSave, onRepeat, onDelete, onClose, onFindCover, defaultDate, defaultClientId, defaultEmployeeId, defaultStartTime, weekStart: propWeekStart, draft, onClearDraft }) {
    const DAY_NAMES = DAY_NAMES_SHORT;
    const isEdit = !!shift;

    // Shared fields — restore from draft if available (create mode only)
    const d = !isEdit && draft;
    const [clientId, setClientId] = useState(defaultClientId || d?.clientId || shift?.clientId || '');
    const [employeeId, setEmployeeId] = useState(defaultEmployeeId || d?.employeeId || shift?.employeeId || '');
    const [notes, setNotes] = useState(d?.notes || shift?.notes || '');
    const [status, setStatus] = useState(shift?.status || 'scheduled');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleteScope, setDeleteScope] = useState('this'); // 'this' | 'future' | 'all'
    const [accountNumber, setAccountNumber] = useState(d?.accountNumber || shift?.accountNumber || '');
    const [sandataClientId, setSandataClientId] = useState(d?.sandataClientId || shift?.sandataClientId || '');

    // Employee search
    const [empSearch, setEmpSearch] = useState(() => {
        if (defaultEmployeeId) { const e = employees.find(e => e.id === Number(defaultEmployeeId)); if (e) return e.name; }
        if (d?.empSearch) return d.empSearch;
        if (shift?.employeeId) { const e = employees.find(e => e.id === shift.employeeId); return e ? e.name : ''; }
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

    function deriveCode(auth) {
        if (auth.serviceCode && auth.serviceCode !== 'TIMESHEETS') return auth.serviceCode;
        const derived = deriveServiceCode(auth.serviceName);
        if (derived) return derived;
        return auth.serviceCode === 'TIMESHEETS' ? 'TIMESHEETS' : null;
    }

    const authorizedServiceMap = useMemo(() => {
        if (!selectedClient?.authorizations?.length) return {};
        const now = new Date();
        const map = {};
        for (const auth of selectedClient.authorizations) {
            if ((auth.manualStatus || 'active') !== 'active') continue;
            if (auth.archivedAt) continue;
            if (auth.authorizationEndDate && new Date(auth.authorizationEndDate) < now) continue;
            const code = deriveCode(auth);
            if (!code) continue;
            if (!map[code]) map[code] = { units: 0, category: '', accountNumber: '', sandataClientId: '' };
            map[code].units += auth.authorizedUnits || 0;
            if (auth.serviceCategory && !map[code].category) {
                map[code].category = auth.serviceCategory;
            }
            if (auth.accountNumber && !map[code].accountNumber) {
                map[code].accountNumber = auth.accountNumber;
            }
            if (auth.sandataClientId && !map[code].sandataClientId) {
                map[code].sandataClientId = auth.sandataClientId;
            }
        }
        return map;
    }, [selectedClient]);

    const authorizedServices = useMemo(() => {
        const keys = Object.keys(authorizedServiceMap);
        if (!keys.includes('TIMESHEETS')) keys.push('TIMESHEETS');
        return keys;
    }, [authorizedServiceMap]);

    const handleServiceCodeChange = (newCode) => {
        setServiceCode(newCode);
        const authInfo = authorizedServiceMap[newCode];
        if (authInfo) {
            if (authInfo.accountNumber && (!accountNumber || ACCOUNT_NUMBER_OPTIONS.includes(accountNumber))) {
                setAccountNumber(authInfo.accountNumber);
            } else if (!accountNumber && authInfo.category) {
                const catAccount = getAccountForCategory(authInfo.category);
                if (catAccount) setAccountNumber(catAccount);
            }
            if (authInfo.sandataClientId && !sandataClientId) {
                setSandataClientId(authInfo.sandataClientId);
            }
        }
    };

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

    const defaultShift = () => ({ serviceCode: 'PCS', startTime: defaultStartTime || '09:00', endTime: '13:00', accountNumber: accountNumber || '', sandataClientId: '' });
    const [dayEntries, setDayEntries] = useState(() =>
        d?.dayEntries || DAY_NAMES.map((_, i) => ({
            enabled: defaultDate ? weekDates[i] === defaultDate : false,
            shifts: [defaultShift()],
        }))
    );

    const [recurring, setRecurring] = useState(d?.recurring || false);
    const [repeatUntil, setRepeatUntil] = useState(d?.repeatUntil || '');

    // Edit mode: repeat weekly (retroactive)
    const [editRepeat, setEditRepeat] = useState(false);
    const [editRepeatUntil, setEditRepeatUntil] = useState('');

    const [authInfo, setAuthInfo] = useState(null);

    const updateDayEntry = (dayIdx, field, value) => {
        setDayEntries(prev => prev.map((e, i) => i === dayIdx ? { ...e, [field]: value } : e));
    };
    const updateDayShift = (dayIdx, shiftIdx, field, value) => {
        setDayEntries(prev => prev.map((day, i) => {
            if (i !== dayIdx) return day;
            const newShifts = day.shifts.map((s, si) => si === shiftIdx ? { ...s, [field]: value } : s);
            return { ...day, shifts: newShifts };
        }));
    };
    const addDayShift = (dayIdx) => {
        setDayEntries(prev => prev.map((day, i) => {
            if (i !== dayIdx) return day;
            const last = day.shifts[day.shifts.length - 1];
            return { ...day, shifts: [...day.shifts, { serviceCode: last.serviceCode, startTime: last.endTime, endTime: '', accountNumber: last.accountNumber, sandataClientId: last.sandataClientId }] };
        }));
    };
    const removeDayShift = (dayIdx, shiftIdx) => {
        setDayEntries(prev => prev.map((day, i) => {
            if (i !== dayIdx || day.shifts.length <= 1) return day;
            return { ...day, shifts: day.shifts.filter((_, si) => si !== shiftIdx) };
        }));
    };

    const enabledCount = dayEntries.filter(d => d.enabled).length;

    const applyToAll = (sourceIdx) => {
        const src = dayEntries[sourceIdx];
        setDayEntries(prev => prev.map((e, i) => e.enabled && i !== sourceIdx ? { ...e, shifts: src.shifts.map(s => ({ ...s })) } : e));
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

    useEffect(() => {
        if (authorizedServices.length > 0 && !authorizedServices.includes(serviceCode)) {
            setServiceCode(authorizedServices[0]);
        }
        if (authorizedServices.length > 0) {
            setDayEntries(prev => prev.map(day => ({
                ...day,
                shifts: day.shifts.map(s => ({
                    ...s,
                    serviceCode: authorizedServices.includes(s.serviceCode) ? s.serviceCode : authorizedServices[0],
                })),
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

    // Proximity ranking needs ONE concrete date + time window. Edit mode has
    // exactly that; create mode spreads shifts across days, so use the first
    // enabled day as the representative window.
    const rankingWindow = (() => {
        if (isEdit) return { date: shiftDate, startTime, endTime };
        const idx = dayEntries.findIndex(d => d.enabled);
        if (idx === -1) return { date: '', startTime: '', endTime: '' };
        const first = dayEntries[idx].shifts?.[0];
        return { date: weekDates[idx], startTime: first?.startTime || '', endTime: first?.endTime || '' };
    })();

    const { ranked } = useNearbyEmployees({
        clientId,
        serviceCode,
        date: rankingWindow.date,
        startTime: rankingWindow.startTime,
        endTime: rankingWindow.endTime,
    });

    const nameMatch = e => e.name.toLowerCase().includes(empSearch.toLowerCase());
    const filteredEmployees = employees.filter(nameMatch);

    // Availability outranks proximity: eligible and ineligible are kept as two
    // separate groups so a closer-but-double-booked caregiver can never appear
    // above one who is actually free. Ranking REORDERS the list; it never
    // removes anyone, and free-text search still filters both groups.
    const rankedGroups = (() => {
        if (!ranked) return null;
        const byId = new Map(employees.map(e => [e.id, e]));
        const hydrate = list => (list || [])
            .map(c => ({ ...c, employee: byId.get(c.employeeId) }))
            .filter(c => c.employee && nameMatch(c.employee));
        const available = hydrate(ranked.eligible);
        const unavailable = hydrate(ranked.ineligible);
        if (available.length === 0 && unavailable.length === 0) return null;
        return { available, unavailable };
    })();

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

    const totalCreateUnits = dayEntries.reduce((sum, day) => {
        if (!day.enabled) return sum;
        return sum + day.shifts.reduce((s2, sh) => s2 + computeHrs(sh.startTime, sh.endTime).units, 0);
    }, 0);
    const totalCreateHours = dayEntries.reduce((sum, day) => {
        if (!day.enabled) return sum;
        return sum + day.shifts.reduce((s2, sh) => s2 + computeHrs(sh.startTime, sh.endTime).hours, 0);
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
            shifts: [defaultShift()],
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
                // Multi-day bulk create (supports multiple shifts per day)
                const bulkShifts = [];
                for (let i = 0; i < 7; i++) {
                    if (!dayEntries[i].enabled) continue;
                    for (const sh of dayEntries[i].shifts) {
                        const entry = { serviceCode: sh.serviceCode, shiftDate: weekDates[i], startTime: sh.startTime, endTime: sh.endTime, accountNumber: sh.accountNumber || '', sandataClientId: sh.sandataClientId || '' };
                        bulkShifts.push(entry);
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
                        {clientId && authorizedServices.length === 0 && selectedClient?.authorizations?.length > 0 && (
                            <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>This client has no active authorizations. Cannot create shifts.</p>
                        )}
                        {clientId && authorizedServices.length === 0 && (!selectedClient?.authorizations?.length) && (
                            <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>Timesheet client — no authorization limits apply.</p>
                        )}
                    </div>
                    <div className="form-group" ref={empRef} style={{ position: 'relative' }}>
                        <label htmlFor="shiftEmployee">
                            Employee
                            {/* Ranking needs a client, day and time window before it can say
                                who is free. Without this hint the ordering silently never
                                appears, because the day grid sits below this field. */}
                            {clientId && !rankedGroups && (
                                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>
                                    pick a day and time below to sort by availability &amp; distance
                                </span>
                            )}
                        </label>
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
                                borderRadius: 'var(--radius)', maxHeight: 280, overflowY: 'auto',
                                margin: 0, padding: 0, listStyle: 'none',
                                boxShadow: '0 4px 16px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.04)',
                            }}>
                                {filteredEmployees.length === 0 && empSearch.trim() && (
                                    <li onClick={() => { setEmployeeId(''); setCreatingNewEmp(true); setEmpDropdownOpen(false); }}
                                        style={{ padding: '8px 12px', fontSize: 13, color: 'hsl(142 71% 45%)', cursor: 'pointer' }}>
                                        + Create "{empSearch.trim()}" as new employee
                                    </li>
                                )}
                                {/* Unranked fallback: shown until the shift has a client, date and
                                    both times — the app must not imply it has checked availability
                                    before it knows when the shift is. Also the degraded path when
                                    the lookup fails or no addresses are geocoded. */}
                                {!rankedGroups && filteredEmployees.map(e => (
                                    <li key={e.id}
                                        onClick={() => { setEmployeeId(String(e.id)); setEmpSearch(e.name); setCreatingNewEmp(false); setNewEmpEmail(''); setEmpDropdownOpen(false); }}
                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, background: String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : undefined }}
                                        onMouseEnter={ev => ev.currentTarget.style.background = 'hsl(var(--muted))'}
                                        onMouseLeave={ev => ev.currentTarget.style.background = String(e.id) === String(employeeId) ? 'hsl(var(--muted))' : ''}>
                                        {e.name}
                                    </li>
                                ))}

                                {rankedGroups && ['available', 'unavailable'].map(group => {
                                    const rows = rankedGroups[group];
                                    if (rows.length === 0) return null;
                                    const isAvailable = group === 'available';
                                    return (
                                        <React.Fragment key={group}>
                                            <li style={{
                                                padding: '6px 12px', fontSize: 10, fontWeight: 600,
                                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                                color: 'hsl(var(--muted-foreground))',
                                                background: 'hsl(var(--muted))',
                                                borderTop: isAvailable ? 'none' : '1px solid hsl(var(--border))',
                                                position: 'sticky', top: 0,
                                            }}>
                                                {isAvailable ? `Available (${rows.length})` : `Unavailable (${rows.length})`}
                                            </li>
                                            {rows.map(c => {
                                                const selected = String(c.employeeId) === String(employeeId);
                                                return (
                                                    <li key={c.employeeId}
                                                        onClick={() => { setEmployeeId(String(c.employeeId)); setEmpSearch(c.employee.name); setCreatingNewEmp(false); setNewEmpEmail(''); setEmpDropdownOpen(false); }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                                            background: selected ? 'hsl(var(--muted))' : undefined,
                                                        }}
                                                        onMouseEnter={ev => ev.currentTarget.style.background = 'hsl(var(--muted))'}
                                                        onMouseLeave={ev => ev.currentTarget.style.background = selected ? 'hsl(var(--muted))' : ''}>
                                                        <span style={{
                                                            flex: 1, minWidth: 0, whiteSpace: 'nowrap',
                                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                                            // Unavailable stays selectable — schedulers must always be
                                                            // able to assign whoever they want — but reads as secondary.
                                                            color: isAvailable ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                                                        }}>
                                                            {c.employee.name}
                                                            {c.onCareTeam && (
                                                                <span style={{
                                                                    marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                                                                    fontSize: 10, fontWeight: 600,
                                                                    background: 'hsl(var(--primary) / 0.1)',
                                                                    color: 'hsl(var(--primary))',
                                                                }}>Care team</span>
                                                            )}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                                                            color: isAvailable ? 'hsl(var(--muted-foreground))' : 'hsl(var(--danger))',
                                                        }}>
                                                            {isAvailable
                                                                // Un-geocoded shows an em dash, never a conflict —
                                                                // a missing address is a data gap, not unavailability.
                                                                ? (c.distanceMiles == null ? '—' : `${c.distanceMiles.toFixed(1)} mi`)
                                                                : conflictLabel(c.conflicts)}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
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
                                {ACCOUNT_NUMBER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
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
                                    <select id="shiftService" value={serviceCode} onChange={e => handleServiceCodeChange(e.target.value)} style={{ flex: 1 }}>
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
                                {/* Set by the replacement workflow, not chosen manually — listed
                                    only so an in-progress shift does not silently lose the status
                                    when its form is saved. */}
                                {status === 'pending_replacement' && (
                                    <option value="pending_replacement">Pending replacement</option>
                                )}
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
                                const dayEntry = dayEntries[i];
                                const dayTotalHrs = dayEntry.shifts.reduce((s, sh) => s + computeHrs(sh.startTime, sh.endTime).hours, 0);
                                const dayTotalUnits = dayEntry.shifts.reduce((s, sh) => s + computeHrs(sh.startTime, sh.endTime).units, 0);
                                const firstColor = SERVICE_COLORS[dayEntry.shifts[0].serviceCode] || { color: '#6B7280' };
                                return (
                                    <div key={i} className={`sched-day-row ${dayEntry.enabled ? 'sched-day-row--active' : ''}`}>
                                        <div className="sched-day-row__header">
                                            <label className="sched-day-row__toggle">
                                                <input type="checkbox" checked={dayEntry.enabled} onChange={e => updateDayEntry(i, 'enabled', e.target.checked)} />
                                                <span className="sched-day-row__day">{day}</span>
                                                <span className="sched-day-row__date">{weekDates[i].slice(5)}</span>
                                            </label>
                                            {dayEntry.enabled && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="sched-day-row__badge" style={{ background: `color-mix(in srgb, ${firstColor.color} 15%, white)`, color: firstColor.color }}>
                                                        {dayTotalHrs}h / {dayTotalUnits}u
                                                    </span>
                                                    <button type="button" className="sched-day-row__add-shift" title="Add another shift" onClick={() => addDayShift(i)}>+</button>
                                                </div>
                                            )}
                                        </div>
                                        {dayEntry.enabled && dayEntry.shifts.map((sh, si) => {
                                            const shColorInfo = SERVICE_COLORS[sh.serviceCode] || { color: '#6B7280', label: sh.serviceCode };
                                            return (
                                                <div key={si} className="sched-day-row__fields">
                                                    {dayEntry.shifts.length > 1 && (
                                                        <div className="sched-day-row__shift-label">
                                                            <span>Shift {si + 1}</span>
                                                            <button type="button" className="sched-day-row__remove-shift" title="Remove shift" onClick={() => removeDayShift(i, si)}>&times;</button>
                                                        </div>
                                                    )}
                                                    <div className="sched-day-row__field">
                                                        <label className="sched-day-row__field-label">Service</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: shColorInfo.color, flexShrink: 0 }} />
                                                            <select value={sh.serviceCode} onChange={e => updateDayShift(i, si, 'serviceCode', e.target.value)} className="sched-day-row__input">
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
                                                        <input type="time" value={sh.startTime} onChange={e => updateDayShift(i, si, 'startTime', e.target.value)} className="sched-day-row__input" required />
                                                    </div>
                                                    <div className="sched-day-row__field">
                                                        <label className="sched-day-row__field-label">End</label>
                                                        <input type="time" value={sh.endTime} onChange={e => updateDayShift(i, si, 'endTime', e.target.value)} className="sched-day-row__input" required />
                                                    </div>
                                                    <div className="sched-day-row__field">
                                                        <label className="sched-day-row__field-label">Account</label>
                                                        <select value={sh.accountNumber} onChange={e => updateDayShift(i, si, 'accountNumber', e.target.value)} className="sched-day-row__input">
                                                            <option value="">—</option>
                                                            {ACCOUNT_NUMBER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="sched-day-row__field">
                                                        <label className="sched-day-row__field-label">Sandata Client ID</label>
                                                        <input value={sh.sandataClientId} onChange={e => updateDayShift(i, si, 'sandataClientId', e.target.value)} className="sched-day-row__input" placeholder="—" />
                                                    </div>
                                                    {si === 0 && enabledCount > 1 && (
                                                        <button type="button" className="sched-day-row__apply" title="Apply this day's shifts to all selected days" onClick={() => applyToAll(i)}>
                                                            Apply to all
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                    {isEdit && confirmDelete && !shift.recurringGroupId && (
                        <div style={{ display: 'flex', gap: 6, marginRight: 'auto' }}>
                            <button type="button" className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => onDelete(shift.id, { scope: 'this' })}>
                                Delete This Shift
                            </button>
                            <button type="button" className="btn btn--outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
                        </div>
                    )}
                    {isEdit && confirmDelete && shift.recurringGroupId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginRight: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="radio" name="deleteScope" checked={deleteScope === 'this'} onChange={() => setDeleteScope('this')} />
                                    <span>This shift only</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="radio" name="deleteScope" checked={deleteScope === 'future'} onChange={() => setDeleteScope('future')} />
                                    <span>This &amp; all future occurrences</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="radio" name="deleteScope" checked={deleteScope === 'all'} onChange={() => setDeleteScope('all')} />
                                    <span style={{ color: 'hsl(0 72% 45%)' }}>All occurrences (incl. past) ⚠</span>
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" className="btn" style={{ background: 'hsl(0 84% 60%)', color: '#fff' }} onClick={() => onDelete(shift.id, { scope: deleteScope })}>
                                    Delete
                                </button>
                                <button type="button" className="btn btn--outline" onClick={() => { setConfirmDelete(false); setDeleteScope('this'); }}>Cancel</button>
                            </div>
                        </div>
                    )}
                    {!isEdit && (clientId || employeeId || empSearch || dayEntries.some(de => de.enabled)) && (
                        <button type="button" className="btn btn--outline" style={{ marginRight: 'auto', color: 'hsl(var(--muted-foreground))', fontSize: 12 }} onClick={handleClear}>
                            Clear
                        </button>
                    )}
                    {/* Only offered for an assigned shift — there is nobody to
                        call out of an unassigned one. Hidden while confirming a
                        delete, alongside Cancel/Save. */}
                    {isEdit && !confirmDelete && shift?.employeeId && onFindCover && (
                        <button type="button" className="btn btn--outline" onClick={() => onFindCover(shift)}>
                            {shift.status === 'pending_replacement' ? 'View replacement' : 'Find cover'}
                        </button>
                    )}
                    {/* Hide the normal Cancel/Save while confirming a delete — the delete UI has its own buttons. */}
                    {!confirmDelete && (
                        <>
                            <button type="button" className="btn btn--outline" onClick={handleClose}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || (!isEdit && enabledCount === 0) || (clientId && authorizedServices.length === 0 && selectedClient?.authorizations?.length > 0)}>
                                {saving ? 'Saving…' : isEdit ? 'Update Shift' : `Create ${enabledCount} Shift${enabledCount !== 1 ? 's' : ''}`}
                            </button>
                        </>
                    )}
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

function InlineWeekPicker({ weekStart, setWeekStart }) {
    const ref = useRef(null);
    const ws = new Date(weekStart + 'T00:00:00');
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const label = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const nav = (dir) => { const d = new Date(ws); d.setDate(d.getDate() + dir * 7); setWeekStart(toLocalDateStr(d)); };
    const goToday = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); setWeekStart(toLocalDateStr(d)); };
    return (
        <div className="sched-inline-week-picker">
            <button className="sched-inline-week-picker__btn" onClick={() => nav(-1)}>{Icons.chevronLeft}</button>
            <button className="sched-inline-week-picker__btn" onClick={goToday}>Today</button>
            <button className="sched-inline-week-picker__btn" onClick={() => nav(1)}>{Icons.chevronRight}</button>
            <button className="sched-inline-week-picker__date" onClick={() => ref.current?.showPicker?.()}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>{label}</span>
                <input ref={ref} type="date" value={weekStart} onChange={e => { if (!e.target.value) return; const picked = new Date(e.target.value + 'T00:00:00'); picked.setDate(picked.getDate() - picked.getDay()); setWeekStart(toLocalDateStr(picked)); }} tabIndex={-1} />
            </button>
        </div>
    );
}

function BulkEditInline({ count, employees, clients, onSave, onDelete, saving, selectedShifts = [], onOpenModal }) {
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [clientId, setClientId] = useState('');
    const [serviceCode, setServiceCode] = useState('');
    const [status, setStatus] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmApply, setConfirmApply] = useState(false);

    const handleApply = () => {
        const updates = {};
        if (startTime) updates.startTime = startTime;
        if (endTime) updates.endTime = endTime;
        if (employeeId) updates.employeeId = Number(employeeId);
        if (clientId) updates.clientId = Number(clientId);
        if (serviceCode) updates.serviceCode = serviceCode;
        if (status) updates.status = status;
        if (Object.keys(updates).length === 0) return;
        if (!confirmApply) { setConfirmApply(true); return; }
        onSave(updates);
    };

    const hasChanges = startTime || endTime || employeeId || clientId || serviceCode || status;

    const changeSummary = [
        startTime && `Start → ${startTime}`,
        endTime && `End → ${endTime}`,
        employeeId && `Employee → ${employees.find(e => String(e.id) === employeeId)?.name || employeeId}`,
        clientId && `Client → ${clients.find(c => String(c.id) === clientId)?.clientName || clientId}`,
        serviceCode && `Service → ${serviceCode}`,
        status && `Status → ${status}`,
    ].filter(Boolean);

    const affectedClients = [...new Set(selectedShifts.map(s => s.client?.clientName).filter(Boolean))];
    const affectedEmployees = [...new Set(selectedShifts.map(s => s.displayEmployeeName || s.employee?.name).filter(Boolean))];

    return (
        <div className="sched-bulk-inline">
            <div className="sched-bulk-inline__row">
                <div className="sched-bulk-inline__field">
                    <label>Start Time</label>
                    <input type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setConfirmApply(false); }} />
                </div>
                <div className="sched-bulk-inline__field">
                    <label>End Time</label>
                    <input type="time" value={endTime} onChange={e => { setEndTime(e.target.value); setConfirmApply(false); }} />
                </div>
                <div className="sched-bulk-inline__field">
                    <label>Employee</label>
                    <select value={employeeId} onChange={e => { setEmployeeId(e.target.value); setConfirmApply(false); }}>
                        <option value="">— No change —</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                </div>
                <div className="sched-bulk-inline__field">
                    <label>Client</label>
                    <select value={clientId} onChange={e => { setClientId(e.target.value); setConfirmApply(false); }}>
                        <option value="">— No change —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                    </select>
                </div>
                <div className="sched-bulk-inline__field">
                    <label>Service</label>
                    <select value={serviceCode} onChange={e => { setServiceCode(e.target.value); setConfirmApply(false); }}>
                        <option value="">— No change —</option>
                        {Object.entries(SERVICE_COLORS).map(([code, info]) => <option key={code} value={code}>{info.label}</option>)}
                    </select>
                </div>
                <div className="sched-bulk-inline__field">
                    <label>Status</label>
                    <select value={status} onChange={e => { setStatus(e.target.value); setConfirmApply(false); }}>
                        <option value="">— No change —</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
            </div>
            {confirmApply && (
                <div className="sched-bulk-inline__confirm">
                    <strong>Confirm changes to {count} shift{count !== 1 ? 's' : ''}:</strong>
                    <ul>{changeSummary.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    {affectedClients.length > 1 && (
                        <div className="sched-bulk-inline__scope-warning">
                            {Icons.alertTriangle} <strong>Multiple clients affected:</strong> {affectedClients.join(', ')}
                        </div>
                    )}
                    {affectedEmployees.length > 1 && (
                        <div className="sched-bulk-inline__scope-warning">
                            {Icons.alertTriangle} <strong>Multiple employees affected:</strong> {affectedEmployees.join(', ')}
                        </div>
                    )}
                    <div className="sched-bulk-inline__scope-info">
                        Affects: {affectedClients.length} client{affectedClients.length !== 1 ? 's' : ''}, {affectedEmployees.length} employee{affectedEmployees.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}
            <div className="sched-bulk-inline__actions">
                <button className="btn btn--primary btn--sm" onClick={onOpenModal}>
                    {Icons.edit} Edit Per Day
                </button>
                {confirmApply ? (
                    <>
                        <button className="btn btn--outline btn--sm" onClick={handleApply} disabled={saving}>
                            {saving ? 'Applying…' : `Quick Apply to ${count}`}
                        </button>
                        <button className="btn btn--outline btn--sm" onClick={() => setConfirmApply(false)}>Cancel</button>
                    </>
                ) : (
                    <button className="btn btn--outline btn--sm" onClick={handleApply} disabled={!hasChanges || saving}>
                        {saving ? 'Applying…' : `Quick Apply to ${count}`}
                    </button>
                )}
                {!confirmDelete ? (
                    <button className="btn btn--outline btn--sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setConfirmDelete(true)}>
                        {Icons.trash} Delete Selected
                    </button>
                ) : (
                    <button className="btn btn--sm" style={{ background: '#ef4444', color: 'white', border: 'none' }} onClick={onDelete}>
                        Confirm Delete {count}?
                    </button>
                )}
            </div>
        </div>
    );
}

function BulkEditModal({ allShifts, weekStart, employees, clients, onSave, onDelete, onClose, saving, onUndo, bulkBatches, defaultClientId, defaultEmployeeId }) {
    const DAY_NAMES = DAY_NAMES_SHORT;

    // Filter state — pre-filled from page context if available
    const [filterClientId, setFilterClientId] = useState(defaultClientId || '');
    const [filterEmployeeId, setFilterEmployeeId] = useState(defaultEmployeeId || '');

    // Filtered shifts — empty until user picks a client or employee
    // When a client is selected, show ALL shifts for that client (employee filter is for reassignment target only)
    const filteredShifts = useMemo(() => {
        if (!filterClientId && !filterEmployeeId) return [];
        return allShifts.filter(s => {
            if (filterClientId) return s.clientId === Number(filterClientId);
            if (filterEmployeeId) return (s.employeeId || s.employee?.id) === Number(filterEmployeeId);
            return false;
        });
    }, [allShifts, filterClientId, filterEmployeeId]);

    const ws = new Date(weekStart + 'T00:00:00');
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        weekDates.push(toLocalDateStr(d));
    }

    // Auto-select all filtered shifts when filter/data changes
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    useEffect(() => {
        if (filteredShifts.length > 0) {
            setSelectedIds(new Set(filteredShifts.map(s => s.id)));
        }
    }, [filterClientId, filterEmployeeId, filteredShifts.length]);

    const selectByDay = (dayIdx) => {
        const dateStr = weekDates[dayIdx];
        const dayShiftIds = filteredShifts.filter(s => toLocalDateStr(s.shiftDate) === dateStr).map(s => s.id);
        const allSelected = dayShiftIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            dayShiftIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
            return next;
        });
    };

    const selectedShifts = filteredShifts.filter(s => selectedIds.has(s.id));

    // Group selected shifts by day
    const shiftsByDay = useMemo(() => {
        const grouped = {};
        for (const s of selectedShifts) {
            const dateStr = toLocalDateStr(s.shiftDate);
            if (!grouped[dateStr]) grouped[dateStr] = [];
            grouped[dateStr].push(s);
        }
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    }, [selectedShifts]);

    // Editable state per shift
    const [edits, setEdits] = useState(() => {
        const map = {};
        for (const s of allShifts) {
            map[s.id] = {
                serviceCode: s.serviceCode || 'PCS',
                startTime: s.startTime || '09:00',
                endTime: s.endTime || '13:00',
                accountNumber: s.accountNumber || '',
                sandataClientId: s.sandataClientId || '',
                employeeId: s.employeeId ? String(s.employeeId) : '',
            };
        }
        return map;
    });

    const [applyToFuture, setApplyToFuture] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // ── Option B addition: add / remove shift rows ────────────────────────────
    // Existing shifts stay in `edits`/`selectedShifts`; we only ADD two things:
    //   newRows   — brand-new draft shifts the user added, keyed by day.
    //   removedIds — existing shift ids the user removed with the × (archived on save).
    const newRowSeq = useRef(0);
    const [newRows, setNewRows] = useState({});      // { [dateStr]: [draftRow] }
    const [removedIds, setRemovedIds] = useState(() => new Set());

    const addHour = (hhmm) => {
        // Default a new row's end to 1 hour after its start (avoids a zero-length shift).
        const [h, m] = (hhmm || '09:00').split(':').map(Number);
        const end = (h + 1) % 24;
        return `${String(end).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const seedRowForDay = (dateStr) => {
        // Seed from the last existing/new row on that day for convenience.
        const existing = (shiftsByDay.find(([d]) => d === dateStr)?.[1] || []).filter(s => !removedIds.has(s.id));
        const days = newRows[dateStr] || [];
        const last = days.length ? days[days.length - 1] : (existing.length ? edits[existing[existing.length - 1].id] : null);
        const startTime = last?.endTime || '09:00';
        return {
            _key: `new_${++newRowSeq.current}`,
            serviceCode: last?.serviceCode || 'PCS',
            startTime,
            endTime: addHour(startTime),
            accountNumber: last?.accountNumber || '',
            sandataClientId: last?.sandataClientId || '',
            employeeId: last?.employeeId || (filterEmployeeId ? String(filterEmployeeId) : ''),
        };
    };

    const addShiftToDay = (dateStr) => {
        setNewRows(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] || []), seedRowForDay(dateStr)] }));
    };
    const updateNewRow = (dateStr, key, field, value) => {
        setNewRows(prev => ({
            ...prev,
            [dateStr]: (prev[dateStr] || []).map(r => r._key === key ? { ...r, [field]: value } : r),
        }));
    };
    const removeNewRow = (dateStr, key) => {
        setNewRows(prev => ({ ...prev, [dateStr]: (prev[dateStr] || []).filter(r => r._key !== key) }));
    };
    const markRemoved = (shiftId) => setRemovedIds(prev => new Set(prev).add(shiftId));

    // DateSelectionPanel state
    const [showDateSelect, setShowDateSelect] = useState(false);
    const [dateSelectedIds, setDateSelectedIds] = useState(new Set());
    const [futureSeriesShifts, setFutureSeriesShifts] = useState([]);

    const updateShiftField = (shiftId, field, value) => {
        setEdits(prev => {
            const next = { ...prev, [shiftId]: { ...prev[shiftId], [field]: value } };
            if (field === 'serviceCode' && filterClientId) {
                const client = clients.find(c => String(c.id) === String(filterClientId));
                const now = new Date();
                const auth = client?.authorizations?.find(a =>
                    a.serviceCode === value &&
                    (a.manualStatus || 'active') === 'active' &&
                    !a.archivedAt &&
                    (!a.authorizationEndDate || new Date(a.authorizationEndDate) >= now)
                );
                if (auth) {
                    const current = next[shiftId];
                    if (auth.accountNumber && (!current.accountNumber || ACCOUNT_NUMBER_OPTIONS.includes(current.accountNumber))) {
                        next[shiftId] = { ...next[shiftId], accountNumber: auth.accountNumber };
                    }
                    if (auth.sandataClientId && !current.sandataClientId) {
                        next[shiftId] = { ...next[shiftId], sandataClientId: auth.sandataClientId };
                    }
                }
            }
            return next;
        });
    };

    const applyDayToAll = (sourceDateStr) => {
        const sourceShifts = shiftsByDay.find(([d]) => d === sourceDateStr)?.[1];
        if (!sourceShifts?.length) return;
        const sourceEdit = edits[sourceShifts[0].id];
        setEdits(prev => {
            const next = { ...prev };
            for (const s of selectedShifts) {
                next[s.id] = { ...next[s.id], serviceCode: sourceEdit.serviceCode, startTime: sourceEdit.startTime, endTime: sourceEdit.endTime, accountNumber: sourceEdit.accountNumber, sandataClientId: sourceEdit.sandataClientId, employeeId: sourceEdit.employeeId };
            }
            return next;
        });
    };

    const handleApplyToFutureToggle = (enabled) => {
        setApplyToFuture(enabled);
        if (!enabled) {
            setShowDateSelect(false);
            setFutureSeriesShifts([]);
            setDateSelectedIds(new Set());
            return;
        }
        const groupIds = [...new Set(
            selectedShifts.filter(s => s.recurringGroupId).map(s => s.recurringGroupId)
        )];
        if (groupIds.length === 0) {
            setShowDateSelect(false);
            setFutureSeriesShifts([]);
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        const future = allShifts.filter(s =>
            groupIds.includes(s.recurringGroupId) &&
            s.shiftDate && String(s.shiftDate).split('T')[0] > today &&
            !selectedIds.has(s.id)
        );
        setFutureSeriesShifts(future);
        setDateSelectedIds(new Set());
        setShowDateSelect(true);
    };

    const computeHrs = (sT, eT) => {
        if (!sT || !eT) return { hours: 0, units: 0 };
        const [sh, sm] = sT.split(':').map(Number);
        const [eh, em] = eT.split(':').map(Number);
        let startMin = sh * 60 + sm, endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        const hours = Math.round(((endMin - startMin) / 60) * 100) / 100;
        return { hours, units: Math.round(hours * 4) };
    };

    // Live (non-removed) existing shifts + all new rows, for totals and counts.
    const liveShifts = selectedShifts.filter(s => !removedIds.has(s.id));
    const allNewRows = Object.values(newRows).flat();
    const count = liveShifts.length + allNewRows.length;
    const totalHours = liveShifts.reduce((sum, s) => sum + computeHrs(edits[s.id]?.startTime, edits[s.id]?.endTime).hours, 0)
        + allNewRows.reduce((sum, r) => sum + computeHrs(r.startTime, r.endTime).hours, 0);
    const totalUnits = liveShifts.reduce((sum, s) => sum + computeHrs(edits[s.id]?.startTime, edits[s.id]?.endTime).units, 0)
        + allNewRows.reduce((sum, r) => sum + computeHrs(r.startTime, r.endTime).units, 0);

    const editsChanged = selectedShifts.some(s => {
        const e = edits[s.id];
        if (!e) return false;
        return e.serviceCode !== (s.serviceCode || 'PCS') ||
            e.startTime !== (s.startTime || '09:00') ||
            e.endTime !== (s.endTime || '13:00') ||
            e.accountNumber !== (s.accountNumber || '') ||
            e.sandataClientId !== (s.sandataClientId || '') ||
            String(e.employeeId) !== String(s.employeeId || '');
    });
    const hasChanges = editsChanged || allNewRows.length > 0 || removedIds.size > 0;

    const hasRecurringShifts = selectedShifts.some(s => s.recurringGroupId);

    // Incomplete new rows block the save (validation surfaced via rowErrors).
    const [rowErrors, setRowErrors] = useState({}); // { newRowKey: message }
    const validateNewRow = (r) => {
        if (!filterClientId) return 'Select a client above to add a shift';
        if (!r.serviceCode) return 'Select a service';
        if (!r.startTime || !r.endTime) return 'Set start and end time';
        if (!r.employeeId) return 'Assign an employee';
        return null;
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validate new rows first — an incomplete added shift blocks the whole save.
        const errors = {};
        for (const [dateStr, rows] of Object.entries(newRows)) {
            for (const r of rows) {
                const msg = validateNewRow(r);
                if (msg) errors[r._key] = msg;
            }
        }
        if (Object.keys(errors).length > 0) { setRowErrors(errors); return; }
        setRowErrors({});

        // Updates for existing (non-removed) selected shifts + date-selected future shifts.
        const updates = {};
        const allTargetIds = [...selectedIds, ...(showDateSelect ? dateSelectedIds : [])];
        const allTargetShifts = allShifts.filter(s => allTargetIds.includes(s.id) && !removedIds.has(s.id));
        for (const s of allTargetShifts) {
            const edit = edits[s.id] || edits[selectedShifts[0]?.id];
            if (!edit) continue;
            const u = {};
            if (edit.serviceCode !== (s.serviceCode || 'PCS')) u.serviceCode = edit.serviceCode;
            if (edit.startTime !== (s.startTime || '09:00')) u.startTime = edit.startTime;
            if (edit.endTime !== (s.endTime || '13:00')) u.endTime = edit.endTime;
            if (edit.accountNumber !== (s.accountNumber || '')) u.accountNumber = edit.accountNumber;
            if (edit.sandataClientId !== (s.sandataClientId || '')) u.sandataClientId = edit.sandataClientId;
            if (String(edit.employeeId) !== String(s.employeeId || '')) u.employeeId = edit.employeeId;
            if (Object.keys(u).length > 0) updates[s.id] = u;
        }

        // Newly added shifts → creates.
        const creates = [];
        for (const [dateStr, rows] of Object.entries(newRows)) {
            for (const r of rows) {
                creates.push({
                    clientId: Number(filterClientId) || undefined,
                    employeeId: r.employeeId,
                    serviceCode: r.serviceCode,
                    shiftDate: dateStr,
                    startTime: r.startTime,
                    endTime: r.endTime,
                    accountNumber: r.accountNumber,
                    sandataClientId: r.sandataClientId,
                });
            }
        }

        const removeIds = [...removedIds];
        if (Object.keys(updates).length === 0 && creates.length === 0 && removeIds.length === 0) return;
        // Send applyToFuture whenever the user picked it. The server propagates to
        // future weeks via the recurring group when one exists, and otherwise falls
        // back to matching future shifts by client + employee + weekday + service code
        // — so week-by-week shifts (no shared group) still get updated.
        onSave({ updates, creates, removeIds }, applyToFuture);
    };

    // Client/employee options for SearchableSelect
    const clientOptions = useMemo(() => {
        const map = new Map();
        for (const s of allShifts) { if (s.client?.id) map.set(s.client.id, s.client.clientName); }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: id, label: name }));
    }, [allShifts]);
    const employeeOptions = useMemo(() => {
        return employees.map(emp => ({ value: emp.id, label: emp.name }));
    }, [employees]);

    // Authorization table for the selected client
    const selectedClient = useMemo(() => {
        if (!filterClientId) return null;
        return clients.find(c => c.id === Number(filterClientId));
    }, [filterClientId, clients]);

    const authServiceMap = useMemo(() => {
        if (!selectedClient?.authorizations?.length) return {};
        const now = new Date();
        const map = {};
        for (const auth of selectedClient.authorizations) {
            if ((auth.manualStatus || 'active') !== 'active' || auth.archivedAt) continue;
            if (auth.authorizationEndDate && new Date(auth.authorizationEndDate) < now) continue;
            const code = auth.serviceCode;
            if (!map[code]) map[code] = { units: 0, category: auth.serviceCategory };
            map[code].units += (auth.authorizedUnits || 0);
        }
        return map;
    }, [selectedClient]);

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Bulk Edit Shifts</h2>
            <p className="modal__desc">Select a client or employee to view and edit their weekly schedule.</p>
            <form onSubmit={handleSubmit}>
                {/* Client + Employee searchable filters */}
                <div className="form-grid-2">
                    <div className="form-group">
                        <label>Client</label>
                        <SearchableSelect
                            options={clientOptions}
                            value={filterClientId}
                            onChange={v => { setFilterClientId(v); }}
                            placeholder="Search clients…"
                        />
                    </div>
                    <div className="form-group">
                        <label>{filterClientId ? 'Reassign to Employee' : 'Filter by Employee'}</label>
                        <SearchableSelect
                            options={employeeOptions}
                            value={filterEmployeeId}
                            onChange={v => {
                                setFilterEmployeeId(v);
                                if (filterClientId && v) {
                                    setEdits(prev => {
                                        const next = { ...prev };
                                        for (const s of filteredShifts) {
                                            if (next[s.id]) next[s.id] = { ...next[s.id], employeeId: v };
                                        }
                                        return next;
                                    });
                                }
                            }}
                            placeholder={filterClientId ? 'Select new employee…' : 'Search employees…'}
                        />
                    </div>
                </div>

                {/* Authorization table — shown when a client is selected */}
                {filterClientId && Object.keys(authServiceMap).length > 0 && (
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
                            {Object.entries(authServiceMap).map(([code, svcData]) => {
                                const info = SERVICE_COLORS[code] || { color: '#6B7280', label: code };
                                const units = svcData.units || 0;
                                const hrs = Math.round((units / 4) * 100) / 100;
                                return (
                                    <tr key={code}>
                                        <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{svcData.category || '—'}</td>
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

                {/* Empty state */}
                {!filterClientId && !filterEmployeeId && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'hsl(var(--muted-foreground))' }}>
                        <p style={{ margin: 0, fontSize: 14 }}>Select a client or employee above to load their shifts for this week.</p>
                    </div>
                )}

                {/* Shifts loaded but none found */}
                {(filterClientId || filterEmployeeId) && filteredShifts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'hsl(var(--muted-foreground))' }}>
                        <p style={{ margin: 0, fontSize: 14 }}>No shifts found for this selection this week.</p>
                    </div>
                )}

                {/* Day grid — only shown when we have shifts */}
                {filteredShifts.length > 0 && (
                    <>
                        {/* Day selection */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                            {DAY_NAMES.map((day, i) => {
                                const dayCount = filteredShifts.filter(s => toLocalDateStr(s.shiftDate) === weekDates[i]).length;
                                const dayAllSelected = dayCount > 0 && filteredShifts.filter(s => toLocalDateStr(s.shiftDate) === weekDates[i]).every(s => selectedIds.has(s.id));
                                return (
                                    <button key={i} type="button" className={`btn btn--outline btn--xs ${dayAllSelected ? 'btn--active' : ''}`} onClick={() => selectByDay(i)} disabled={dayCount === 0}>
                                        {day} ({dayCount})
                                    </button>
                                );
                            })}
                        </div>

                        <div className="sched-day-grid">
                            {/* Render every weekday so a shift can be added to any day —
                                including days that currently have no shifts. Days with
                                existing shifts pull them from the selected-shift grouping;
                                empty days still render with just an "+ Add shift" button. */}
                            {weekDates.map((dateStr) => {
                                const dayShifts = shiftsByDay.find(([d]) => d === dateStr)?.[1] || [];
                                const liveDayShifts = dayShifts.filter(s => !removedIds.has(s.id));
                                const dayNewRows = newRows[dateStr] || [];
                                const rowCount = liveDayShifts.length + dayNewRows.length;
                                const isEmpty = rowCount === 0;
                                const dateObj = new Date(dateStr + 'T12:00:00');
                                const dayName = DAY_NAMES[dateObj.getDay()];
                                const dayTotalHrs = liveDayShifts.reduce((s, sh) => s + computeHrs(edits[sh.id]?.startTime, edits[sh.id]?.endTime).hours, 0)
                                    + dayNewRows.reduce((s, r) => s + computeHrs(r.startTime, r.endTime).hours, 0);
                                const dayTotalUnits = liveDayShifts.reduce((s, sh) => s + computeHrs(edits[sh.id]?.startTime, edits[sh.id]?.endTime).units, 0)
                                    + dayNewRows.reduce((s, r) => s + computeHrs(r.startTime, r.endTime).units, 0);
                                const firstEdit = liveDayShifts.length ? edits[liveDayShifts[0].id] : dayNewRows[0];
                                const firstColor = SERVICE_COLORS[firstEdit?.serviceCode] || { color: '#6B7280' };
                                return (
                                    <div key={dateStr} className={`sched-day-row ${isEmpty ? 'sched-day-row--empty' : 'sched-day-row--active'}`}>
                                        <div className="sched-day-row__header">
                                            <label className="sched-day-row__toggle">
                                                <span className="sched-day-row__day">{dayName}</span>
                                                <span className="sched-day-row__date">{dateStr.slice(5)}</span>
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {!isEmpty && (
                                                    <span className="sched-day-row__badge" style={{ background: `color-mix(in srgb, ${firstColor.color} 15%, white)`, color: firstColor.color }}>
                                                        {dayTotalHrs}h / {dayTotalUnits}u
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {liveDayShifts.map((shift, si) => {
                                            const edit = edits[shift.id];
                                            if (!edit) return null;
                                            const shColorInfo = SERVICE_COLORS[edit.serviceCode] || { color: '#6B7280', label: edit.serviceCode };
                                            return (
                                                <div key={shift.id} className="sched-day-row__fields">
                                                    <div className="sched-day-row__shift-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{rowCount > 1 ? `Shift ${si + 1}` : ''}</span>
                                                        <button type="button" className="sched-day-row__remove-shift" title="Remove this shift" onClick={() => markRemoved(shift.id)}>&times;</button>
                                                    </div>
                                                    <div className="sched-day-row__row">
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Service</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span className="sched-day-row__dot" style={{ background: shColorInfo.color }} />
                                                                <select value={edit.serviceCode} onChange={e => updateShiftField(shift.id, 'serviceCode', e.target.value)} className="sched-day-row__input">
                                                                    {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                                                        <option key={code} value={code}>{info.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Start</label>
                                                            <input type="time" value={edit.startTime} onChange={e => updateShiftField(shift.id, 'startTime', e.target.value)} className="sched-day-row__input" />
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">End</label>
                                                            <input type="time" value={edit.endTime} onChange={e => updateShiftField(shift.id, 'endTime', e.target.value)} className="sched-day-row__input" />
                                                        </div>
                                                    </div>
                                                    <div className="sched-day-row__row">
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Account</label>
                                                            <select value={edit.accountNumber} onChange={e => updateShiftField(shift.id, 'accountNumber', e.target.value)} className="sched-day-row__input">
                                                                <option value="">—</option>
                                                                {ACCOUNT_NUMBER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Employee</label>
                                                            <SearchableSelect
                                                                className="sched-day-row__input"
                                                                options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                                                                value={edit.employeeId ? Number(edit.employeeId) : ''}
                                                                onChange={v => updateShiftField(shift.id, 'employeeId', v)}
                                                                placeholder="Select employee…"
                                                            />
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Client ID</label>
                                                            <input value={edit.sandataClientId} onChange={e => updateShiftField(shift.id, 'sandataClientId', e.target.value)} className="sched-day-row__input" placeholder="—" />
                                                        </div>
                                                    </div>
                                                    {si === 0 && shiftsByDay.length > 1 && (
                                                        <button type="button" className="sched-day-row__apply" title="Apply this day's settings to all days" onClick={() => applyDayToAll(dateStr)}>
                                                            Apply to all
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {dayNewRows.map((r) => {
                                            const shColorInfo = SERVICE_COLORS[r.serviceCode] || { color: '#6B7280', label: r.serviceCode };
                                            const err = rowErrors[r._key];
                                            return (
                                                <div key={r._key} className="sched-day-row__fields sched-day-row__fields--new">
                                                    <div className="sched-day-row__shift-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>New shift</span>
                                                        <button type="button" className="sched-day-row__remove-shift" title="Remove this shift" onClick={() => removeNewRow(dateStr, r._key)}>&times;</button>
                                                    </div>
                                                    <div className="sched-day-row__row">
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Service</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span className="sched-day-row__dot" style={{ background: shColorInfo.color }} />
                                                                <select value={r.serviceCode} onChange={e => updateNewRow(dateStr, r._key, 'serviceCode', e.target.value)} className="sched-day-row__input">
                                                                    {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                                                                        <option key={code} value={code}>{info.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Start</label>
                                                            <input type="time" value={r.startTime} onChange={e => updateNewRow(dateStr, r._key, 'startTime', e.target.value)} className="sched-day-row__input" />
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">End</label>
                                                            <input type="time" value={r.endTime} onChange={e => updateNewRow(dateStr, r._key, 'endTime', e.target.value)} className="sched-day-row__input" />
                                                        </div>
                                                    </div>
                                                    <div className="sched-day-row__row">
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Account</label>
                                                            <select value={r.accountNumber} onChange={e => updateNewRow(dateStr, r._key, 'accountNumber', e.target.value)} className="sched-day-row__input">
                                                                <option value="">—</option>
                                                                {ACCOUNT_NUMBER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Employee</label>
                                                            <SearchableSelect
                                                                className="sched-day-row__input"
                                                                options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                                                                value={r.employeeId ? Number(r.employeeId) : ''}
                                                                onChange={v => updateNewRow(dateStr, r._key, 'employeeId', v)}
                                                                placeholder="Select employee…"
                                                            />
                                                        </div>
                                                        <div className="sched-day-row__field">
                                                            <label className="sched-day-row__field-label">Client ID</label>
                                                            <input value={r.sandataClientId} onChange={e => updateNewRow(dateStr, r._key, 'sandataClientId', e.target.value)} className="sched-day-row__input" placeholder="—" />
                                                        </div>
                                                    </div>
                                                    {err && <div className="sched-day-row__error">{err}</div>}
                                                </div>
                                            );
                                        })}
                                        <button type="button" className="sched-day-row__add" onClick={() => addShiftToDay(dateStr)}>
                                            + Add shift
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="sched-hours-display" style={{ borderLeftColor: 'hsl(217 91% 50%)' }}>
                            <span className="sched-hours-display__value">{count}</span>
                            <span className="sched-hours-display__label">shift{count !== 1 ? 's' : ''}</span>
                            <span className="sched-hours-display__sep">/</span>
                            <span className="sched-hours-display__value">{totalHours}</span>
                            <span className="sched-hours-display__label">hours</span>
                            <span className="sched-hours-display__sep">/</span>
                            <span className="sched-hours-display__value">{totalUnits}</span>
                            <span className="sched-hours-display__label">units</span>
                        </div>

                        <div className="sched-recurring">
                            <label className="sched-recurring__toggle">
                                <input type="radio" name="bulkScope" checked={!applyToFuture} onChange={() => handleApplyToFutureToggle(false)} />
                                <span>Apply to current week only</span>
                            </label>
                            <label className="sched-recurring__toggle" style={{ marginTop: 6 }}>
                                <input type="radio" name="bulkScope" checked={applyToFuture} onChange={() => handleApplyToFutureToggle(true)} />
                                <span>Apply to all future recurring weeks</span>
                            </label>
                            {applyToFuture && hasRecurringShifts && !showDateSelect && (
                                <div className="sched-recurring__preview">
                                    Changes will update all future shifts sharing the same recurring schedule.
                                </div>
                            )}
                            {applyToFuture && !hasRecurringShifts && (
                                <div className="sched-recurring__preview">
                                    Changes will update matching future shifts — same client, employee, weekday and service — on upcoming weeks.
                                </div>
                            )}
                            {showDateSelect && futureSeriesShifts.length > 0 && (
                                <DateSelectionPanel
                                    shifts={futureSeriesShifts}
                                    selectedIds={dateSelectedIds}
                                    onSelectionChange={setDateSelectedIds}
                                />
                            )}
                        </div>
                    </>
                )}

                <div className="form-actions">
                    {removedIds.size > 0 && (
                        <span style={{ marginRight: 'auto', fontSize: 12, color: 'hsl(0 72% 45%)' }}>
                            {removedIds.size} shift{removedIds.size !== 1 ? 's' : ''} will be removed
                        </span>
                    )}
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={!hasChanges || saving}>
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function WeeklyCalendarView({ shifts, weekStart, overlapIds, onEditShift, onAddShift, bulkEditMode, selectedShiftIds, onToggleSelect, groupBy = 'employee', compact = false }) {
    const [search, setSearch] = useState('');
    const [filterService, setFilterService] = useState('');

    const dayAbbr = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const ws = new Date(weekStart + 'T00:00:00');
    const todayStr = toLocalDateStr(new Date());

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days.push({ abbr: dayAbbr[i], date: d.getDate(), dateStr: toLocalDateStr(d), isToday: toLocalDateStr(d) === todayStr });
    }

    const timeSlots = ['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'];
    const timeHours = [6, 8, 10, 12, 14, 16, 18];

    const filtered = useMemo(() => {
        let result = shifts.filter(s => s.status !== 'cancelled');
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(s =>
                (s.client?.clientName || '').toLowerCase().includes(q) ||
                (s.displayEmployeeName || '').toLowerCase().includes(q) ||
                (s.serviceCode || '').toLowerCase().includes(q)
            );
        }
        if (filterService) {
            result = result.filter(s => s.serviceCode === filterService);
        }
        return result;
    }, [shifts, search, filterService]);

    const shiftsByDay = useMemo(() => {
        const map = {};
        for (const d of days) map[d.dateStr] = [];
        for (const s of filtered) {
            const dateStr = toLocalDateStr(s.shiftDate);
            if (map[dateStr]) map[dateStr].push(s);
        }
        for (const key of Object.keys(map)) {
            map[key].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        }
        return map;
    }, [filtered, days]);

    const parseHour = (timeStr) => {
        if (!timeStr) return 8;
        const [h] = timeStr.split(':').map(Number);
        return h;
    };

    const getSlotIndex = (hour) => {
        for (let i = timeHours.length - 1; i >= 0; i--) {
            if (hour >= timeHours[i]) return i;
        }
        return 0;
    };

    const shiftsByDayAndSlot = useMemo(() => {
        const result = {};
        for (const d of days) {
            result[d.dateStr] = {};
            for (let i = 0; i < timeHours.length; i++) result[d.dateStr][i] = [];
            for (const s of (shiftsByDay[d.dateStr] || [])) {
                const hour = parseHour(s.startTime);
                const slot = getSlotIndex(hour);
                result[d.dateStr][slot].push(s);
            }
        }
        return result;
    }, [shiftsByDay, days]);

    return (
        <div className={`weekly-cal ${compact ? 'weekly-cal--compact' : ''}`}>
            {!compact && (
                <div className="weekly-cal__toolbar">
                    <div className="weekly-cal__search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            type="text"
                            placeholder="Search by client, employee, service..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select className="weekly-cal__filter-select" value={filterService} onChange={e => setFilterService(e.target.value)}>
                        <option value="">All Services</option>
                        {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                            <option key={code} value={code}>{info.label}</option>
                        ))}
                    </select>
                    <div className="weekly-cal__legend">
                        <span className="weekly-cal__legend-label">Legend:</span>
                        {Object.entries(SERVICE_COLORS).map(([code, info]) => (
                            <span key={code} className="weekly-cal__legend-item">
                                <span className="weekly-cal__legend-dot" style={{ background: info.color }} />
                                {info.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="weekly-cal__scroll-wrap">
                <div className="weekly-cal__grid">
                    {/* Day headers */}
                    <div className="weekly-cal__time-gutter weekly-cal__header-cell" />
                    {days.map(d => (
                        <div key={d.dateStr} className={`weekly-cal__header-cell ${d.isToday ? 'weekly-cal__header-cell--today' : ''}`}>
                            <span className="weekly-cal__header-day">{compact ? dayAbbr[days.indexOf(d)].slice(0, 3) : `${d.abbr} ${d.date}`}</span>
                            <span className="weekly-cal__header-count">
                                {(shiftsByDay[d.dateStr] || []).length}
                            </span>
                        </div>
                    ))}

                    {/* Time rows */}
                    {timeSlots.map((label, slotIdx) => (
                        <React.Fragment key={slotIdx}>
                            <div className="weekly-cal__time-gutter weekly-cal__time-label">
                                {label}
                            </div>
                            {days.map(d => {
                                const slotShifts = shiftsByDayAndSlot[d.dateStr]?.[slotIdx] || [];
                                return (
                                    <div key={d.dateStr} className={`weekly-cal__cell ${d.isToday ? 'weekly-cal__cell--today' : ''}`}>
                                        {slotShifts.map(s => {
                                            const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', bg: '#F3F4F6', label: s.serviceCode || '?' };
                                            const isOverlap = overlapIds && overlapIds.has(s.id);
                                            return (
                                                <button
                                                    key={s.id}
                                                    className={`weekly-cal__shift ${isOverlap ? 'weekly-cal__shift--overlap' : ''} ${bulkEditMode && selectedShiftIds?.has(s.id) ? 'weekly-cal__shift--selected' : ''}`}
                                                    style={{ background: colorInfo.bg, borderColor: bulkEditMode && selectedShiftIds?.has(s.id) ? 'hsl(217 91% 50%)' : colorInfo.color + '40' }}
                                                    onClick={() => bulkEditMode ? onToggleSelect?.(s.id) : onEditShift(s)}
                                                    title={`${s.client?.clientName || '?'} — ${s.displayEmployeeName || '?'}\n${hhmm12(s.startTime)} – ${hhmm12(s.endTime)}\n${colorInfo.label}`}
                                                >
                                                    <span className="weekly-cal__shift-dot" style={{ background: colorInfo.color }} />
                                                    <span className="weekly-cal__shift-name">{groupBy === 'client' ? (s.client?.clientName || 'Unknown') : (s.displayEmployeeName || 'Unassigned')}</span>
                                                    <span className="weekly-cal__shift-time">{hhmm12(s.startTime)} – {hhmm12(s.endTime)}</span>
                                                    {!compact && <span className="weekly-cal__shift-service" style={{ color: colorInfo.color }}>{colorInfo.label}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ScheduleOverviewTable({ shifts, overlapIds, onEditShift, clientColorMap, bulkEditMode, selectedShiftIds, onToggleSelect, onToggleSelectAll }) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sorted = [...shifts].sort((a, b) => {
        const da = new Date(a.shiftDate).getTime();
        const db = new Date(b.shiftDate).getTime();
        if (da !== db) return da - db;
        return (a.startTime || '').localeCompare(b.startTime || '');
    });
    const hasMultipleClients = clientColorMap && Object.keys(clientColorMap).length > 1;
    const allSelected = selectedShiftIds && shifts.length > 0 && selectedShiftIds.size === shifts.length;

    return (
        <div className="sched-overview-table-wrap">
            <table className="sched-overview-table">
                <thead>
                    <tr>
                        {bulkEditMode && <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} /></th>}
                        <th>Day</th>
                        <th>Client</th>
                        <th>Employee</th>
                        <th>Service</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 && (
                        <tr><td colSpan={bulkEditMode ? 6 : 5} style={{ textAlign: 'center', padding: 24, color: 'hsl(var(--muted-foreground))' }}>No shifts this week</td></tr>
                    )}
                    {sorted.map(s => {
                        const colorInfo = SERVICE_COLORS[s.serviceCode] || { color: '#6B7280', label: s.serviceCode };
                        const isOverlap = overlapIds && overlapIds.has(s.id);
                        const dateStr = toLocalDateStr(s.shiftDate);
                        const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
                        const cc = hasMultipleClients && s.client?.clientName ? clientColorMap[s.client.clientName] : null;
                        const isSelected = selectedShiftIds && selectedShiftIds.has(s.id);
                        return (
                            <tr key={s.id} className={`sched-overview-table__row ${isOverlap ? 'sched-overview-table__row--overlap' : ''} ${s.status === 'cancelled' ? 'sched-overview-table__row--cancelled' : ''} ${s.status === 'pending_replacement' ? 'sched-overview-table__row--pending-replacement' : ''} ${isSelected ? 'sched-overview-table__row--selected' : ''}`} onClick={() => bulkEditMode ? onToggleSelect(s.id) : onEditShift(s)} style={{ cursor: 'pointer', borderLeft: cc ? `3px solid ${cc.color}` : undefined }}>
                                {bulkEditMode && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(s.id)} /></td>}
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
    const undoState = useUndoStack();
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
    const [clientWeekStart, setClientWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return toLocalDateStr(d);
    });
    const [employeeWeekStart, setEmployeeWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return toLocalDateStr(d);
    });
    const [modal, setModal] = useState(null);
    const createDraftRef = useRef(null);
    const [summaryViewBy, setSummaryViewBy] = useState('client');
    const [clientScheduleView, setClientScheduleView] = useState('matrix');
    const [employeeScheduleView, setEmployeeScheduleView] = useState('matrix');

    // Bulk edit state
    const [bulkEditMode, setBulkEditMode] = useState(false);
    const [selectedShiftIds, setSelectedShiftIds] = useState(new Set());
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkBatches, setBulkBatches] = useState([]);

    // Undo banners
    const [undoBanners, setUndoBanners] = useState([]);

    // Archived shifts (for trash in GlobalToolbar)
    const [archivedShifts, setArchivedShifts] = useState([]);

    // Delete confirmation modal
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Calendar view mode
    const [viewMode, setViewMode] = useState('week');
    const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
    const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
    const [monthShifts, setMonthShifts] = useState([]);
    const [monthOverlaps, setMonthOverlaps] = useState([]);
    const [loadingMonth, setLoadingMonth] = useState(false);
    const [futureShifts, setFutureShifts] = useState([]);
    const [loadingFuture, setLoadingFuture] = useState(false);
    const [futureFilterContext, setFutureFilterContext] = useState({ clientId: '', employeeId: '' });

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

    const fetchMonthShifts = useCallback(async () => {
        setLoadingMonth(true);
        try {
            const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
            const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const filters = { startDate, endDate };
            if (selectedClientId) filters.clientId = selectedClientId;
            if (selectedEmployeeId) filters.employeeId = selectedEmployeeId;
            const data = await api.getShifts(null, filters);
            setMonthShifts(data.shifts || []);
            setMonthOverlaps(data.overlaps || []);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoadingMonth(false);
        }
    }, [viewYear, viewMonth, selectedClientId, selectedEmployeeId, showToast]);

    const fetchFutureShifts = useCallback(async () => {
        setLoadingFuture(true);
        try {
            const today = new Date();
            const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const end = new Date(today);
            end.setDate(end.getDate() + 180);
            const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
            const data = await api.getShifts(null, { startDate, endDate });
            setFutureShifts(data.shifts || []);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoadingFuture(false);
        }
    }, [showToast]);

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
            const data = await api.getClientSchedule(selectedClientId, clientWeekStart);
            setClientShifts(data.shifts || []);
            setClientOverlaps(data.overlaps || []);
            setClientInfo(data.client || null);
            setClientUnitSummary(data.unitSummary || {});
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingClient(false); }
    }, [selectedClientId, clientWeekStart, showToast]);

    const fetchEmployeeSchedule = useCallback(async () => {
        if (!selectedEmployeeId) {
            setEmployeeShifts([]);
            setEmployeeOverlaps([]);
            setEmployeeInfo(null);
            return;
        }
        try {
            setLoadingEmployee(true);
            const data = await api.getEmployeeSchedule(selectedEmployeeId, employeeWeekStart);
            setEmployeeShifts(data.shifts || []);
            setEmployeeOverlaps(data.overlaps || []);
            setEmployeeInfo(data.employee || null);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setLoadingEmployee(false); }
    }, [selectedEmployeeId, employeeWeekStart, showToast]);

    const refetchAll = useCallback(() => {
        fetchAllShifts();
        fetchClientSchedule();
        fetchEmployeeSchedule();
    }, [fetchAllShifts, fetchClientSchedule, fetchEmployeeSchedule]);

    const fetchBatches = useCallback(async () => {
        try {
            const data = await api.listBulkEditBatches();
            setBulkBatches(data.filter(b => !b.undoneAt));
        } catch {}
    }, []);

    const fetchArchivedShifts = useCallback(async () => {
        try {
            const data = await api.listArchivedShifts();
            setArchivedShifts(data);
        } catch {}
    }, []);

    const addUndoBanner = (message, batchId) => {
        const id = Date.now();
        setUndoBanners(prev => [...prev, { id, message, batchId }]);
    };

    const removeUndoBanner = (id) => {
        setUndoBanners(prev => prev.filter(b => b.id !== id));
    };

    const showDeleteConfirm = (shiftIds, shifts) => {
        const items = shifts.map(s => ({
            id: s.id,
            label: `${s.client?.clientName || 'Unknown'} — ${s.shiftDate ? new Date(s.shiftDate).toLocaleDateString() : '?'} (${s.startTime || '?'}–${s.endTime || '?'})`,
        }));
        const uniqueClients = [...new Set(shifts.map(s => s.client?.clientName).filter(Boolean))];
        const uniqueEmployees = [...new Set(shifts.map(s => s.displayEmployeeName || s.employee?.name).filter(Boolean))];
        const scopeWarning = (uniqueClients.length > 1 || uniqueEmployees.length > 1)
            ? `This affects ${uniqueClients.length} client${uniqueClients.length !== 1 ? 's' : ''} and ${uniqueEmployees.length} employee${uniqueEmployees.length !== 1 ? 's' : ''}`
            : null;
        setDeleteConfirm({ shiftIds, items, scopeWarning });
    };

    useEffect(() => { fetchClients(); }, [fetchClients]);
    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
    useEffect(() => { fetchAllShifts(); }, [fetchAllShifts]);
    useEffect(() => { fetchClientSchedule(); }, [fetchClientSchedule]);
    useEffect(() => { fetchEmployeeSchedule(); }, [fetchEmployeeSchedule]);
    useEffect(() => { if (modal?.type === 'bulkEdit') fetchBatches(); }, [modal, fetchBatches]);
    useEffect(() => { if (viewMode === 'month') fetchMonthShifts(); }, [viewMode, fetchMonthShifts]);
    useEffect(() => { fetchArchivedShifts(); }, [fetchArchivedShifts]);
    useEffect(() => { if (viewMode === 'future') fetchFutureShifts(); }, [viewMode, fetchFutureShifts]);


    const handleSaveShift = async (data) => {
        try {
            if (modal.shift) {
                const oldShift = { ...modal.shift };
                await api.updateShift(modal.shift.id, data);
                showToast('Shift updated');
                undoState.pushAction(
                    `Updated shift`,
                    async () => { await api.updateShift(oldShift.id, { clientId: oldShift.clientId, employeeId: oldShift.employeeId, shiftDate: oldShift.shiftDate, startTime: oldShift.startTime, endTime: oldShift.endTime, serviceCode: oldShift.serviceCode, notes: oldShift.notes }); refetchAll(); },
                    async () => { await api.updateShift(oldShift.id, data); refetchAll(); }
                );
            } else {
                const result = await api.createShift(data);
                const count = result.count || (result.shifts ? result.shifts.length : 0);
                const createdIds = result.shifts ? result.shifts.map(s => s.id) : result.id ? [result.id] : [];
                if (count > 1) showToast(`${count} shifts created`);
                else showToast('Shift created');
                if (createdIds.length > 0) {
                    undoState.pushAction(
                        `Created ${count > 1 ? count + ' shifts' : 'shift'}`,
                        async () => { await api.bulkDeleteShifts(createdIds); refetchAll(); },
                        async () => { await api.createShift(data); refetchAll(); }
                    );
                }
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

    const handleDeleteShift = async (shiftId, opts = {}) => {
        // Back-compat: a boolean second arg meant "delete whole series" (scope 'all').
        const scope = typeof opts === 'boolean' ? (opts ? 'all' : 'this') : (opts.scope || 'this');
        try {
            const result = await api.deleteShift(shiftId, { scope });
            const count = result?.archived || 1;
            const archivedIds = result?.ids && result.ids.length ? result.ids : [shiftId];
            setModal(null);
            refetchAll();
            if (scope === 'this') {
                showUndoToast('Shift archived', async () => {
                    await api.restoreShift(shiftId);
                    refetchAll();
                });
                undoState.pushAction(
                    'Archived shift',
                    async () => { await api.restoreShifts([shiftId]); refetchAll(); },
                    async () => { await api.deleteShift(shiftId, { scope: 'this' }); refetchAll(); }
                );
            } else {
                const label = scope === 'future' ? 'this & future' : 'all';
                showUndoToast(`${count} shift${count !== 1 ? 's' : ''} archived (${label})`, async () => {
                    await api.restoreShifts(archivedIds);
                    refetchAll();
                });
                undoState.pushAction(
                    `Archived ${count} shift${count !== 1 ? 's' : ''} (${label})`,
                    async () => { await api.restoreShifts(archivedIds); refetchAll(); },
                    async () => { await api.deleteShift(shiftId, { scope }); refetchAll(); }
                );
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
        if (bulkEditMode) {
            toggleShiftSelection(shift.id);
            return;
        }
        setModal({ type: 'shift', shift });
    };

    const toggleShiftSelection = (id) => {
        setSelectedShiftIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedShiftIds.size === allShifts.length) {
            setSelectedShiftIds(new Set());
        } else {
            setSelectedShiftIds(new Set(allShifts.map(s => s.id)));
        }
    };

    const handleBulkEdit = async (updates) => {
        if (selectedShiftIds.size === 0) return;
        try {
            setBulkSaving(true);
            const result = await api.bulkUpdateShifts([...selectedShiftIds], updates);
            setSelectedShiftIds(new Set());
            setBulkEditMode(false);
            setModal(null);
            refetchAll();
            fetchBatches();
            addUndoBanner(`Updated ${result.count} shift${result.count !== 1 ? 's' : ''}`, result.batchId);
            undoState.pushAction(
                `Updated ${result.count} shift${result.count !== 1 ? 's' : ''}`,
                async () => { await api.bulkUndoShifts(result.batchId); refetchAll(); fetchBatches(); },
                async () => {}
            );
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkEditPerShift = async (perShiftUpdates, applyToFuture) => {
        if (Object.keys(perShiftUpdates).length === 0) return;
        try {
            setBulkSaving(true);
            const result = await api.bulkUpdateShiftsPerShift(perShiftUpdates, applyToFuture);
            setSelectedShiftIds(new Set());
            setBulkEditMode(false);
            setModal(null);
            refetchAll();
            fetchBatches();
            const msg = result.futureUpdated
                ? `Updated ${result.count} shift${result.count !== 1 ? 's' : ''} + ${result.futureUpdated} future`
                : `Updated ${result.count} shift${result.count !== 1 ? 's' : ''}`;
            addUndoBanner(msg, result.batchId);
            undoState.pushAction(
                msg,
                async () => { await api.bulkUndoShifts(result.batchId); refetchAll(); fetchBatches(); },
                async () => {}
            );
        } catch (err) {
            // Overlaps BLOCK the save (Bug 3) — surface a clear warning and keep the
            // modal open so the user can adjust the times. Nothing was written.
            showToast(err.message, err.isOverlap ? 'warning' : 'error');
        } finally {
            setBulkSaving(false);
        }
    };

    // Bulk-edit composer save (Bug 2): the modal can now add new shifts, remove
    // existing ones, and edit existing ones in a single pass. Orchestrate the three
    // operations and reverse all of them together on undo. Overlaps thrown by the
    // create/update endpoints block the save (nothing is closed) so the user can fix.
    const handleBulkComposerSave = async ({ updates = {}, creates = [], removeIds = [] }, applyToFuture) => {
        const hasWork = Object.keys(updates).length > 0 || creates.length > 0 || removeIds.length > 0;
        if (!hasWork) return;
        try {
            setBulkSaving(true);

            let removedIds = [];
            let createdIds = [];
            let updateResult = null;

            // 1. Archive removed shifts first.
            if (removeIds.length > 0) {
                await api.bulkDeleteShifts(removeIds);
                removedIds = removeIds;
            }
            // 2. Create new shifts. The bulk-create endpoint applies one employeeId to
            // every entry (and overlap-checks against it), so group new rows by employee
            // and issue one create call per employee group.
            if (creates.length > 0) {
                const byEmployee = {};
                for (const c of creates) {
                    const key = String(c.employeeId || '');
                    (byEmployee[key] ||= []).push(c);
                }
                for (const [empKey, group] of Object.entries(byEmployee)) {
                    const created = await api.createShift({
                        clientId: group[0].clientId,
                        employeeId: empKey ? Number(empKey) : undefined,
                        shifts: group.map(c => ({
                            serviceCode: c.serviceCode,
                            shiftDate: c.shiftDate,
                            startTime: c.startTime,
                            endTime: c.endTime,
                            accountNumber: c.accountNumber || undefined,
                            sandataClientId: c.sandataClientId || undefined,
                        })),
                    });
                    createdIds.push(...(created?.shifts || []).map(s => s.id));
                }
            }
            // 3. Apply per-shift edits to existing shifts (server-side overlap check applies).
            if (Object.keys(updates).length > 0) {
                updateResult = await api.bulkUpdateShiftsPerShift(updates, applyToFuture);
            }

            setSelectedShiftIds(new Set());
            setBulkEditMode(false);
            setModal(null);
            refetchAll();
            fetchBatches();

            const parts = [];
            if (updateResult?.count) parts.push(`updated ${updateResult.count}`);
            if (createdIds.length) parts.push(`added ${createdIds.length}`);
            if (removedIds.length) parts.push(`removed ${removedIds.length}`);
            if (updateResult?.futureUpdated) parts.push(`+${updateResult.futureUpdated} future`);
            const msg = parts.length ? `Shifts: ${parts.join(', ')}` : 'Shifts updated';
            showToast(msg, 'success');

            undoState.pushAction(
                msg,
                async () => {
                    if (updateResult?.batchId) await api.bulkUndoShifts(updateResult.batchId);
                    if (createdIds.length) await api.bulkDeleteShifts(createdIds);
                    if (removedIds.length) await api.restoreShifts(removedIds);
                    refetchAll(); fetchBatches();
                },
                async () => {}
            );
        } catch (err) {
            // Overlaps (or any failure) block the composer save. Keep the modal open.
            showToast(err.message, err.isOverlap ? 'warning' : 'error');
            refetchAll();
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkDeleteByIds = async (shiftIds) => {
        try {
            setBulkSaving(true);
            const result = await api.bulkDeleteShifts(shiftIds);
            setSelectedShiftIds(new Set());
            setBulkEditMode(false);
            setModal(null);
            refetchAll();
            fetchBatches();
            addUndoBanner(`Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`, result.batchId);
            undoState.pushAction(
                `Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`,
                async () => { await api.bulkUndoShifts(result.batchId); refetchAll(); fetchBatches(); },
                async () => { await api.bulkDeleteShifts(shiftIds); refetchAll(); fetchBatches(); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedShiftIds.size === 0) return;
        const selected = allShifts.filter(s => selectedShiftIds.has(s.id));
        showDeleteConfirm([...selectedShiftIds], selected);
    };

    const handleFutureBulkDelete = async (shiftIds) => {
        try {
            setBulkSaving(true);
            const result = await api.bulkDeleteShifts(shiftIds);
            fetchFutureShifts();
            addUndoBanner(`Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`, result.batchId);
            undoState.pushAction(
                `Archived ${result.archived} shift${result.archived !== 1 ? 's' : ''}`,
                async () => { await api.bulkUndoShifts(result.batchId); refetchAll(); fetchBatches(); },
                async () => { await api.bulkDeleteShifts(shiftIds); refetchAll(); fetchBatches(); }
            );
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setBulkSaving(false);
        }
    };

    const selectShiftsByDay = (dayIdx) => {
        const ws = new Date(weekStart + 'T00:00:00');
        const d = new Date(ws);
        d.setDate(ws.getDate() + dayIdx);
        const dateStr = toLocalDateStr(d);
        const dayShiftIds = allShifts.filter(s => toLocalDateStr(s.shiftDate) === dateStr).map(s => s.id);
        setSelectedShiftIds(prev => {
            const next = new Set(prev);
            const allAlreadySelected = dayShiftIds.every(id => next.has(id));
            if (allAlreadySelected) {
                dayShiftIds.forEach(id => next.delete(id));
            } else {
                dayShiftIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const selectShiftsByEmployee = (empName) => {
        const empShiftIds = allShifts.filter(s => (s.displayEmployeeName || '') === empName).map(s => s.id);
        setSelectedShiftIds(prev => {
            const next = new Set(prev);
            const allAlreadySelected = empShiftIds.every(id => next.has(id));
            if (allAlreadySelected) {
                empShiftIds.forEach(id => next.delete(id));
            } else {
                empShiftIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const selectShiftsByClient = (clientName) => {
        const ids = allShifts.filter(s => (s.client?.clientName || '') === clientName).map(s => s.id);
        setSelectedShiftIds(prev => {
            const next = new Set(prev);
            const allAlreadySelected = ids.every(id => next.has(id));
            if (allAlreadySelected) {
                ids.forEach(id => next.delete(id));
            } else {
                ids.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const allOverlapIds = useMemo(() => {
        const set = new Set();
        for (const o of allOverlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [allOverlaps]);

    const monthOverlapIds = useMemo(() => {
        const set = new Set();
        for (const o of monthOverlaps) { set.add(o.shiftA); set.add(o.shiftB); }
        return set;
    }, [monthOverlaps]);

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

    return (
        <>
            <GlobalToolbar
                title="Scheduling"
                subtitle="Plan and manage caregiver shifts"
                icon={Icons.calendar}
                undoState={undoState}
                activityEntity="Shift"
                trashConfig={{
                    items: archivedShifts || [],
                    batches: bulkBatches.filter(b => b.action === 'ARCHIVE' && !b.undoneAt),
                    onRestore: async (ids) => {
                        await api.restoreShifts(ids);
                        refetchAll();
                        fetchArchivedShifts();
                        fetchBatches();
                        showToast(`Restored ${ids.length} shift${ids.length !== 1 ? 's' : ''}`);
                    },
                    onRestoreBatch: async (batchId) => {
                        await api.bulkUndoShifts(batchId);
                        refetchAll();
                        fetchArchivedShifts();
                        fetchBatches();
                        showToast('Batch restored');
                    },
                    onPermanentDelete: async (ids) => {
                        await api.permanentDeleteShifts(ids);
                        fetchArchivedShifts();
                        showToast(`Permanently deleted ${ids.length} shift${ids.length !== 1 ? 's' : ''}`);
                    },
                    entityLabel: 'shifts',
                }}
            />
            <ContextBar>
                <ContextBar.Right>
                    <button className="btn btn--outline btn--sm" onClick={() => setModal({ type: 'bulkEdit' })} disabled={allShifts.length === 0}>
                        {Icons.edit} Bulk Edit
                    </button>
                    <button className="btn btn--primary" onClick={() => setModal({ type: 'shift', shift: null, defaultClientId: viewMode === 'future' ? futureFilterContext.clientId : selectedClientId, defaultEmployeeId: viewMode === 'future' ? futureFilterContext.employeeId : selectedEmployeeId })}>
                        {Icons.plus} Create Shift
                    </button>
                </ContextBar.Right>
            </ContextBar>

            <div className="page-content">

                {/* Undo Banners */}
                {undoBanners.map(banner => (
                    <UndoBanner
                        key={banner.id}
                        message={banner.message}
                        onUndo={async () => {
                            await api.bulkUndoShifts(banner.batchId);
                            refetchAll();
                            fetchBatches();
                        }}
                        onDismiss={() => removeUndoBanner(banner.id)}
                    />
                ))}

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
                        pdfWeekStart={clientWeekStart}
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
                                <InlineWeekPicker weekStart={clientWeekStart} setWeekStart={setClientWeekStart} />
                                {clientInfo && (
                                    <div className="sched-client-info">
                                        <div className="sched-client-info__details">
                                            {clientInfo.address && <span className="sched-client-info__tag"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientInfo.address)}`} target="_blank" rel="noopener noreferrer">{clientInfo.address}</a></span>}
                                            {clientInfo.phone && <span className="sched-client-info__tag">{clientInfo.phone}</span>}
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
                                                <th>Auth</th>
                                                <th>Sched</th>
                                                <th>Remain</th>
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
                                                        <td>{authHrs}h</td>
                                                        <td>{schedHrs}h</td>
                                                        <td style={{ color: remainHrs < 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{remainHrs}h</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                                {clientShifts.length > 0 && (() => {
                                    const activeShifts = clientShifts.filter(s => s.status !== 'cancelled');
                                    const weeklyHrs = Math.round(activeShifts.reduce((sum, s) => sum + (s.hours || 0), 0) * 100) / 100;

                                    const ws = new Date(clientWeekStart + 'T00:00:00');
                                    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                    const dailyTotals = [];
                                    for (let i = 0; i < 7; i++) {
                                        const d = new Date(ws);
                                        d.setDate(ws.getDate() + i);
                                        const dateStr = toLocalDateStr(d);
                                        const dayHrs = activeShifts.filter(s => toLocalDateStr(s.shiftDate) === dateStr).reduce((sum, s) => sum + (s.hours || 0), 0);
                                        dailyTotals.push({ abbr: dayAbbr[i], hrs: Math.round(dayHrs * 100) / 100 });
                                    }

                                    const employeeMap = new Map();
                                    for (const s of activeShifts) {
                                        const name = s.employee?.name || s.displayEmployeeName || s.employeeName || 'Unassigned';
                                        employeeMap.set(name, (employeeMap.get(name) || 0) + (s.hours || 0));
                                    }
                                    const employeeBreakdown = [...employeeMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, hrs]) => ({ name, hrs: Math.round(hrs * 100) / 100 }));

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
                                            {employeeBreakdown.length > 0 && (
                                                <div className="sched-emp-totals__clients">
                                                    <span className="sched-emp-totals__clients-label">Per Employee</span>
                                                    {employeeBreakdown.map(e => (
                                                        <div key={e.name} className="sched-emp-totals__client-row">
                                                            <span>{e.name}</span>
                                                            <span className="sched-emp-totals__client-hrs">{e.hrs} hrs</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                <div className="sched-card__view-tabs">
                                    <button className={`sched-card__view-tab ${clientScheduleView === 'matrix' ? 'sched-card__view-tab--active' : ''}`} onClick={() => setClientScheduleView('matrix')}>List</button>
                                    <button className={`sched-card__view-tab ${clientScheduleView === 'calendar' ? 'sched-card__view-tab--active' : ''}`} onClick={() => setClientScheduleView('calendar')}>Calendar</button>
                                </div>
                                {clientScheduleView === 'calendar' ? (
                                    <WeeklyCalendarView shifts={clientShifts} weekStart={clientWeekStart} overlapIds={clientOverlapIds} onEditShift={handleEditShift} onAddShift={handleAddShift} groupBy="employee" compact />
                                ) : (
                                    <ScheduleMatrix shifts={clientShifts} weekStart={clientWeekStart} rowBy="employee" onEditShift={handleEditShift} overlapIds={clientOverlapIds} clientColorMap={null} />
                                )}
                            </>
                        )}
                    </ScheduleCard>

                    <ScheduleCard
                        title="Employee Schedule"
                        icon={Icons.user}
                        showPdf={!!selectedEmployeeId && employeeShifts.length > 0}
                        pdfShifts={employeeShifts}
                        pdfWeekStart={employeeWeekStart}
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
                                <InlineWeekPicker weekStart={employeeWeekStart} setWeekStart={setEmployeeWeekStart} />
                                {employeeInfo && (
                                    <div className="sched-employee-info">
                                        <strong>{employeeInfo.name}</strong>
                                        {employeeInfo.phone && <span>{employeeInfo.phone}</span>}
                                        {employeeInfo.email && <span>{employeeInfo.email}</span>}
                                        {employeeInfo.address && <span><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(employeeInfo.address)}`} target="_blank" rel="noopener noreferrer">{employeeInfo.address}</a></span>}
                                    </div>
                                )}
                                {employeeShifts.length > 0 && (() => {
                                    const activeShifts = employeeShifts.filter(s => s.status !== 'cancelled');
                                    const weeklyHrs = Math.round(activeShifts.reduce((sum, s) => sum + (s.hours || 0), 0) * 100) / 100;

                                    // Daily totals
                                    const ws = new Date(employeeWeekStart + 'T00:00:00');
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
                                <div className="sched-card__view-tabs">
                                    <button className={`sched-card__view-tab ${employeeScheduleView === 'matrix' ? 'sched-card__view-tab--active' : ''}`} onClick={() => setEmployeeScheduleView('matrix')}>List</button>
                                    <button className={`sched-card__view-tab ${employeeScheduleView === 'calendar' ? 'sched-card__view-tab--active' : ''}`} onClick={() => setEmployeeScheduleView('calendar')}>Calendar</button>
                                </div>
                                {employeeScheduleView === 'calendar' ? (
                                    <WeeklyCalendarView shifts={employeeShifts} weekStart={employeeWeekStart} overlapIds={employeeOverlapIds} onEditShift={handleEditShift} onAddShift={handleAddShift} groupBy="client" compact />
                                ) : (
                                    <ScheduleMatrix shifts={employeeShifts} weekStart={employeeWeekStart} rowBy="client" onEditShift={handleEditShift} overlapIds={employeeOverlapIds} clientColorMap={employeeClientColorMap} />
                                )}
                            </>
                        )}
                    </ScheduleCard>
                </div>


                {viewMode === 'week' && (
                <ScheduleCard
                    title="Weekly Schedule Overview"
                    icon={Icons.table}
                    showPdf={allShifts.length > 0}
                    pdfShifts={allShifts}
                    pdfWeekStart={weekStart}
                    pdfRowBy={summaryViewBy}
                    headerActions={
                        <div className="sched-header-controls">
                            <div className="sched-view-switcher">
                                <button className={`sched-view-switcher__btn ${viewMode === 'week' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'month' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'future' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('future')}>Future</button>
                            </div>
                            <div className="sched-view-switcher">
                                <button className={`sched-view-switcher__btn ${summaryViewBy === 'client' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setSummaryViewBy('client')}>Client</button>
                                <button className={`sched-view-switcher__btn ${summaryViewBy === 'employee' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setSummaryViewBy('employee')}>Employee</button>
                            </div>
                        </div>
                    }
                >
                    <InlineWeekPicker weekStart={weekStart} setWeekStart={setWeekStart} />
                    {loadingAll ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'hsl(var(--muted-foreground))' }}>Loading shifts…</div>
                    ) : allShifts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>
                            No shifts scheduled this week. Click + Create Shift to get started.
                        </div>
                    ) : (
                        <WeeklyCalendarView shifts={allShifts} weekStart={weekStart} overlapIds={allOverlapIds} onEditShift={handleEditShift} onAddShift={handleAddShift} bulkEditMode={false} selectedShiftIds={selectedShiftIds} onToggleSelect={toggleShiftSelection} groupBy={summaryViewBy} />
                    )}
                </ScheduleCard>
                )}

                {viewMode === 'month' && (
                <ScheduleCard title="Monthly Schedule" icon={Icons.calendar} collapsible={false}
                    headerActions={
                        <div className="sched-header-controls">
                            <div className="sched-view-switcher">
                                <button className={`sched-view-switcher__btn ${viewMode === 'week' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'month' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'future' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('future')}>Future</button>
                            </div>
                        </div>
                    }
                >
                    <div className="sched-month-nav">
                        <button className="sched-month-nav__btn" onClick={() => {
                            if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
                            else setViewMonth(m => m - 1);
                        }}>{Icons.chevronLeft}</button>
                        <span className="sched-month-nav__label">
                            {['January','February','March','April','May','June','July','August','September','October','November','December'][viewMonth]} {viewYear}
                        </span>
                        <button className="sched-month-nav__btn" onClick={() => {
                            if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
                            else setViewMonth(m => m + 1);
                        }}>{Icons.chevronRight}</button>
                    </div>
                    {loadingMonth ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'hsl(var(--muted-foreground))' }}>Loading month…</div>
                    ) : (
                        <MonthlyCalendarView
                            shifts={monthShifts}
                            month={viewMonth}
                            year={viewYear}
                            overlapIds={monthOverlapIds}
                            onEditShift={handleEditShift}
                            onDayClick={(dateStr) => {
                                const d = new Date(dateStr + 'T12:00:00');
                                d.setDate(d.getDate() - d.getDay());
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, '0');
                                const day = String(d.getDate()).padStart(2, '0');
                                setWeekStart(`${y}-${m}-${day}`);
                                setViewMode('week');
                            }}
                        />
                    )}
                </ScheduleCard>
                )}

                {viewMode === 'future' && (
                <ScheduleCard title="Future Shifts" icon={Icons.calendar} collapsible={false}
                    headerActions={
                        <div className="sched-header-controls">
                            <div className="sched-view-switcher">
                                <button className={`sched-view-switcher__btn ${viewMode === 'week' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'month' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
                                <button className={`sched-view-switcher__btn ${viewMode === 'future' ? 'sched-view-switcher__btn--active' : ''}`} onClick={() => setViewMode('future')}>Future</button>
                            </div>
                        </div>
                    }
                >
                    <FutureShiftsView
                        shifts={futureShifts}
                        clients={clients}
                        employees={employees}
                        onEditShift={handleEditShift}
                        onBulkDelete={handleFutureBulkDelete}
                        loading={loadingFuture}
                        onFilterChange={setFutureFilterContext}
                    />
                </ScheduleCard>
                )}

                {/* Schedule Delivery */}
                {viewMode === 'week' && <ScheduleDelivery weekStart={weekStart} shifts={allShifts} />}

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
                    defaultClientId={modal.defaultClientId || selectedClientId || ''}
                    defaultEmployeeId={modal.defaultEmployeeId || selectedEmployeeId || ''}
                    clients={clients}
                    employees={employees}
                    weekStart={weekStart}
                    onSave={handleSaveShift}
                    onRepeat={handleRepeatShift}
                    onDelete={handleDeleteShift}
                    onFindCover={(s) => setModal({ type: 'callout', shift: s })}
                    onClose={(draft) => {
                        if (draft && !modal.shift) createDraftRef.current = draft;
                        setModal(null);
                    }}
                    draft={!modal.shift ? createDraftRef.current : null}
                    onClearDraft={() => { createDraftRef.current = null; }}
                />
            )}

            {/* Callout / replacement panel */}
            {modal?.type === 'callout' && (
                <CalloutPanel
                    shift={modal.shift}
                    employees={employees}
                    undoState={undoState}
                    // refetchAll refreshes whichever list the current view uses
                    // (all / client / employee), so undo and redo stay in sync
                    // with the DB regardless of how the page is filtered.
                    onShiftChanged={() => refetchAll()}
                    onClose={() => setModal(null)}
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
                                    <div key={i} className="sched-overlap-confirm__item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <span>
                                            <strong>{c.date}</strong> — conflicts with {c.conflictWith.clientName} ({hhmm12(c.conflictWith.startTime)} - {hhmm12(c.conflictWith.endTime)})
                                        </span>
                                        {isAdmin && c.conflictWith.id && (
                                            <button
                                                className="btn btn--danger btn--xs"
                                                onClick={async () => {
                                                    try {
                                                        await api.deleteShift(c.conflictWith.id);
                                                        showToast('Conflicting shift removed');
                                                        setModal(prev => ({
                                                            ...prev,
                                                            overlapWarning: null,
                                                            overlapData: null,
                                                            overlapConflicts: null,
                                                        }));
                                                        refetchAll();
                                                    } catch (err) { showToast(err.message, 'error'); }
                                                }}
                                            >
                                                {Icons.trash} Delete
                                            </button>
                                        )}
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

            {/* Bulk Edit Modal */}
            {modal?.type === 'bulkEdit' && (
                <BulkEditModal
                    allShifts={allShifts}
                    weekStart={weekStart}
                    employees={employees}
                    clients={clients}
                    onSave={handleBulkComposerSave}
                    onClose={() => setModal(null)}
                    saving={bulkSaving}
                    onUndo={async (batchId) => {
                        try {
                            await api.bulkUndoShifts(batchId);
                            showToast('Undo successful');
                            refetchAll();
                            fetchBatches();
                        } catch (err) { showToast(err.message, 'error'); }
                    }}
                    bulkBatches={bulkBatches}
                    defaultClientId={viewMode === 'future' ? futureFilterContext.clientId : selectedClientId}
                    defaultEmployeeId={viewMode === 'future' ? futureFilterContext.employeeId : selectedEmployeeId}
                />
            )}


            {/* DeleteConfirmModal */}
            {deleteConfirm && (
                <DeleteConfirmModal
                    title={`Delete ${deleteConfirm.items.length} shift${deleteConfirm.items.length !== 1 ? 's' : ''}?`}
                    items={deleteConfirm.items}
                    scopeWarning={deleteConfirm.scopeWarning}
                    onConfirm={async () => {
                        setDeleteConfirm(null);
                        await handleBulkDeleteByIds(deleteConfirm.shiftIds);
                    }}
                    onClose={() => setDeleteConfirm(null)}
                />
            )}
        </>
    );
}
