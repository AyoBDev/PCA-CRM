import { useState, useEffect } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
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

function parseEnabledServices(client, authLimits) {
    let services = ['PAS', 'Homemaker'];
    if (client?.enabledServices) {
        try {
            const parsed = JSON.parse(client.enabledServices);
            if (Array.isArray(parsed)) services = parsed;
        } catch {}
    }
    // Auto-expand from active authorizations (single source of truth)
    if (authLimits) {
        for (const svc of Object.keys(authLimits)) {
            if (!services.includes(svc)) services.push(svc);
        }
    }
    return services;
}

function ProgramSection({ title, subtitle, icon, colorClass, activities, section, entries, updateEntry, disabled, dailyHoursFn, onAddShift, onRemoveShift, sectionDisabled }) {
    const SHIFT_COLORS = ['', 'tsv2-row--shift2', 'tsv2-row--shift3'];

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
        <div className={`tsv2-section ${sectionDisabled ? 'tsv2-section--disabled' : ''}`}>
            <div className="tsv2-section-header">
                <div className={`tsv2-section-icon tsv2-section-icon--${colorClass}`}><span className="tsv2-icon-svg">{icon}</span></div>
                <span className={`tsv2-section-name tsv2-section-name--${colorClass}`}>{title}</span>
                <span className="tsv2-section-subtitle">({subtitle})</span>
            </div>

            {activities.map((act) => (
                <div key={act} className="tsv2-row">
                    <div className="tsv2-row__label">{act}</div>
                    {entries.map((entry, idx) => {
                        const acts = JSON.parse(entry[`${section}Activities`] || '{}');
                        const checked = !!acts[act];
                        return (
                            <div key={idx} className="tsv2-row__cell">
                                <input type="checkbox" checked={checked} disabled={disabled}
                                    onChange={() => {
                                        const next = { ...acts, [act]: !checked };
                                        updateEntry(idx, `${section}Activities`, JSON.stringify(next));
                                    }} />
                            </div>
                        );
                    })}
                    <div className="tsv2-row__totals" />
                </div>
            ))}

            {/* PCA Initials */}
            <div className="tsv2-row tsv2-row--initials">
                <div className="tsv2-row__label"><strong>PCA Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="tsv2-row__cell">
                        <input type="text" className="tsv2-initials-input" value={e[`${section}PcaInitials`] || ''} disabled={disabled} maxLength={4}
                            onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} />
                    </div>
                ))}
                <div className="tsv2-row__totals" />
            </div>

            {/* Client Initials */}
            <div className="tsv2-row tsv2-row--initials">
                <div className="tsv2-row__label"><strong>Client Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="tsv2-row__cell">
                        <input type="text" className="tsv2-initials-input" value={e[`${section}ClientInitials`] || ''} disabled={disabled} maxLength={4}
                            onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} />
                    </div>
                ))}
                <div className="tsv2-row__totals" />
            </div>

            {/* Shift 1 In */}
            <div className="tsv2-row tsv2-row--time">
                <div className="tsv2-row__label">Shift 1 — In</div>
                {entries.map((e, i) => (
                    <div key={i} className="tsv2-row__cell">
                        <input type="time" className="tsv2-time-input" value={e[`${section}TimeIn`] || ''} disabled={disabled}
                            onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} />
                    </div>
                ))}
                <div className="tsv2-row__totals">
                    <div className="tsv2-section-totals__label">Hours</div>
                    <div className={`tsv2-section-totals__hours tsv2-section-totals__hours--${colorClass}`}>{totalHours.toFixed(2)}</div>
                </div>
            </div>

            {/* Shift 1 Out */}
            <div className="tsv2-row tsv2-row--time">
                <div className="tsv2-row__label">Shift 1 — Out</div>
                {entries.map((e, i) => (
                    <div key={i} className="tsv2-row__cell">
                        <input type="time" className="tsv2-time-input" value={e[`${section}TimeOut`] || ''} disabled={disabled}
                            onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} />
                    </div>
                ))}
                <div className="tsv2-row__totals">
                    <div className="tsv2-section-totals__label">Units</div>
                    <div className="tsv2-section-totals__units">{totalUnits}</div>
                </div>
            </div>

            {/* Extra shifts */}
            {Array.from({ length: maxBlocks }).map((_, b) => {
                const colorCls = SHIFT_COLORS[b] || SHIFT_COLORS[SHIFT_COLORS.length - 1];
                return (
                    <div key={b}>
                        <div className={`tsv2-row tsv2-row--time ${colorCls}`}>
                            <div className="tsv2-row__label">
                                Shift {b + 2} — In
                                {!disabled && b === maxBlocks - 1 && (
                                    <button type="button" className="tsv2-remove-shift-btn" onClick={() => onRemoveShift(section, b)}>×</button>
                                )}
                            </div>
                            {entries.map((e, i) => {
                                const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
                                return (
                                    <div key={i} className="tsv2-row__cell">
                                        <input type="time" className="tsv2-time-input" value={blocks[b]?.in || ''} disabled={disabled}
                                            onChange={(ev) => {
                                                const updated = [...blocks];
                                                if (!updated[b]) updated[b] = { in: '', out: '' };
                                                updated[b] = { ...updated[b], in: ev.target.value };
                                                updateEntry(i, `${section}TimeBlocks`, JSON.stringify(updated));
                                            }} />
                                    </div>
                                );
                            })}
                            <div className="tsv2-row__totals" />
                        </div>
                        <div className={`tsv2-row tsv2-row--time ${colorCls}`}>
                            <div className="tsv2-row__label">Shift {b + 2} — Out</div>
                            {entries.map((e, i) => {
                                const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
                                return (
                                    <div key={i} className="tsv2-row__cell">
                                        <input type="time" className="tsv2-time-input" value={blocks[b]?.out || ''} disabled={disabled}
                                            onChange={(ev) => {
                                                const updated = [...blocks];
                                                if (!updated[b]) updated[b] = { in: '', out: '' };
                                                updated[b] = { ...updated[b], out: ev.target.value };
                                                updateEntry(i, `${section}TimeBlocks`, JSON.stringify(updated));
                                            }} />
                                    </div>
                                );
                            })}
                            <div className="tsv2-row__totals" />
                        </div>
                    </div>
                );
            })}

            {/* Add Shift row */}
            {!disabled && (
                <div className="tsv2-row tsv2-row--add-shift">
                    <div className="tsv2-row__label" />
                    {entries.map((_, i) => (
                        <div key={i} className="tsv2-row__cell">
                            <button type="button" className="tsv2-add-shift-btn" onClick={() => onAddShift(section)}>+ Add Shift</button>
                        </div>
                    ))}
                    <div className="tsv2-row__totals" />
                </div>
            )}
        </div>
    );
}

export default function TimesheetFormPage({ timesheetId, clients, onBack, showToast: showToastProp }) {
    const { showToast: toastHook } = useToast();
    const showToast = showToastProp || toastHook;
    const { isAdmin, authUser } = useAuth();
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [recipientSig, setRecipientSig] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [supervisorSig, setSupervisorSig] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [pcaFullName, setPcaFullName] = useState('');
    const [completionDate, setCompletionDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [shareLinkModal, setShareLinkModal] = useState(null);
    const [enabledServices, setEnabledServices] = useState(['PAS', 'Homemaker']);
    const [notes, setNotes] = useState('');
    const [showCorrectionModal, setShowCorrectionModal] = useState(false);
    const [correctionNote, setCorrectionNote] = useState('');

    const submitted = ts?.status === 'submitted';
    const accepted = ts?.status === 'accepted';
    const readOnly = accepted || (submitted && !isAdmin);

    const pasEnabled = enabledServices.includes('PAS');
    const hmEnabled = enabledServices.includes('Homemaker');
    const respiteEnabled = enabledServices.includes('Respite');
    const companionEnabled = enabledServices.includes('Companion');

    const toggleService = async (svc) => {
        if ((!isAdmin && authUser?.role !== 'user') || !ts?.client?.id) return;
        const next = enabledServices.includes(svc)
            ? enabledServices.filter((s) => s !== svc)
            : [...enabledServices, svc];
        setEnabledServices(next);
        try {
            await api.patchClient(ts.client.id, { enabledServices: JSON.stringify(next) });
            showToast(`${svc} ${next.includes(svc) ? 'enabled' : 'disabled'}`);
        } catch (err) {
            showToast(err.message, 'error');
            setEnabledServices(enabledServices);
        }
    };

    useEffect(() => {
        if (timesheetId) {
            api.getTimesheet(timesheetId).then((data) => {
                setTs(data);
                setEntries(data.entries);
                setRecipientSig(data.recipientSignature || '');
                setPcaSig(data.pcaSignature || '');
                setSupervisorSig(data.supervisorSignature || '');
                setRecipientName(data.recipientName || '');
                setPcaFullName(data.pcaFullName || '');
                setCompletionDate(data.completionDate || '');
                setEnabledServices(parseEnabledServices(data.client, data.authLimits));
            }).catch((err) => showToast(err.message, 'error'));
        }
    }, [timesheetId, showToast]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    };

    const handleAddShift = (section) => {
        setEntries(prev => prev.map(e => {
            const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
            blocks.push({ in: '', out: '' });
            return { ...e, [`${section}TimeBlocks`]: JSON.stringify(blocks) };
        }));
    };

    const handleRemoveShift = (section, blockIdx) => {
        setEntries(prev => prev.map(e => {
            const blocks = (() => { try { return JSON.parse(e[`${section}TimeBlocks`] || '[]'); } catch { return []; } })();
            blocks.splice(blockIdx, 1);
            return { ...e, [`${section}TimeBlocks`]: JSON.stringify(blocks) };
        }));
    };

    const adlDailyHours = (e) => totalHoursWithBlocks(e, 'adl');
    const iadlDailyHours = (e) => totalHoursWithBlocks(e, 'iadl');
    const respiteDailyHours = (e) => totalHoursWithBlocks(e, 'respite');
    const companionDailyHours = (e) => totalHoursWithBlocks(e, 'companion');
    const totalPas = entries.reduce((s, e) => s + adlDailyHours(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlDailyHours(e), 0);
    const totalRespite = entries.reduce((s, e) => s + respiteDailyHours(e), 0);
    const totalCompanion = entries.reduce((s, e) => s + companionDailyHours(e), 0);
    const totalAll = totalPas + totalHm + totalRespite + totalCompanion;

    const authLimits = ts?.authLimits || {};
    const authPasHours = authLimits.PAS ? (authLimits.PAS / 4).toFixed(2) : '—';
    const authHmHours = authLimits.Homemaker ? (authLimits.Homemaker / 4).toFixed(2) : '—';
    const authRespiteHours = authLimits.Respite ? (authLimits.Respite / 4).toFixed(2) : '—';
    const authCompanionHours = authLimits.Companion ? (authLimits.Companion / 4).toFixed(2) : '—';
    const authTotalHours = (authLimits.PAS || authLimits.Homemaker || authLimits.Respite || authLimits.Companion)
        ? (((authLimits.PAS || 0) + (authLimits.Homemaker || 0) + (authLimits.Respite || 0) + (authLimits.Companion || 0)) / 4).toFixed(2)
        : '—';
    const remainPas = authLimits.PAS ? ((authLimits.PAS / 4) - totalPas).toFixed(2) : '—';
    const remainHm = authLimits.Homemaker ? ((authLimits.Homemaker / 4) - totalHm).toFixed(2) : '—';
    const remainRespite = authLimits.Respite ? ((authLimits.Respite / 4) - totalRespite).toFixed(2) : '—';
    const remainCompanion = authLimits.Companion ? ((authLimits.Companion / 4) - totalCompanion).toFixed(2) : '—';
    const remainTotal = (authLimits.PAS || authLimits.Homemaker || authLimits.Respite || authLimits.Companion)
        ? (((authLimits.PAS || 0) + (authLimits.Homemaker || 0) + (authLimits.Respite || 0) + (authLimits.Companion || 0)) / 4 - totalAll).toFixed(2)
        : '—';

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = {
                entries: entries.map((e) => ({
                    id: e.id, dateOfService: e.dateOfService,
                    adlActivities: e.adlActivities || '{}', adlTimeIn: e.adlTimeIn || null, adlTimeOut: e.adlTimeOut || null,
                    adlTimeBlocks: e.adlTimeBlocks || '[]',
                    adlPcaInitials: e.adlPcaInitials || '', adlClientInitials: e.adlClientInitials || '',
                    iadlActivities: e.iadlActivities || '{}', iadlTimeIn: e.iadlTimeIn || null, iadlTimeOut: e.iadlTimeOut || null,
                    iadlTimeBlocks: e.iadlTimeBlocks || '[]',
                    iadlPcaInitials: e.iadlPcaInitials || '', iadlClientInitials: e.iadlClientInitials || '',
                    respiteActivities: e.respiteActivities || '{}', respiteTimeIn: e.respiteTimeIn || null, respiteTimeOut: e.respiteTimeOut || null,
                    respiteTimeBlocks: e.respiteTimeBlocks || '[]',
                    respitePcaInitials: e.respitePcaInitials || '', respiteClientInitials: e.respiteClientInitials || '',
                    companionActivities: e.companionActivities || '{}', companionTimeIn: e.companionTimeIn || null, companionTimeOut: e.companionTimeOut || null,
                    companionTimeBlocks: e.companionTimeBlocks || '[]',
                    companionPcaInitials: e.companionPcaInitials || '', companionClientInitials: e.companionClientInitials || '',
                })),
                recipientName, pcaFullName, recipientSignature: recipientSig, pcaSignature: pcaSig, supervisorSignature: supervisorSig, completionDate,
            };
            const result = await api.updateTimesheet(ts.id, data);
            setTs(result); setEntries(result.entries);
            showToast('Timesheet saved');
        } catch (err) { showToast(err.message, 'error'); }
        setSaving(false);
    };

    const handleSubmit = async () => {
        await handleSave();
        try { const result = await api.submitTimesheet(ts.id); setTs(result); showToast('Timesheet submitted!'); } catch (err) { showToast(err.message, 'error'); }
    };

    const handleAcceptTimesheet = async () => {
        try {
            const data = await api.updateTimesheetStatus(ts.id, 'accepted');
            setTs(data);
            showToast('Timesheet accepted');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRejectTimesheet = async () => {
        try {
            const data = await api.updateTimesheetStatus(ts.id, 'rejected');
            setTs(data);
            showToast('Timesheet sent back for corrections');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleSendBackForCorrection = async () => {
        if (!correctionNote.trim()) return;
        try {
            const data = await api.updateTimesheetStatus(ts.id, 'rejected', correctionNote.trim());
            setTs(data);
            setShowCorrectionModal(false);
            setCorrectionNote('');
            showToast('Sent back for corrections', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRevertToDraft = async () => {
        try {
            const data = await api.updateTimesheetStatus(ts.id, 'draft');
            setTs(data);
            showToast('Reverted to draft');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleShareLinks = async () => {
        try {
            const links = await api.generateSigningLinks(ts.id);
            setShareLinkModal(links);
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (!ts) return <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    const weekStart = ts.weekStart.split('T')[0];
    const weekLabel = formatWeek(weekStart);
    const weekDates = entries.map(e => {
        if (!e.dateOfService) return '';
        return new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const weekRange = entries.length >= 7
        ? `${new Date(entries[0].dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(entries[6].dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : weekLabel;

    return (
        <>
            <div className="tsv2-page">
                {/* Header */}
                <div className="tsv2-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="btn btn--ghost btn--icon" onClick={onBack} title="Back">&larr;</button>
                        <h1>Timesheet Details</h1>
                    </div>
                    <div className="tsv2-header-actions">
                        <button className="btn btn--outline btn--sm" onClick={onBack}><span className="tsv2-btn-icon">{Icons.chevronLeft}</span> Back to Board</button>
                        <button className="btn btn--outline btn--sm" onClick={async () => {
                            try {
                                const blob = await api.exportTimesheetPdf(ts.id);
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                            } catch (err) { showToast(err.message, 'error'); }
                        }}><span className="tsv2-btn-icon">{Icons.fileText}</span> Print / PDF</button>
                    </div>
                </div>

                {/* Info Cards */}
                <div className="tsv2-info-cards">
                    <div className="tsv2-info-card">
                        <div className="tsv2-info-card__icon"><span className="tsv2-icon-svg">{Icons.user}</span></div>
                        <div>
                            <div className="tsv2-info-card__label">Client / Recipient</div>
                            <div className="tsv2-info-card__value">{ts.client?.clientName}</div>
                        </div>
                    </div>
                    <div className="tsv2-info-card">
                        <div className="tsv2-info-card__icon"><span className="tsv2-icon-svg">{Icons.user}</span></div>
                        <div>
                            <div className="tsv2-info-card__label">Caregiver / PCA</div>
                            <div className="tsv2-info-card__value">{ts.pcaName}</div>
                        </div>
                    </div>
                    <div className="tsv2-info-card">
                        <div className="tsv2-info-card__icon"><span className="tsv2-icon-svg">{Icons.calendar}</span></div>
                        <div>
                            <div className="tsv2-info-card__label">Week</div>
                            <div className="tsv2-info-card__value">{weekRange}</div>
                            <div className="tsv2-info-card__sub">(Sun – Sat)</div>
                        </div>
                    </div>
                    <div className="tsv2-info-card">
                        <div className="tsv2-info-card__icon"><span className="tsv2-icon-svg">{Icons.calendar}</span></div>
                        <div>
                            <div className="tsv2-info-card__label">Date Submitted</div>
                            <div className="tsv2-info-card__value">{ts.submittedAt ? new Date(ts.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                            <div className="tsv2-info-card__sub">{ts.submittedAt ? new Date(ts.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</div>
                        </div>
                    </div>
                    <div className="tsv2-info-card">
                        <div>
                            <div className="tsv2-info-card__label">Status</div>
                            <div className="tsv2-info-card__value"><span className={`tsv2-status-badge tsv2-status-badge--${ts.status}`}><span className="tsv2-icon-svg">{Icons.checkCircle}</span> {ts.status.charAt(0).toUpperCase() + ts.status.slice(1)}</span></div>
                        </div>
                    </div>
                </div>

                {/* Program Cards (admin toggle) */}
                {(isAdmin || authUser?.role === 'user') && (
                    <div className="tsv2-programs">
                        <div className="tsv2-programs__title">Service Types (Programs)</div>
                        <div className="tsv2-programs__subtitle">Select the programs provided for this client.</div>
                        <div className="tsv2-programs__grid">
                            <div className={`tsv2-program-card ${pasEnabled ? 'tsv2-program-card--active-green' : ''}`} onClick={() => toggleService('PAS')}>
                                <div className="tsv2-program-card__checkbox">{pasEnabled && '✓'}</div>
                                <div>
                                    <div className="tsv2-program-card__name tsv2-program-card__name--blue">PAS</div>
                                    <div className="tsv2-program-card__desc">Personal Assistance Services</div>
                                    <div className="tsv2-program-card__activities">{ADL_ACTIVITIES.join(', ')}</div>
                                </div>
                            </div>
                            <div className={`tsv2-program-card ${hmEnabled ? 'tsv2-program-card--active-amber' : ''}`} onClick={() => toggleService('Homemaker')}>
                                <div className="tsv2-program-card__checkbox">{hmEnabled && '✓'}</div>
                                <div>
                                    <div className="tsv2-program-card__name tsv2-program-card__name--green">Homemaker</div>
                                    <div className="tsv2-program-card__desc">IADL Services</div>
                                    <div className="tsv2-program-card__activities">{IADL_ACTIVITIES.join(', ')}</div>
                                </div>
                            </div>
                            <div className={`tsv2-program-card ${respiteEnabled ? 'tsv2-program-card--active-cyan' : ''}`} onClick={() => toggleService('Respite')}>
                                <div className="tsv2-program-card__checkbox">{respiteEnabled && '✓'}</div>
                                <div>
                                    <div className="tsv2-program-card__name tsv2-program-card__name--orange">Respite</div>
                                    <div className="tsv2-program-card__desc">Respite Services</div>
                                    <div className="tsv2-program-card__activities">{RESPITE_ACTIVITIES.join(', ')}</div>
                                </div>
                            </div>
                            <div className={`tsv2-program-card ${companionEnabled ? 'tsv2-program-card--active-pink' : ''}`} onClick={() => toggleService('Companion')}>
                                <div className="tsv2-program-card__checkbox">{companionEnabled && '✓'}</div>
                                <div>
                                    <div className="tsv2-program-card__name tsv2-program-card__name--pink">Companion</div>
                                    <div className="tsv2-program-card__desc">Companion Services</div>
                                    <div className="tsv2-program-card__activities">{COMPANION_ACTIVITIES.join(', ')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Grid Header */}
                <div className="tsv2-grid-header">
                    <div className="tsv2-grid-header__label">SERVICE / TASKS</div>
                    {entries.map((e, i) => (
                        <div key={i} className="tsv2-grid-header__day">
                            <div className="tsv2-grid-header__day-name">{DAY_SHORT[e.dayOfWeek]}</div>
                            <div className="tsv2-grid-header__day-date">{weekDates[i]}</div>
                        </div>
                    ))}
                    <div className="tsv2-grid-header__totals">TOTALS</div>
                </div>

                {/* PAS Section */}
                <ProgramSection
                    title="PAS"
                    subtitle="Personal Assistance Services"
                    icon={Icons.heart}
                    colorClass="blue"
                    activities={ADL_ACTIVITIES}
                    section="adl"
                    entries={entries}
                    updateEntry={updateEntry}
                    disabled={readOnly || !pasEnabled}
                    sectionDisabled={!pasEnabled}
                    dailyHoursFn={adlDailyHours}
                    onAddShift={handleAddShift}
                    onRemoveShift={handleRemoveShift}
                />

                {/* Homemaker Section */}
                <ProgramSection
                    title="Homemaker"
                    subtitle="IADL Services"
                    icon={Icons.building}
                    colorClass="green"
                    activities={IADL_ACTIVITIES}
                    section="iadl"
                    entries={entries}
                    updateEntry={updateEntry}
                    disabled={readOnly || !hmEnabled}
                    sectionDisabled={!hmEnabled}
                    dailyHoursFn={iadlDailyHours}
                    onAddShift={handleAddShift}
                    onRemoveShift={handleRemoveShift}
                />

                {/* Respite Section */}
                <ProgramSection
                    title="Respite"
                    subtitle="Respite Services"
                    icon={Icons.clock}
                    colorClass="orange"
                    activities={RESPITE_ACTIVITIES}
                    section="respite"
                    entries={entries}
                    updateEntry={updateEntry}
                    disabled={readOnly || !respiteEnabled}
                    sectionDisabled={!respiteEnabled}
                    dailyHoursFn={respiteDailyHours}
                    onAddShift={handleAddShift}
                    onRemoveShift={handleRemoveShift}
                />

                {/* Companion Section */}
                <ProgramSection
                    title="Companion"
                    subtitle="Companion Services"
                    icon={Icons.users}
                    colorClass="pink"
                    activities={COMPANION_ACTIVITIES}
                    section="companion"
                    entries={entries}
                    updateEntry={updateEntry}
                    disabled={readOnly || !companionEnabled}
                    sectionDisabled={!companionEnabled}
                    dailyHoursFn={companionDailyHours}
                    onAddShift={handleAddShift}
                    onRemoveShift={handleRemoveShift}
                />

                {/* Daily Totals Bar */}
                <div className="tsv2-daily-totals">
                    <div className="tsv2-daily-totals__label">DAILY TOTAL (All Programs)</div>
                    {entries.map((e, i) => {
                        const dayTotal = adlDailyHours(e) + iadlDailyHours(e) + respiteDailyHours(e) + companionDailyHours(e);
                        const dayUnits = Math.round(dayTotal * 4);
                        return (
                            <div key={i} className="tsv2-daily-totals__cell">
                                <div className="tsv2-daily-totals__hours">{dayTotal > 0 ? dayTotal.toFixed(2) : '—'}</div>
                                <div className="tsv2-daily-totals__units">{dayTotal > 0 ? `${dayUnits} Units` : ''}</div>
                            </div>
                        );
                    })}
                    <div className="tsv2-daily-totals__grand">
                        <div className="tsv2-daily-totals__hours">{totalAll.toFixed(2)}</div>
                        <div className="tsv2-daily-totals__units">{Math.round(totalAll * 4)} Units</div>
                    </div>
                </div>

                {/* Weekly Totals + Notes */}
                <div className="tsv2-weekly">
                    <div>
                        <div className="tsv2-weekly__title">Weekly Totals By Program</div>
                        <table className="tsv2-weekly-table">
                            <thead>
                                <tr>
                                    <th>Program (Service Type)</th>
                                    <th>Total Hours</th>
                                    <th>Total Units</th>
                                    <th>Authorized Hours (Weekly)</th>
                                    <th>Remaining Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pasEnabled && (
                                    <tr>
                                        <td><span className="tsv2-program-dot tsv2-program-dot--green" />PAS (Personal Assistance Services)</td>
                                        <td>{totalPas.toFixed(2)}</td>
                                        <td>{Math.round(totalPas * 4)}</td>
                                        <td>{authPasHours}</td>
                                        <td className={remainPas !== '—' && parseFloat(remainPas) >= 0 ? 'tsv2-remaining--ok' : 'tsv2-remaining--over'}>{remainPas}</td>
                                    </tr>
                                )}
                                {hmEnabled && (
                                    <tr>
                                        <td><span className="tsv2-program-dot tsv2-program-dot--amber" />Homemaker (IADL Services)</td>
                                        <td>{totalHm.toFixed(2)}</td>
                                        <td>{Math.round(totalHm * 4)}</td>
                                        <td>{authHmHours}</td>
                                        <td className={remainHm !== '—' && parseFloat(remainHm) >= 0 ? 'tsv2-remaining--ok' : 'tsv2-remaining--over'}>{remainHm}</td>
                                    </tr>
                                )}
                                {respiteEnabled && (
                                    <tr>
                                        <td><span className="tsv2-program-dot tsv2-program-dot--cyan" />Respite (Respite Services)</td>
                                        <td>{totalRespite.toFixed(2)}</td>
                                        <td>{Math.round(totalRespite * 4)}</td>
                                        <td>{authRespiteHours}</td>
                                        <td className={remainRespite !== '—' && parseFloat(remainRespite) >= 0 ? 'tsv2-remaining--ok' : 'tsv2-remaining--over'}>{remainRespite}</td>
                                    </tr>
                                )}
                                {companionEnabled && (
                                    <tr>
                                        <td><span className="tsv2-program-dot tsv2-program-dot--pink" />Companion (Companion Services)</td>
                                        <td>{totalCompanion.toFixed(2)}</td>
                                        <td>{Math.round(totalCompanion * 4)}</td>
                                        <td>{authCompanionHours}</td>
                                        <td className={remainCompanion !== '—' && parseFloat(remainCompanion) >= 0 ? 'tsv2-remaining--ok' : 'tsv2-remaining--over'}>{remainCompanion}</td>
                                    </tr>
                                )}
                                <tr>
                                    <td><strong>TOTAL</strong></td>
                                    <td><strong>{totalAll.toFixed(2)}</strong></td>
                                    <td><strong>{Math.round(totalAll * 4)}</strong></td>
                                    <td><strong>{authTotalHours}</strong></td>
                                    <td className={remainTotal !== '—' && parseFloat(remainTotal) >= 0 ? 'tsv2-remaining--ok' : 'tsv2-remaining--over'}><strong>{remainTotal}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <div className="tsv2-weekly__title">Notes</div>
                        <textarea className="tsv2-notes-textarea" placeholder="Add any notes here..." value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
                    </div>
                </div>

                {/* Signatures */}
                <div className="tsv2-signatures">
                    <div>
                        <div className="tsv2-sig-section__title">Recipient / Client</div>
                        <div className="tsv2-sig-field">
                            <label>Name:</label>
                            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={readOnly} placeholder="Full name" />
                        </div>
                        <SignaturePad label="Signature:" value={recipientSig} onChange={setRecipientSig} disabled={readOnly} />
                        <div className="tsv2-sig-field">
                            <label>Date:</label>
                            <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={readOnly} />
                        </div>
                    </div>
                    <div>
                        <div className="tsv2-sig-section__title">Employee / PCA</div>
                        <div className="tsv2-sig-field">
                            <label>Name:</label>
                            <input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} disabled={readOnly} placeholder="Full name" />
                        </div>
                        <SignaturePad label="Signature:" value={pcaSig} onChange={setPcaSig} disabled={readOnly} />
                        <div className="tsv2-sig-field">
                            <label>Date:</label>
                            <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={readOnly} />
                        </div>
                    </div>
                    <div>
                        <div className="tsv2-sig-section__title">Supervisor</div>
                        <div className="tsv2-sig-field">
                            <label>Name:</label>
                            <input type="text" value={ts?.supervisorName || ''} disabled={readOnly} placeholder="Supervisor name" />
                        </div>
                        <SignaturePad label="Signature:" value={supervisorSig} onChange={setSupervisorSig} disabled={readOnly} />
                        <div className="tsv2-sig-field">
                            <label>Date:</label>
                            <input type="date" value={ts?.supervisorDate || completionDate} disabled={readOnly} />
                        </div>
                    </div>
                    <div>
                        <div className="tsv2-sig-section__title">Office Use Only</div>
                        {isAdmin && (
                            <>
                                <div className="tsv2-office-actions">
                                    <button className="btn--accept" onClick={handleAcceptTimesheet} disabled={!submitted}><span className="tsv2-btn-icon">{Icons.checkCircle}</span> Accept</button>
                                    <button className="btn--reject" onClick={handleRejectTimesheet} disabled={!submitted}><span className="tsv2-btn-icon">{Icons.alertCircle}</span> Reject</button>
                                    <button className="btn--sendback" onClick={() => setShowCorrectionModal(true)} disabled={!submitted && !accepted}><span className="tsv2-btn-icon">{Icons.rotateCcw}</span> Send Back for Corrections</button>
                                </div>
                                {ts?.correctionNote && (
                                    <div className="tsv2-office-comment" style={{ marginTop: 8, padding: '8px 12px', background: 'hsl(var(--warning) / 0.1)', borderRadius: 6, fontSize: 13 }}>
                                        <strong>Correction Note:</strong> {ts.correctionNote}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="tsv2-footer">
                    <div className="tsv2-footer__left">
                        <span className="tsv2-footer__stat"><span className="tsv2-icon-svg">{Icons.clock}</span> Total Time: {totalAll.toFixed(2)} Hours</span>
                        <span className="tsv2-footer__stat"><span className="tsv2-icon-svg">{Icons.trendingUp}</span> Total Units: {Math.round(totalAll * 4)}</span>
                    </div>
                    <div className="tsv2-footer__right">Week starts on Sunday and ends on Saturday</div>
                </div>

                {/* Action buttons for draft */}
                {!submitted && !accepted && (
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: '16px 0' }}>
                        <button className="btn btn--outline btn--sm" onClick={handleShareLinks}>{Icons.share} Share</button>
                        <button className="btn btn--outline btn--sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
                        <button className="btn btn--primary btn--sm" onClick={handleSubmit}>Submit</button>
                    </div>
                )}
                {submitted && isAdmin && (
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: '16px 0' }}>
                        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                )}
            </div>

            {shareLinkModal && (
                <Modal onClose={() => setShareLinkModal(null)}>
                    <h2 className="modal__title"><span style={{ display: 'inline-block', width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }}>{Icons.share}</span>Signing Link</h2>
                    <p className="modal__desc">Send this permanent link to the PCA. They can use it each week to log hours, activities, and collect signatures.</p>
                    <div className="share-link-group">
                        <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>Signing Link (send to PCA)</label>
                        <div className="share-link-row">
                            <input type="text" readOnly value={shareLinkModal.link} className="share-link-input" />
                            <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.link); showToast('Link copied!'); }}>{Icons.copy} Copy</button>
                        </div>
                    </div>
                </Modal>
            )}

            {showCorrectionModal && (
                <Modal onClose={() => { setShowCorrectionModal(false); setCorrectionNote(''); }}>
                    <h2 className="modal__title">Send Back for Corrections</h2>
                    <p className="modal__desc">Describe what needs to be corrected. The timesheet will be returned to draft status.</p>
                    <div className="form-group">
                        <label>Correction Notes</label>
                        <textarea rows={4} value={correctionNote} onChange={e => setCorrectionNote(e.target.value)} placeholder="Describe what needs to be fixed..." />
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => { setShowCorrectionModal(false); setCorrectionNote(''); }}>Cancel</button>
                        <button className="btn btn--primary" onClick={handleSendBackForCorrection} disabled={!correctionNote.trim()}>Send</button>
                    </div>
                </Modal>
            )}
        </>
    );
}
