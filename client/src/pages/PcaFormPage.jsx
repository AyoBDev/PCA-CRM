import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Transfer', 'Eating/Feeding'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding', 'Other'];
const RESPITE_ACTIVITIES = ['Companionship', 'Safety Supervision', 'Community Activities', 'Other Approved Respite Tasks'];

function roundTo15(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    let rh = h, rm;
    if (m <= 7) rm = 0;
    else if (m <= 22) rm = 15;
    else if (m <= 37) rm = 30;
    else if (m <= 52) rm = 45;
    else { rh = h + 1; rm = 0; }
    return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const ri = roundTo15(timeIn), ro = roundTo15(timeOut);
    const [hI, mI] = ri.split(':').map(Number);
    const [hO, mO] = ro.split(':').map(Number);
    const diff = (hO * 60 + mO) - (hI * 60 + mI);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function totalHoursWithBlocks(entry, section) {
    let total = computeHours(entry[`${section}TimeIn`], entry[`${section}TimeOut`]);
    try {
        const blocks = JSON.parse(entry[`${section}TimeBlocks`] || '[]');
        for (const b of blocks) total += computeHours(b.in, b.out);
    } catch {}
    return Math.round(total * 100) / 100;
}

function hasActivity(entry, section) {
    try {
        const acts = JSON.parse(entry[`${section}Activities`] || '{}');
        return Object.values(acts).some(Boolean);
    } catch {
        return false;
    }
}

function getSunday(date) {
    const [y, m, d] = (typeof date === 'string' ? date : date.toISOString().slice(0, 10)).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    return dt.toISOString().slice(0, 10);
}

function ProgramSection({ title, colorClass, activities, section, entries, updateEntry, dailyHoursFn, disabled, sectionDisabled, onAddShift, onRemoveShift, fieldErrors = {} }) {
    const SHIFT_COLORS = ['', 'pcaf-shift--s2', 'pcaf-shift--s3', 'pcaf-shift--s4'];

    const totalHours = entries.reduce((s, e) => s + dailyHoursFn(e), 0);
    const totalUnits = Math.round(totalHours * 4);

    let maxBlocks = 0;
    for (const e of entries) {
        try {
            const blocks = JSON.parse(e[`${section}TimeBlocks`] || '[]');
            if (blocks.length > maxBlocks) maxBlocks = blocks.length;
        } catch {}
    }

    return (
        <div className={`pcaf-program ${sectionDisabled ? 'pcaf-program--disabled' : ''}`}>
            <div className={`pcaf-program__header pcaf-program__header--${colorClass}`}>
                <span className="pcaf-program__title">{title}</span>
            </div>

            <div className="pcaf-grid">
                {/* Column headers */}
                <div className="pcaf-grid__head">
                    <div className="pcaf-grid__label-col">ACTIVITIES</div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__day-col">
                            <div className="pcaf-grid__day-name">{DAY_SHORT[e.dayOfWeek]}</div>
                            <div className="pcaf-grid__day-date">{e.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}</div>
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col">TOTAL</div>
                </div>

                {/* Activity rows */}
                {activities.map((act) => (
                    <div key={act} className="pcaf-grid__row">
                        <div className="pcaf-grid__label-col">{act}</div>
                        {entries.map((entry, idx) => {
                            const acts = JSON.parse(entry[`${section}Activities`] || '{}');
                            const checked = !!acts[act];
                            return (
                                <div key={idx} className="pcaf-grid__cell">
                                    <input type="checkbox" checked={checked} disabled={disabled}
                                        onChange={() => {
                                            const next = { ...acts, [act]: !checked };
                                            updateEntry(idx, `${section}Activities`, JSON.stringify(next));
                                        }} />
                                </div>
                            );
                        })}
                        <div className="pcaf-grid__total-col" />
                    </div>
                ))}

                {/* PCA Initials */}
                <div className="pcaf-grid__row pcaf-grid__row--initials">
                    <div className="pcaf-grid__label-col"><strong>PCA Initials</strong></div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__cell">
                            <input type="text" className={`pcaf-initials-input ${fieldErrors[`${i}-${section}-pcaInitials`] ? 'pcaf-field-error' : ''}`} value={e[`${section}PcaInitials`] || ''} disabled={disabled} maxLength={4}
                                onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} />
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col" />
                </div>

                {/* Client Initials */}
                <div className="pcaf-grid__row pcaf-grid__row--initials">
                    <div className="pcaf-grid__label-col"><strong>Client Initials</strong></div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__cell">
                            <input type="text" className={`pcaf-initials-input ${fieldErrors[`${i}-${section}-clientInitials`] ? 'pcaf-field-error' : ''}`} value={e[`${section}ClientInitials`] || ''} disabled={disabled} maxLength={4}
                                onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} />
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col" />
                </div>

                {/* Shift 1: primary time */}
                <div className="pcaf-grid__row pcaf-grid__row--time">
                    <div className="pcaf-grid__label-col">Shift 1 - In</div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__cell">
                            <input type="time" className={`pcaf-time-input ${fieldErrors[`${i}-${section}-timeIn`] ? 'pcaf-field-error' : ''}`} value={e[`${section}TimeIn`] || ''} disabled={disabled}
                                onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} />
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col" />
                </div>
                <div className="pcaf-grid__row pcaf-grid__row--time">
                    <div className="pcaf-grid__label-col">Shift 1 - Out</div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__cell">
                            <input type="time" className={`pcaf-time-input ${fieldErrors[`${i}-${section}-timeOut`] ? 'pcaf-field-error' : ''}`} value={e[`${section}TimeOut`] || ''} disabled={disabled}
                                onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} />
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col" />
                </div>

                {/* Extra shifts */}
                {(() => {
                    const rows = [];
                    for (let b = 0; b < maxBlocks; b++) {
                        const colorCls = SHIFT_COLORS[b + 1] || SHIFT_COLORS[SHIFT_COLORS.length - 1];
                        rows.push(
                            <div key={`block-in-${b}`} className={`pcaf-grid__row pcaf-grid__row--time ${colorCls}`}>
                                <div className="pcaf-grid__label-col">
                                    Shift {b + 2} - In
                                    {!disabled && b === maxBlocks - 1 && (
                                        <button type="button" className="pcaf-remove-shift" title="Remove shift" onClick={() => onRemoveShift(section, b)}>x</button>
                                    )}
                                </div>
                                {entries.map((e, i) => {
                                    const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
                                    return (
                                        <div key={i} className="pcaf-grid__cell">
                                            <input type="time" className="pcaf-time-input" value={blocks[b]?.in || ''} disabled={disabled}
                                                onChange={(ev) => {
                                                    const updated = [...blocks];
                                                    if (!updated[b]) updated[b] = { in: '', out: '' };
                                                    updated[b] = { ...updated[b], in: ev.target.value };
                                                    updateEntry(i, `${section}TimeBlocks`, JSON.stringify(updated));
                                                }} />
                                        </div>
                                    );
                                })}
                                <div className="pcaf-grid__total-col" />
                            </div>,
                            <div key={`block-out-${b}`} className={`pcaf-grid__row pcaf-grid__row--time ${colorCls}`}>
                                <div className="pcaf-grid__label-col">Shift {b + 2} - Out</div>
                                {entries.map((e, i) => {
                                    const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
                                    return (
                                        <div key={i} className="pcaf-grid__cell">
                                            <input type="time" className="pcaf-time-input" value={blocks[b]?.out || ''} disabled={disabled}
                                                onChange={(ev) => {
                                                    const updated = [...blocks];
                                                    if (!updated[b]) updated[b] = { in: '', out: '' };
                                                    updated[b] = { ...updated[b], out: ev.target.value };
                                                    updateEntry(i, `${section}TimeBlocks`, JSON.stringify(updated));
                                                }} />
                                        </div>
                                    );
                                })}
                                <div className="pcaf-grid__total-col" />
                            </div>
                        );
                    }
                    return rows;
                })()}

                {/* Add Shift button */}
                {!disabled && (
                    <div className="pcaf-grid__row">
                        <div className="pcaf-grid__label-col">
                            <button type="button" className="pcaf-add-shift" onClick={() => onAddShift(section)}>+ Add Shift</button>
                        </div>
                        {entries.map((_, i) => <div key={i} className="pcaf-grid__cell" />)}
                        <div className="pcaf-grid__total-col" />
                    </div>
                )}

                {/* Daily totals row */}
                <div className={`pcaf-grid__row pcaf-grid__row--totals pcaf-grid__row--totals-${colorClass}`}>
                    <div className="pcaf-grid__label-col"><strong>Daily Total</strong></div>
                    {entries.map((e, i) => {
                        const hrs = dailyHoursFn(e);
                        return <div key={i} className="pcaf-grid__cell pcaf-hours-cell">{hrs > 0 ? hrs.toFixed(2) : '--'}</div>;
                    })}
                    <div className="pcaf-grid__total-col pcaf-hours-cell">
                        <strong>{totalHours.toFixed(2)}</strong>
                        <span className="pcaf-units-label">{totalUnits} units</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PcaFormPage() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pcaFullName, setPcaFullName] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [recipientSig, setRecipientSig] = useState('');
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState('');
    const [selectedWeekStart, setSelectedWeekStart] = useState('');
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const showToast = useCallback((msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }, []);

    const loadForm = useCallback((weekStart) => {
        setLoading(true);
        setError(null);
        setSubmitAttempted(false);
        setHasUnsavedChanges(false);
        api.getPcaForm(token, weekStart || undefined)
            .then((resp) => {
                setData(resp);
                setEntries(resp.timesheet.entries || []);
                setPcaFullName(resp.timesheet.pcaFullName || resp.pcaName || '');
                setPcaSig(resp.timesheet.pcaSignature || '');
                setRecipientName(resp.timesheet.recipientName || '');
                setRecipientSig(resp.timesheet.recipientSignature || '');
                const ws = resp.timesheet.weekStart?.split('T')[0] || '';
                setSelectedWeekStart(ws);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { loadForm(); }, [loadForm]);

    const enabledServices = data?.client?.enabledServices || [];
    const pasEnabled = enabledServices.includes('PAS');
    const hmEnabled = enabledServices.includes('Homemaker');
    const respiteEnabled = enabledServices.includes('Respite');
    const submitted = data?.timesheet?.status === 'submitted';
    const authLimits = data?.authLimits || {};

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
        setHasUnsavedChanges(true);
    };

    const handleAddShift = (section) => {
        setEntries(prev => prev.map(e => {
            const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
            blocks.push({ in: '', out: '' });
            return { ...e, [`${section}TimeBlocks`]: JSON.stringify(blocks) };
        }));
        setHasUnsavedChanges(true);
    };

    const handleRemoveShift = (section, blockIdx) => {
        setEntries(prev => prev.map(e => {
            const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
            blocks.splice(blockIdx, 1);
            return { ...e, [`${section}TimeBlocks`]: JSON.stringify(blocks) };
        }));
        setHasUnsavedChanges(true);
    };

    const adlHrs = (e) => totalHoursWithBlocks(e, 'adl');
    const iadlHrs = (e) => totalHoursWithBlocks(e, 'iadl');
    const respiteHrs = (e) => totalHoursWithBlocks(e, 'respite');
    const totalPas = entries.reduce((s, e) => s + adlHrs(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlHrs(e), 0);
    const totalRespite = entries.reduce((s, e) => s + respiteHrs(e), 0);
    const totalAll = totalPas + totalHm + totalRespite;

    const handleWeekChange = (sundayDate) => {
        const snapped = getSunday(sundayDate);
        setSelectedWeekStart(snapped);
        loadForm(snapped);
    };

    const navigateWeek = (dir) => {
        if (!selectedWeekStart) return;
        const [y, m, d] = selectedWeekStart.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + dir * 7));
        handleWeekChange(dt.toISOString().slice(0, 10));
    };

    const validationError = useMemo(() => {
        if (!data) return 'Loading...';
        if (!pcaFullName.trim()) return 'Enter PCA full name';
        if (!pcaSig) return 'PCA signature required';
        if (!recipientName.trim()) return 'Enter recipient name';
        if (!recipientSig) return 'Recipient signature required';
        for (const e of entries) {
            const sections = [];
            if (pasEnabled) sections.push('adl');
            if (hmEnabled) sections.push('iadl');
            if (respiteEnabled) sections.push('respite');
            for (const sec of sections) {
                const anyAct = hasActivity(e, sec);
                const anyInitials = e[`${sec}PcaInitials`] || e[`${sec}ClientInitials`];
                const anyTime = e[`${sec}TimeIn`] || e[`${sec}TimeOut`];
                if (anyAct || anyInitials || anyTime) {
                    if (!e[`${sec}TimeIn`] || !e[`${sec}TimeOut`]) return `Day ${DAY_SHORT[e.dayOfWeek]}: time in/out required`;
                    if (!e[`${sec}PcaInitials`]) return `Day ${DAY_SHORT[e.dayOfWeek]}: PCA initials required`;
                    if (!e[`${sec}ClientInitials`]) return `Day ${DAY_SHORT[e.dayOfWeek]}: client initials required`;
                }
            }
            if (hmEnabled && respiteEnabled && e.iadlTimeIn && e.iadlTimeOut && e.respiteTimeIn && e.respiteTimeOut) {
                const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                const aS = toMin(e.iadlTimeIn), aE = toMin(e.iadlTimeOut);
                const bS = toMin(e.respiteTimeIn), bE = toMin(e.respiteTimeOut);
                if (aS < bE && bS < aE) return `Day ${DAY_SHORT[e.dayOfWeek]}: Homemaker and Respite times overlap`;
            }
        }
        if (authLimits.PAS && Math.round(totalPas * 4) > authLimits.PAS.units) {
            return `PAS hours (${totalPas.toFixed(2)} hrs) exceed authorized limit of ${authLimits.PAS.hours} hrs`;
        }
        if (authLimits.Homemaker && Math.round(totalHm * 4) > authLimits.Homemaker.units) {
            return `Homemaker hours (${totalHm.toFixed(2)} hrs) exceed authorized limit of ${authLimits.Homemaker.hours} hrs`;
        }
        if (authLimits.Respite && Math.round(totalRespite * 4) > authLimits.Respite.units) {
            return `Respite hours (${totalRespite.toFixed(2)} hrs) exceed authorized limit of ${authLimits.Respite.hours} hrs`;
        }
        return null;
    }, [data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled, authLimits, totalPas, totalHm, totalRespite]);

    const fieldErrors = useMemo(() => {
        if (!submitAttempted || !data) return {};
        const errors = {};
        if (!pcaFullName.trim()) errors.pcaFullName = 'PCA name required';
        if (!pcaSig) errors.pcaSig = 'PCA signature required';
        if (!recipientName.trim()) errors.recipientName = 'Recipient name required';
        if (!recipientSig) errors.recipientSig = 'Recipient signature required';
        for (let idx = 0; idx < entries.length; idx++) {
            const e = entries[idx];
            const sections = [];
            if (pasEnabled) sections.push('adl');
            if (hmEnabled) sections.push('iadl');
            if (respiteEnabled) sections.push('respite');
            for (const sec of sections) {
                const anyAct = hasActivity(e, sec);
                const anyInitials = e[`${sec}PcaInitials`] || e[`${sec}ClientInitials`];
                const anyTime = e[`${sec}TimeIn`] || e[`${sec}TimeOut`];
                if (anyAct || anyInitials || anyTime) {
                    if (!e[`${sec}TimeIn`]) errors[`${idx}-${sec}-timeIn`] = 'Required';
                    if (!e[`${sec}TimeOut`]) errors[`${idx}-${sec}-timeOut`] = 'Required';
                    if (!e[`${sec}PcaInitials`]) errors[`${idx}-${sec}-pcaInitials`] = 'Required';
                    if (!e[`${sec}ClientInitials`]) errors[`${idx}-${sec}-clientInitials`] = 'Required';
                }
            }
        }
        return errors;
    }, [submitAttempted, data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled]);

    const buildPayload = (action) => ({
        action,
        weekStart: selectedWeekStart || undefined,
        entries: entries.map((e) => ({
            id: e.id, dayOfWeek: e.dayOfWeek, dateOfService: e.dateOfService,
            adlActivities: e.adlActivities || '{}', adlTimeIn: e.adlTimeIn || null, adlTimeOut: e.adlTimeOut || null,
            adlPcaInitials: e.adlPcaInitials || '', adlClientInitials: e.adlClientInitials || '',
            adlTimeBlocks: e.adlTimeBlocks || '[]',
            iadlActivities: e.iadlActivities || '{}', iadlTimeIn: e.iadlTimeIn || null, iadlTimeOut: e.iadlTimeOut || null,
            iadlPcaInitials: e.iadlPcaInitials || '', iadlClientInitials: e.iadlClientInitials || '',
            iadlTimeBlocks: e.iadlTimeBlocks || '[]',
            respiteActivities: e.respiteActivities || '{}', respiteTimeIn: e.respiteTimeIn || null, respiteTimeOut: e.respiteTimeOut || null,
            respitePcaInitials: e.respitePcaInitials || '', respiteClientInitials: e.respiteClientInitials || '',
            respiteTimeBlocks: e.respiteTimeBlocks || '[]',
        })),
        pcaFullName,
        pcaSignature: pcaSig,
        recipientName,
        recipientSignature: recipientSig,
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const resp = await api.updatePcaForm(token, buildPayload('save'));
            setData(resp);
            setEntries(resp.timesheet.entries || []);
            setHasUnsavedChanges(false);
            showToast('Progress saved');
        } catch (err) {
            showToast(err.message);
        }
        setSaving(false);
    };

    const handleSubmit = async () => {
        setSubmitAttempted(true);
        if (validationError) {
            showToast(validationError);
            setTimeout(() => {
                const el = document.querySelector('.pcaf-field-error, .pcaf-name-error, .pcaf-sig-error');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
            return;
        }
        setSubmitting(true);
        try {
            const resp = await api.updatePcaForm(token, buildPayload('submit'));
            setData(resp);
            setEntries(resp.timesheet.entries || []);
            setHasUnsavedChanges(false);
            setSubmitAttempted(false);
            showToast('Timesheet submitted!');
        } catch (err) {
            showToast(err.message);
        }
        setSubmitting(false);
    };

    if (!data && loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
    if (!data && error) return <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--destructive))' }}>{error}</div>;
    if (!data) return null;

    const weekLabel = formatWeek(selectedWeekStart || data.timesheet.weekStart.split('T')[0]);

    return (
        <div className="pcaf-page">
            {/* Title */}
            <div className="pcaf-title-bar">
                <h1 className="pcaf-title">PCA SERVICE DELIVERY RECORD</h1>
            </div>

            {/* Week Picker */}
            <div className="pcaf-week-row">
                <button type="button" className="pcaf-week-arrow" onClick={() => navigateWeek(-1)}>&lsaquo;</button>
                <div className="pcaf-week-display">
                    <label className="pcaf-week-label">Week of Sunday:</label>
                    <input type="date" className="pcaf-week-input" value={selectedWeekStart} onChange={(e) => handleWeekChange(e.target.value)} />
                </div>
                <button type="button" className="pcaf-week-arrow" onClick={() => navigateWeek(1)}>&rsaquo;</button>
                <span className="pcaf-week-range">{weekLabel}</span>
            </div>

            {/* Client Info Row */}
            <div className="pcaf-info-row">
                <div className="pcaf-info-item">
                    <span className="pcaf-info-label">Client</span>
                    <span className="pcaf-info-value">{data.client.clientName}</span>
                </div>
                <div className="pcaf-info-item">
                    <span className="pcaf-info-label">Medicaid ID</span>
                    <span className="pcaf-info-value">{data.client.medicaidId || '--'}</span>
                </div>
                <div className="pcaf-info-item">
                    <span className="pcaf-info-label">PCA Caregiver</span>
                    <span className="pcaf-info-value">{data.pcaName}</span>
                </div>
                <div className="pcaf-info-item">
                    <span className="pcaf-info-label">Status</span>
                    <span className={`pcaf-status-badge pcaf-status-badge--${submitted ? 'submitted' : 'draft'}`}>
                        {submitted ? 'Submitted' : 'In Progress'}
                    </span>
                </div>
            </div>

            {/* Authorized Hours Bar */}
            {Object.keys(authLimits).length > 0 && (
                <div className="pcaf-auth-bar">
                    <span className="pcaf-auth-title">Authorized Hours</span>
                    {authLimits.PAS && (
                        <span className={`pcaf-auth-badge pcaf-auth-badge--pas${Math.round(totalPas * 4) > authLimits.PAS.units ? ' pcaf-auth-badge--exceeded' : ''}`}>
                            PAS: {authLimits.PAS.hours} hrs
                        </span>
                    )}
                    {authLimits.Homemaker && (
                        <span className={`pcaf-auth-badge pcaf-auth-badge--hm${Math.round(totalHm * 4) > authLimits.Homemaker.units ? ' pcaf-auth-badge--exceeded' : ''}`}>
                            Homemaker: {authLimits.Homemaker.hours} hrs
                        </span>
                    )}
                    {authLimits.Respite && (
                        <span className={`pcaf-auth-badge pcaf-auth-badge--respite${Math.round(totalRespite * 4) > authLimits.Respite.units ? ' pcaf-auth-badge--exceeded' : ''}`}>
                            Respite: {authLimits.Respite.hours} hrs
                        </span>
                    )}
                    <span className="pcaf-auth-badge pcaf-auth-badge--total">
                        Total: {(authLimits.PAS?.hours || 0) + (authLimits.Homemaker?.hours || 0) + (authLimits.Respite?.hours || 0)} hrs
                    </span>
                </div>
            )}

            {/* Unsaved changes warning */}
            {!submitted && hasUnsavedChanges && (
                <div className="pcaf-unsaved-banner">
                    You have unsaved changes. Click <strong>Save Progress</strong> to keep your work.
                </div>
            )}

            {/* Main form content */}
            <div className="pcaf-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
                ) : error ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--destructive))' }}>{error}</div>
                ) : (
                    <>
                        {/* PAS Section */}
                        {pasEnabled && (
                            <ProgramSection
                                title="PAS (PERSONAL ASSISTANCE SERVICES)"
                                colorClass="pas"
                                activities={ADL_ACTIVITIES}
                                section="adl"
                                entries={entries}
                                updateEntry={updateEntry}
                                dailyHoursFn={adlHrs}
                                disabled={submitted}
                                sectionDisabled={false}
                                onAddShift={handleAddShift}
                                onRemoveShift={handleRemoveShift}
                                fieldErrors={fieldErrors}
                            />
                        )}

                        {/* Homemaker Section */}
                        {hmEnabled && (
                            <ProgramSection
                                title="HOMEMAKER (IADL SERVICES)"
                                colorClass="hm"
                                activities={IADL_ACTIVITIES}
                                section="iadl"
                                entries={entries}
                                updateEntry={updateEntry}
                                dailyHoursFn={iadlHrs}
                                disabled={submitted}
                                sectionDisabled={false}
                                onAddShift={handleAddShift}
                                onRemoveShift={handleRemoveShift}
                                fieldErrors={fieldErrors}
                            />
                        )}

                        {/* Respite Section */}
                        {respiteEnabled && (
                            <ProgramSection
                                title="RESPITE (COMPANION CARE SERVICES)"
                                colorClass="respite"
                                activities={RESPITE_ACTIVITIES}
                                section="respite"
                                entries={entries}
                                updateEntry={updateEntry}
                                dailyHoursFn={respiteHrs}
                                disabled={submitted}
                                sectionDisabled={false}
                                onAddShift={handleAddShift}
                                onRemoveShift={handleRemoveShift}
                                fieldErrors={fieldErrors}
                            />
                        )}

                        {/* Weekly Total Bar */}
                        <div className="pcaf-weekly-total">
                            <div className="pcaf-weekly-total__header">WEEKLY TOTAL</div>
                            <div className="pcaf-weekly-total__body">
                                <div className="pcaf-weekly-total__item">
                                    <span className="pcaf-weekly-total__label">Total All Programs</span>
                                    <span className="pcaf-weekly-total__value">{totalAll.toFixed(2)} hrs / {Math.round(totalAll * 4)} units</span>
                                </div>
                                {pasEnabled && (
                                    <div className={`pcaf-weekly-total__item pcaf-weekly-total__item--pas${authLimits.PAS && Math.round(totalPas * 4) > authLimits.PAS.units ? ' pcaf-weekly-total__item--exceeded' : ''}`}>
                                        <span className="pcaf-weekly-total__label">PAS</span>
                                        <span className="pcaf-weekly-total__value">{totalPas.toFixed(2)} hrs / {Math.round(totalPas * 4)} units{authLimits.PAS ? ` of ${authLimits.PAS.units}` : ''}</span>
                                    </div>
                                )}
                                {hmEnabled && (
                                    <div className={`pcaf-weekly-total__item pcaf-weekly-total__item--hm${authLimits.Homemaker && Math.round(totalHm * 4) > authLimits.Homemaker.units ? ' pcaf-weekly-total__item--exceeded' : ''}`}>
                                        <span className="pcaf-weekly-total__label">Homemaker</span>
                                        <span className="pcaf-weekly-total__value">{totalHm.toFixed(2)} hrs / {Math.round(totalHm * 4)} units{authLimits.Homemaker ? ` of ${authLimits.Homemaker.units}` : ''}</span>
                                    </div>
                                )}
                                {respiteEnabled && (
                                    <div className={`pcaf-weekly-total__item pcaf-weekly-total__item--respite${authLimits.Respite && Math.round(totalRespite * 4) > authLimits.Respite.units ? ' pcaf-weekly-total__item--exceeded' : ''}`}>
                                        <span className="pcaf-weekly-total__label">Respite</span>
                                        <span className="pcaf-weekly-total__value">{totalRespite.toFixed(2)} hrs / {Math.round(totalRespite * 4)} units{authLimits.Respite ? ` of ${authLimits.Respite.units}` : ''}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tip */}
                        {!submitted && hmEnabled && respiteEnabled && (
                            <p className="pcaf-tip">Homemaker and Respite times cannot overlap on the same day. Each section tracks its own shifts independently.</p>
                        )}

                        {/* Signature Section */}
                        <div className="pcaf-signatures">
                            <div className="pcaf-signatures__header">ACKNOWLEDGEMENT AND REQUIRED SIGNATURES</div>
                            <div className="pcaf-signatures__body">
                                <div className="pcaf-signatures__grid">
                                    <div className={`pcaf-signatures__field ${fieldErrors.pcaFullName ? 'pcaf-name-error' : ''}`}>
                                        <label>PCA Name (First, MI, Last)</label>
                                        <input type="text" value={pcaFullName} onChange={(e) => { setPcaFullName(e.target.value); setHasUnsavedChanges(true); }} disabled={submitted} placeholder="Jane A. Doe" />
                                    </div>
                                    <div className={`pcaf-signatures__field ${fieldErrors.recipientName ? 'pcaf-name-error' : ''}`}>
                                        <label>Recipient Name (First, MI, Last)</label>
                                        <input type="text" value={recipientName} onChange={(e) => { setRecipientName(e.target.value); setHasUnsavedChanges(true); }} disabled={submitted} placeholder="John B. Client" />
                                    </div>
                                </div>
                                <div className={`pcaf-signatures__pad ${fieldErrors.pcaSig ? 'pcaf-sig-error' : ''}`}>
                                    <SignaturePad label="PCA Signature *" value={pcaSig} onChange={(v) => { setPcaSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                                </div>
                                <div className={`pcaf-signatures__pad ${fieldErrors.recipientSig ? 'pcaf-sig-error' : ''}`}>
                                    <SignaturePad label="Recipient / Responsible Party Signature *" value={recipientSig} onChange={(v) => { setRecipientSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        {!submitted && (
                            <div className="pcaf-actions">
                                <button className="pcaf-btn pcaf-btn--outline" onClick={handleSave} disabled={saving || submitting}>{saving ? 'Saving...' : 'Save Progress'}</button>
                                <button className="pcaf-btn pcaf-btn--primary" onClick={handleSubmit} disabled={submitting || saving}>{submitting ? 'Submitting...' : 'Submit Timesheet'}</button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {toast && <div className="pcaf-toast">{toast}</div>}
        </div>
    );
}
