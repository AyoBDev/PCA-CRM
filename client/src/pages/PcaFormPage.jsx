import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];

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

function hasActivity(entry, section) {
    try {
        const acts = JSON.parse(entry[`${section}Activities`] || '{}');
        return Object.values(acts).some(Boolean);
    } catch {
        return false;
    }
}

function SectionBlock({ header, activities, section, entries, updateEntry, dailyHoursFn, disabled, sectionDisabled }) {
    return (
        <div className={`sdr-section ${sectionDisabled ? 'sdr-section--disabled' : ''}`}>
            <div className="sdr-section-title">{header}</div>
            <div className="sdr-day-header-row">
                <div className="sdr-activity-label" />
                {entries.map((e, i) => (
                    <div key={i} className="sdr-day-header">
                        <div className="sdr-day-name">{DAY_SHORT[e.dayOfWeek]}</div>
                        <div className="sdr-day-date">{e.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}</div>
                    </div>
                ))}
            </div>
            {activities.map((act) => (
                <div key={act} className="sdr-activity-row">
                    <div className="sdr-activity-label">{act}</div>
                    {entries.map((entry, idx) => {
                        const acts = JSON.parse(entry[`${section}Activities`] || '{}');
                        const checked = !!acts[act];
                        return (
                            <div key={idx} className="sdr-activity-cell">
                                <input type="checkbox" checked={checked} disabled={disabled}
                                    onChange={() => {
                                        const next = { ...acts, [act]: !checked };
                                        updateEntry(idx, `${section}Activities`, JSON.stringify(next));
                                    }} />
                            </div>
                        );
                    })}
                </div>
            ))}
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>PCA Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}PcaInitials`] || ''} disabled={disabled} maxLength={4}
                            onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>Client Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}ClientInitials`] || ''} disabled={disabled} maxLength={4}
                            onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time In</div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="time" className="sdr-time-input" value={e[`${section}TimeIn`] || ''} disabled={disabled}
                            onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time Out</div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="time" className="sdr-time-input" value={e[`${section}TimeOut`] || ''} disabled={disabled}
                            onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-total-row">
                <div className="sdr-activity-label"><strong>Daily Totals</strong></div>
                {entries.map((e, i) => {
                    const hrs = dailyHoursFn(e);
                    return <div key={i} className="sdr-activity-cell sdr-hours-cell">{hrs > 0 ? hrs.toFixed(2) : '—'}</div>;
                })}
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
    const [iadlTab, setIadlTab] = useState('iadl');
    const [toast, setToast] = useState('');

    const showToast = useCallback((msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }, []);

    const loadForm = useCallback(() => {
        setLoading(true);
        api.getPcaForm(token)
            .then((resp) => {
                setData(resp);
                setEntries(resp.timesheet.entries || []);
                setPcaFullName(resp.timesheet.pcaFullName || resp.pcaName || '');
                setPcaSig(resp.timesheet.pcaSignature || '');
                setRecipientName(resp.timesheet.recipientName || '');
                setRecipientSig(resp.timesheet.recipientSignature || '');
                const enabled = resp.client?.enabledServices || [];
                if (!enabled.includes('Homemaker') && enabled.includes('Respite')) setIadlTab('respite');
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { loadForm(); }, [loadForm]);

    const enabledServices = data?.client?.enabledServices || [];
    const pasEnabled = enabledServices.includes('PAS');
    const hmEnabled = enabledServices.includes('Homemaker');
    const respiteEnabled = enabledServices.includes('Respite');
    const iadlAnyEnabled = hmEnabled || respiteEnabled;
    const submitted = data?.timesheet?.status === 'submitted';

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
    };

    const adlHrs = (e) => computeHours(e.adlTimeIn, e.adlTimeOut);
    const iadlHrs = (e) => computeHours(e.iadlTimeIn, e.iadlTimeOut);
    const respiteHrs = (e) => computeHours(e.respiteTimeIn, e.respiteTimeOut);
    const totalPas = entries.reduce((s, e) => s + adlHrs(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlHrs(e), 0);
    const totalRespite = entries.reduce((s, e) => s + respiteHrs(e), 0);
    const totalAll = totalPas + totalHm + totalRespite;

    // Validation for submit gating
    const validationError = useMemo(() => {
        if (!data) return 'Loading…';
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
            // Homemaker / Respite overlap
            if (hmEnabled && respiteEnabled && e.iadlTimeIn && e.iadlTimeOut && e.respiteTimeIn && e.respiteTimeOut) {
                const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                const aS = toMin(e.iadlTimeIn), aE = toMin(e.iadlTimeOut);
                const bS = toMin(e.respiteTimeIn), bE = toMin(e.respiteTimeOut);
                if (aS < bE && bS < aE) return `Day ${DAY_SHORT[e.dayOfWeek]}: Homemaker and Respite times overlap`;
            }
        }
        return null;
    }, [data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled]);

    const buildPayload = (action) => ({
        action,
        entries: entries.map((e) => ({
            id: e.id, dayOfWeek: e.dayOfWeek, dateOfService: e.dateOfService,
            adlActivities: e.adlActivities || '{}', adlTimeIn: e.adlTimeIn || null, adlTimeOut: e.adlTimeOut || null,
            adlPcaInitials: e.adlPcaInitials || '', adlClientInitials: e.adlClientInitials || '',
            iadlActivities: e.iadlActivities || '{}', iadlTimeIn: e.iadlTimeIn || null, iadlTimeOut: e.iadlTimeOut || null,
            iadlPcaInitials: e.iadlPcaInitials || '', iadlClientInitials: e.iadlClientInitials || '',
            respiteActivities: e.respiteActivities || '{}', respiteTimeIn: e.respiteTimeIn || null, respiteTimeOut: e.respiteTimeOut || null,
            respitePcaInitials: e.respitePcaInitials || '', respiteClientInitials: e.respiteClientInitials || '',
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
            showToast('Progress saved');
        } catch (err) {
            showToast(err.message);
        }
        setSaving(false);
    };

    const handleSubmit = async () => {
        if (validationError) { showToast(validationError); return; }
        setSubmitting(true);
        try {
            const resp = await api.updatePcaForm(token, buildPayload('submit'));
            setData(resp);
            setEntries(resp.timesheet.entries || []);
            showToast('Timesheet submitted!');
        } catch (err) {
            showToast(err.message);
        }
        setSubmitting(false);
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
    if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--destructive))' }}>{error}</div>;
    if (!data) return null;

    const weekLabel = formatWeek(data.timesheet.weekStart.split('T')[0]);
    const iadlSection = iadlTab === 'respite' ? 'respite' : 'iadl';
    const iadlHoursFn = iadlTab === 'respite' ? respiteHrs : iadlHrs;

    const pasHeader = (
        <>
            <span>Activities of Daily Living — ADL's</span>
            <span className={`sdr-section-tag ${pasEnabled ? 'sdr-section-tag--active' : 'sdr-section-tag--disabled'}`}>PAS</span>
        </>
    );

    const iadlHeader = (
        <>
            <span>IADL's Instrumental Activities of Daily Living</span>
            <button
                type="button"
                className={`sdr-section-tag ${hmEnabled ? (iadlTab === 'iadl' ? 'sdr-section-tag--active' : 'sdr-section-tag--available') : 'sdr-section-tag--disabled'}`}
                disabled={!hmEnabled || submitted}
                onClick={() => hmEnabled && setIadlTab('iadl')}
                title={hmEnabled ? 'Log Homemaker time' : 'Not approved for this client'}
            >HOMEMAKER (HM)</button>
            <button
                type="button"
                className={`sdr-section-tag ${respiteEnabled ? (iadlTab === 'respite' ? 'sdr-section-tag--active' : 'sdr-section-tag--available') : 'sdr-section-tag--disabled'}`}
                disabled={!respiteEnabled || submitted}
                onClick={() => respiteEnabled && setIadlTab('respite')}
                title={respiteEnabled ? 'Log Respite time' : 'Not approved for this client'}
            >RESPITE (RP)</button>
        </>
    );

    return (
        <div className="pca-form-page">
            <div className="pca-form-header">
                <h1>PCA Service Delivery Record</h1>
                <p className="pca-form-week">{weekLabel}</p>
                <div className="pca-form-meta">
                    <span><strong>Client:</strong> {data.client.clientName}</span>
                    <span><strong>PCA:</strong> {data.pcaName}</span>
                    {submitted && <span className="ts-badge ts-badge--submitted">Submitted</span>}
                </div>
            </div>

            <div className="sdr-form" style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
                <SectionBlock
                    header={pasHeader}
                    activities={ADL_ACTIVITIES}
                    section="adl"
                    entries={entries}
                    updateEntry={updateEntry}
                    dailyHoursFn={adlHrs}
                    disabled={submitted || !pasEnabled}
                    sectionDisabled={!pasEnabled}
                />

                <SectionBlock
                    header={iadlHeader}
                    activities={IADL_ACTIVITIES}
                    section={iadlSection}
                    entries={entries}
                    updateEntry={updateEntry}
                    dailyHoursFn={iadlHoursFn}
                    disabled={submitted || !iadlAnyEnabled || (iadlTab === 'iadl' && !hmEnabled) || (iadlTab === 'respite' && !respiteEnabled)}
                    sectionDisabled={!iadlAnyEnabled}
                />
                {iadlAnyEnabled && hmEnabled && respiteEnabled && (
                    <p className="pca-form-hint">Tip: switch between <strong>HOMEMAKER</strong> and <strong>RESPITE</strong> using the tags in the blue bar above. Only one can be logged per day in a given time block.</p>
                )}

                <div className="sdr-totals-bar">
                    <div className="sdr-total-item"><span>Total</span><strong>{totalAll.toFixed(2)}</strong></div>
                    {pasEnabled && <div className="sdr-total-item"><span>PAS</span><strong>{totalPas.toFixed(2)}</strong></div>}
                    {hmEnabled && <div className="sdr-total-item"><span>Homemaker</span><strong>{totalHm.toFixed(2)}</strong></div>}
                    {respiteEnabled && <div className="sdr-total-item"><span>Respite</span><strong>{totalRespite.toFixed(2)}</strong></div>}
                </div>

                <div className="sdr-section">
                    <div className="sdr-section-title">Acknowledgement and Required Signatures</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16, padding: '0 16px' }}>
                        <div className="form-group"><label>PCA Name (First, MI, Last)</label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} disabled={submitted} placeholder="Jane A. Doe" /></div>
                        <div className="form-group"><label>Recipient Name (First, MI, Last)</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={submitted} placeholder="John B. Client" /></div>
                    </div>
                    <div className="ts-signatures">
                        <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} disabled={submitted} />
                    </div>
                    <div className="ts-signatures" style={{ paddingBottom: 16 }}>
                        <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} disabled={submitted} />
                    </div>
                </div>

                {!submitted && (
                    <div className="pca-form-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: 16 }}>
                        <button className="btn btn--outline" onClick={handleSave} disabled={saving || submitting}>{saving ? 'Saving…' : 'Save Progress'}</button>
                        <button className="btn btn--primary" onClick={handleSubmit} disabled={!!validationError || submitting || saving} title={validationError || 'Submit timesheet'}>{submitting ? 'Submitting…' : 'Submit Timesheet'}</button>
                    </div>
                )}
                {!submitted && validationError && (
                    <div style={{ textAlign: 'right', padding: '0 16px 16px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                        {validationError}
                    </div>
                )}

                {toast && <div className="pca-form-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', borderRadius: 8, zIndex: 1000 }}>{toast}</div>}
            </div>
        </div>
    );
}
