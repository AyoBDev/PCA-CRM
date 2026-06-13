import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';
import { useIsMobile } from '../hooks/useIsMobile';
import MobileDayTabs from '../components/pca-form/MobileDayTabs';
import MobileDayCard from '../components/pca-form/MobileDayCard';
import MobileSummaryTab from '../components/pca-form/MobileSummaryTab';
import MobileAuthBar from '../components/pca-form/MobileAuthBar';
import { ADL_ACTIVITIES, IADL_ACTIVITIES, RESPITE_ACTIVITIES, COMPANION_ACTIVITIES } from '../utils/constants';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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

function ProgramSection({ title, icon, colorClass, activities, section, entries, updateEntry, dailyHoursFn, disabled, sectionDisabled, onAddShift, onRemoveShift, fieldErrors = {} }) {
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
                <span className="pcaf-program__icon">{icon}</span>
                <span className="pcaf-program__name">{title}</span>
                <span className="pcaf-program__subtitle">{colorClass === 'pas' ? '(PERSONAL ASSISTANCE SERVICES)' : colorClass === 'hm' ? '(IADL SERVICES)' : '(COMPANION CARE SERVICES)'}</span>
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
                    <div className="pcaf-grid__label-col"><strong>PCA Initials *</strong></div>
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
                    <div className="pcaf-grid__label-col"><strong>Client Initials *</strong></div>
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
                    <div className="pcaf-grid__label-col">Shift 1 &mdash; In *</div>
                    {entries.map((e, i) => (
                        <div key={i} className="pcaf-grid__cell">
                            <input type="time" className={`pcaf-time-input ${fieldErrors[`${i}-${section}-timeIn`] ? 'pcaf-field-error' : ''}`} value={e[`${section}TimeIn`] || ''} disabled={disabled}
                                onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} />
                        </div>
                    ))}
                    <div className="pcaf-grid__total-col" />
                </div>
                <div className="pcaf-grid__row pcaf-grid__row--time">
                    <div className="pcaf-grid__label-col">Shift 1 &mdash; Out *</div>
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
                                    Shift {b + 2} &mdash; In
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
                                <div className="pcaf-grid__label-col">Shift {b + 2} &mdash; Out</div>
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
                <div className="pcaf-grid__row pcaf-grid__row--totals">
                    <div className="pcaf-grid__label-col"><strong>Daily Totals</strong></div>
                    {entries.map((e, i) => {
                        const hrs = dailyHoursFn(e);
                        return <div key={i} className="pcaf-grid__cell pcaf-hours-cell">{hrs > 0 ? hrs.toFixed(2) : '—'}</div>;
                    })}
                    <div className={`pcaf-grid__total-col pcaf-section-total pcaf-section-total--${colorClass}`}>
                        <span className="pcaf-section-total__label">HOURS</span>
                        <span className="pcaf-section-total__hrs">{totalHours.toFixed(2)}</span>
                        <span className="pcaf-section-total__label">UNITS</span>
                        <span className="pcaf-section-total__units">{totalUnits}</span>
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
    const isMobile = useIsMobile();
    const [activeDay, setActiveDay] = useState(() => new Date().getDay());

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

    useEffect(() => {
        if (!isMobile || !selectedWeekStart) return;
        const today = new Date();
        const weekStart = new Date(selectedWeekStart + 'T00:00:00');
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (today >= weekStart && today <= weekEnd) {
            setActiveDay(today.getDay());
        } else {
            setActiveDay(0);
        }
    }, [selectedWeekStart, isMobile]);

    const enabledServices = data?.client?.enabledServices || [];
    const pasEnabled = enabledServices.includes('PAS');
    const hmEnabled = enabledServices.includes('Homemaker');
    const respiteEnabled = enabledServices.includes('Respite');
    const companionEnabled = enabledServices.includes('Companion');
    const submitted = data?.timesheet?.status === 'submitted';
    const authLimits = data?.authLimits || {};

    const enabledSectionKeys = useMemo(() => {
        const keys = [];
        if (pasEnabled) keys.push('adl');
        if (hmEnabled) keys.push('iadl');
        if (respiteEnabled) keys.push('respite');
        if (companionEnabled) keys.push('companion');
        return keys;
    }, [pasEnabled, hmEnabled, respiteEnabled, companionEnabled]);

    const enabledSectionsForCard = useMemo(() => {
        const sections = [];
        if (pasEnabled) sections.push({ key: 'adl', title: 'PAS', colorClass: 'pas', activities: ADL_ACTIVITIES });
        if (hmEnabled) sections.push({ key: 'iadl', title: 'HOMEMAKER', colorClass: 'hm', activities: IADL_ACTIVITIES });
        if (respiteEnabled) sections.push({ key: 'respite', title: 'RESPITE', colorClass: 'respite', activities: RESPITE_ACTIVITIES });
        if (companionEnabled) sections.push({ key: 'companion', title: 'COMPANION', colorClass: 'companion', activities: COMPANION_ACTIVITIES });
        return sections;
    }, [pasEnabled, hmEnabled, respiteEnabled, companionEnabled]);

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
    const companionHrs = (e) => totalHoursWithBlocks(e, 'companion');
    const totalPas = entries.reduce((s, e) => s + adlHrs(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlHrs(e), 0);
    const totalRespite = entries.reduce((s, e) => s + respiteHrs(e), 0);
    const totalCompanion = entries.reduce((s, e) => s + companionHrs(e), 0);
    const totalAll = totalPas + totalHm + totalRespite + totalCompanion;

    const dailyHoursFns = useMemo(() => ({
        adl: adlHrs,
        iadl: iadlHrs,
        respite: respiteHrs,
        companion: companionHrs,
    }), []);

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
        const hasAnyTask = entries.some(e => {
            if (pasEnabled && hasActivity(e, 'adl')) return true;
            if (hmEnabled && hasActivity(e, 'iadl')) return true;
            if (respiteEnabled && hasActivity(e, 'respite')) return true;
            if (companionEnabled && hasActivity(e, 'companion')) return true;
            return false;
        });
        if (!hasAnyTask) return 'Please select at least one service task before submitting your timesheet.';
        for (const e of entries) {
            const sections = [];
            if (pasEnabled) sections.push('adl');
            if (hmEnabled) sections.push('iadl');
            if (respiteEnabled) sections.push('respite');
            if (companionEnabled) sections.push('companion');
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
        if (authLimits.Companion && Math.round(totalCompanion * 4) > authLimits.Companion.units) {
            return `Companion hours (${totalCompanion.toFixed(2)} hrs) exceed authorized limit of ${authLimits.Companion.hours} hrs`;
        }
        return null;
    }, [data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled, companionEnabled, authLimits, totalPas, totalHm, totalRespite, totalCompanion]);

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
            if (companionEnabled) sections.push('companion');
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
    }, [submitAttempted, data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled, companionEnabled]);

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
                if (isMobile && validationError) {
                    const match = validationError.match(/Day (SUN|MON|TUE|WED|THU|FRI|SAT)/);
                    if (match) {
                        const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
                        setActiveDay(dayMap[match[1]]);
                        return;
                    }
                    if (validationError.includes('name') || validationError.includes('signature')) {
                        setActiveDay('all');
                    }
                }
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

    const mobileWeekLabel = selectedWeekStart
        ? (() => {
            const s = new Date(selectedWeekStart + 'T00:00:00');
            const e = new Date(s); e.setDate(s.getDate() + 6);
            const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${fmt(s)} – ${fmt(e)}`;
        })()
        : '';

    const totalAuth = (authLimits.PAS?.hours || 0) + (authLimits.Homemaker?.hours || 0) + (authLimits.Respite?.hours || 0);
    const totalAuthUnits = (authLimits.PAS?.units || 0) + (authLimits.Homemaker?.units || 0) + (authLimits.Respite?.units || 0);

    return (
        <div className={`pcaf-page ${isMobile ? 'pcaf-page--mobile' : ''}`}>
            {/* Title — desktop only */}
            {!isMobile && <h1 className="pcaf-title">PCA SERVICE DELIVERY RECORD</h1>}

            {/* Top bar */}
            <div className={`pcaf-topbar ${isMobile ? 'pcaf-topbar--mobile' : ''}`}>
                {isMobile && !submitted && hasUnsavedChanges && (
                    <div className="pcaf-unsaved-banner pcaf-unsaved-banner--mobile">
                        You have unsaved changes. Tap <strong>Save</strong> to keep your work.
                    </div>
                )}
                <div className="pcaf-topbar__week">
                    <div className="pcaf-topbar__week-row">
                        <button type="button" className="pcaf-week-arrow" onClick={() => navigateWeek(-1)}>&lsaquo;</button>
                        <span className="pcaf-topbar__cal-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </span>
                        {isMobile ? (
                            <>
                                <input type="date" className="pcaf-week-input" value={selectedWeekStart} onChange={(e) => handleWeekChange(e.target.value)} />
                                <span className="pcaf-topbar__week-range-inline">{mobileWeekLabel}</span>
                            </>
                        ) : (
                            <>
                                <span className="pcaf-topbar__week-label">Week of Sunday:</span>
                                <input type="date" className="pcaf-week-input" value={selectedWeekStart} onChange={(e) => handleWeekChange(e.target.value)} />
                            </>
                        )}
                        <button type="button" className="pcaf-week-arrow" onClick={() => navigateWeek(1)}>&rsaquo;</button>
                    </div>
                    {!isMobile && <div className="pcaf-topbar__week-range">{weekLabel}</div>}
                </div>
                {isMobile ? (
                    <div className="pcaf-topbar__mobile-info">
                        <span className="pcaf-detail__value">{data.client.clientName}</span>
                        <span className="pcaf-detail__label"> | </span>
                        <span className="pcaf-detail__value">{data.pcaName}</span>
                        <span className={`pcaf-status-badge pcaf-status-badge--${submitted ? 'submitted' : 'draft'}`}>
                            {submitted ? ' ✓' : ''}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="pcaf-topbar__details">
                            <div className="pcaf-topbar__detail-group">
                                <div className="pcaf-detail"><span className="pcaf-detail__label">Client:</span><span className="pcaf-detail__value">{data.client.clientName}</span></div>
                                <div className="pcaf-detail"><span className="pcaf-detail__label">Medicaid ID:</span><span className="pcaf-detail__value">{data.client.medicaidId || '—'}</span></div>
                            </div>
                            <div className="pcaf-topbar__detail-group">
                                <div className="pcaf-detail"><span className="pcaf-detail__label">PCA (Caregiver):</span><span className="pcaf-detail__value">{data.pcaName}</span></div>
                                <div className="pcaf-detail"><span className="pcaf-detail__label">Date Submitted:</span><span className="pcaf-detail__value">{data.timesheet.submittedAt ? new Date(data.timesheet.submittedAt).toLocaleDateString() : 'Not Submitted'}</span></div>
                            </div>
                        </div>
                        <div className="pcaf-topbar__status">
                            <span className="pcaf-detail__label">Status:</span>
                            <span className={`pcaf-status-badge pcaf-status-badge--${submitted ? 'submitted' : 'draft'}`}>
                                {submitted ? 'Submitted' : 'In Progress'}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {data?.timesheet?.correctionNote && (
                <div style={{ margin: '0 16px 12px', padding: '10px 14px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                    <strong>Correction Needed:</strong> {data.timesheet.correctionNote}
                </div>
            )}

            {/* Mobile: Day tabs + Auth bar + unsaved banner */}
            {isMobile && (
                <>
                    <MobileDayTabs
                        activeDay={activeDay}
                        onDayChange={setActiveDay}
                        entries={entries}
                        fieldErrors={fieldErrors}
                        enabledSections={enabledSectionKeys}
                    />
                    <MobileAuthBar
                        authLimits={authLimits}
                        totalPas={totalPas}
                        totalHm={totalHm}
                        totalRespite={totalRespite}
                        totalCompanion={totalCompanion}
                    />
                </>
            )}

            {/* Desktop: Authorized Hours Card */}
            {!isMobile && Object.keys(authLimits).length > 0 && (
                <div className="pcaf-auth-card">
                    <div className="pcaf-auth-card__left">
                        <span className="pcaf-auth-card__title">AUTHORIZED HOURS</span>
                        <span className="pcaf-auth-card__sub">(WEEKLY)</span>
                    </div>
                    <div className="pcaf-auth-card__badges">
                        {authLimits.PAS && (
                            <span className="pcaf-auth-pill pcaf-auth-pill--pas">
                                PAS: {authLimits.PAS.hours} hrs ({authLimits.PAS.units} units)
                            </span>
                        )}
                        {authLimits.Homemaker && (
                            <span className="pcaf-auth-pill pcaf-auth-pill--hm">
                                Homemaker: {authLimits.Homemaker.hours} hrs ({authLimits.Homemaker.units} units)
                            </span>
                        )}
                        {authLimits.Respite && (
                            <span className="pcaf-auth-pill pcaf-auth-pill--respite">
                                Respite: {authLimits.Respite.hours} hrs ({authLimits.Respite.units} units)
                            </span>
                        )}
                    </div>
                    <div className="pcaf-auth-card__right">
                        <span className="pcaf-auth-card__total-label">TOTAL AUTHORIZED</span>
                        <span className="pcaf-auth-card__total-value">{totalAuth} hrs ({totalAuthUnits} units)</span>
                    </div>
                </div>
            )}

            {/* Unsaved changes warning — desktop only */}
            {!isMobile && !submitted && hasUnsavedChanges && (
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
                        {isMobile ? (
                            /* ── Mobile: Day Card or Summary ── */
                            activeDay === 'all' ? (
                                <MobileSummaryTab
                                    entries={entries}
                                    enabledSectionKeys={enabledSectionKeys}
                                    dailyHoursFns={dailyHoursFns}
                                    fieldErrors={fieldErrors}
                                    onDayChange={setActiveDay}
                                    totalPas={totalPas}
                                    totalHm={totalHm}
                                    totalRespite={totalRespite}
                                    totalCompanion={totalCompanion}
                                    totalAll={totalAll}
                                    authLimits={authLimits}
                                    pasEnabled={pasEnabled}
                                    hmEnabled={hmEnabled}
                                    respiteEnabled={respiteEnabled}
                                    companionEnabled={companionEnabled}
                                    pcaFullName={pcaFullName}
                                    setPcaFullName={setPcaFullName}
                                    recipientName={recipientName}
                                    setRecipientName={setRecipientName}
                                    pcaSig={pcaSig}
                                    setPcaSig={setPcaSig}
                                    recipientSig={recipientSig}
                                    setRecipientSig={setRecipientSig}
                                    submitted={submitted}
                                    setHasUnsavedChanges={setHasUnsavedChanges}
                                    submitAttempted={submitAttempted}
                                />
                            ) : (
                                entries[activeDay] && (
                                    <MobileDayCard
                                        entry={entries[activeDay]}
                                        dayIndex={activeDay}
                                        updateEntry={updateEntry}
                                        disabled={submitted}
                                        enabledSections={enabledSectionsForCard}
                                        dailyHoursFns={dailyHoursFns}
                                        onAddShift={handleAddShift}
                                        onRemoveShift={handleRemoveShift}
                                        fieldErrors={fieldErrors}
                                    />
                                )
                            )
                        ) : (
                            /* ── Desktop: existing grid layout ── */
                            <>
                                {pasEnabled && (
                                    <ProgramSection
                                        title="PAS"
                                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
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

                                {hmEnabled && (
                                    <ProgramSection
                                        title="HOMEMAKER"
                                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
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

                                {respiteEnabled && (
                                    <ProgramSection
                                        title="RESPITE"
                                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
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

                                {companionEnabled && (
                                    <ProgramSection
                                        title="COMPANION"
                                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                                        colorClass="companion"
                                        activities={COMPANION_ACTIVITIES}
                                        section="companion"
                                        entries={entries}
                                        updateEntry={updateEntry}
                                        dailyHoursFn={companionHrs}
                                        disabled={submitted}
                                        sectionDisabled={false}
                                        onAddShift={handleAddShift}
                                        onRemoveShift={handleRemoveShift}
                                        fieldErrors={fieldErrors}
                                    />
                                )}

                                {/* Weekly Total Bar */}
                                <div className="pcaf-weekly-total">
                                    <div className="pcaf-weekly-total__icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                    </div>
                                    <div className="pcaf-weekly-total__title">
                                        <strong>WEEKLY TOTAL</strong>
                                        <span>(All Programs)</span>
                                    </div>
                                    <div className="pcaf-weekly-total__col">
                                        <span className="pcaf-weekly-total__col-label">TOTAL HOURS</span>
                                        <span className="pcaf-weekly-total__col-value">{totalAll.toFixed(2)} hrs</span>
                                    </div>
                                    <div className="pcaf-weekly-total__col">
                                        <span className="pcaf-weekly-total__col-label">TOTAL UNITS</span>
                                        <span className="pcaf-weekly-total__col-value">{Math.round(totalAll * 4)} units</span>
                                    </div>
                                    {pasEnabled && (
                                        <div className="pcaf-weekly-total__col">
                                            <span className="pcaf-weekly-total__col-label">PAS HOURS / UNITS</span>
                                            <span className="pcaf-weekly-total__col-value">{totalPas.toFixed(2)} hrs / {Math.round(totalPas * 4)} units</span>
                                            {authLimits.PAS && <span className="pcaf-weekly-total__col-auth">Authorized: {authLimits.PAS.hours} hrs / {authLimits.PAS.units} units</span>}
                                        </div>
                                    )}
                                    {hmEnabled && (
                                        <div className="pcaf-weekly-total__col">
                                            <span className="pcaf-weekly-total__col-label">HOMEMAKER HOURS / UNITS</span>
                                            <span className="pcaf-weekly-total__col-value">{totalHm.toFixed(2)} hrs / {Math.round(totalHm * 4)} units</span>
                                            {authLimits.Homemaker && <span className="pcaf-weekly-total__col-auth">Authorized: {authLimits.Homemaker.hours} hrs / {authLimits.Homemaker.units} units</span>}
                                        </div>
                                    )}
                                    {respiteEnabled && (
                                        <div className="pcaf-weekly-total__col">
                                            <span className="pcaf-weekly-total__col-label">RESPITE HOURS / UNITS</span>
                                            <span className="pcaf-weekly-total__col-value">{totalRespite.toFixed(2)} hrs / {Math.round(totalRespite * 4)} units</span>
                                            {authLimits.Respite && <span className="pcaf-weekly-total__col-auth">Authorized: {authLimits.Respite.hours} hrs / {authLimits.Respite.units} units</span>}
                                        </div>
                                    )}
                                    {companionEnabled && (
                                        <div className="pcaf-weekly-total__col">
                                            <span className="pcaf-weekly-total__col-label">COMPANION HOURS / UNITS</span>
                                            <span className="pcaf-weekly-total__col-value">{totalCompanion.toFixed(2)} hrs / {Math.round(totalCompanion * 4)} units</span>
                                            {authLimits.Companion && <span className="pcaf-weekly-total__col-auth">Authorized: {authLimits.Companion.hours} hrs / {authLimits.Companion.units} units</span>}
                                        </div>
                                    )}
                                </div>

                                {/* Tip */}
                                <div className="pcaf-tip">
                                    <svg className="pcaf-tip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                    <span>Tip: You can only log one program per day. Use the sections above to select the program and record your activities.</span>
                                </div>

                                {/* Signature Section */}
                                <div className="pcaf-signatures">
                                    <div className="pcaf-signatures__header">ACKNOWLEDGEMENT AND REQUIRED SIGNATURES</div>
                                    <div className="pcaf-signatures__body">
                                        <div className="pcaf-signatures__grid">
                                            <div className={`pcaf-signatures__field ${fieldErrors.pcaFullName ? 'pcaf-name-error' : ''}`}>
                                                <label>PCA (Caregiver) Name *</label>
                                                <input type="text" value={pcaFullName} onChange={(e) => { setPcaFullName(e.target.value); setHasUnsavedChanges(true); }} disabled={submitted} placeholder="Jane A. Doe" />
                                            </div>
                                            <div className={`pcaf-signatures__field ${fieldErrors.recipientName ? 'pcaf-name-error' : ''}`}>
                                                <label>Recipient (Client) Name *</label>
                                                <input type="text" value={recipientName} onChange={(e) => { setRecipientName(e.target.value); setHasUnsavedChanges(true); }} disabled={submitted} placeholder="John B. Client" />
                                            </div>
                                        </div>
                                        <div className="pcaf-signatures__sig-grid">
                                            <div className={`pcaf-signatures__pad ${fieldErrors.pcaSig ? 'pcaf-sig-error' : ''}`}>
                                                <SignaturePad label="PCA (Caregiver) Signature *" value={pcaSig} onChange={(v) => { setPcaSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                                            </div>
                                            <div className={`pcaf-signatures__pad ${fieldErrors.recipientSig ? 'pcaf-sig-error' : ''}`}>
                                                <SignaturePad label="Recipient (Client) Signature *" value={recipientSig} onChange={(v) => { setRecipientSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons — desktop */}
                                {!submitted && (
                                    <div className="pcaf-actions">
                                        <button className="pcaf-btn pcaf-btn--outline" onClick={handleSave} disabled={saving || submitting}>{saving ? 'Saving...' : 'Save Progress'}</button>
                                        <button className="pcaf-btn pcaf-btn--primary" onClick={handleSubmit} disabled={submitting || saving}>{submitting ? 'Submitting...' : 'Submit Timesheet'}</button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Mobile: Sticky Bottom Action Bar */}
            {isMobile && !submitted && (
                <div className="pcaf-mobile-actions">
                    <button className="pcaf-btn pcaf-btn--outline" onClick={handleSave} disabled={saving || submitting}>
                        {saving ? 'Saving...' : 'Save'}
                        {hasUnsavedChanges && <span className="pcaf-mobile-actions__unsaved-dot" />}
                    </button>
                    <button className="pcaf-btn pcaf-btn--primary" onClick={handleSubmit} disabled={submitting || saving}>
                        {submitting ? 'Submitting...' : 'Submit'}
                    </button>
                </div>
            )}

            {toast && <div className="pcaf-toast">{toast}</div>}
        </div>
    );
}
