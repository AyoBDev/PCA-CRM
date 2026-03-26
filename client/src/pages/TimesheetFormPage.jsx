import { useState, useEffect } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';

// Timesheet constants
const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry'];
const NUTRITION_ACTIVITIES = ['Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];

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

function ActivityRow({ label, entries, section, activityKey, updateEntry, disabled }) {
    return (
        <div className="sdr-activity-row">
            <div className="sdr-activity-label">{label}</div>
            {entries.map((entry, idx) => {
                const activities = JSON.parse(entry[`${section}Activities`] || '{}');
                const checked = !!activities[activityKey];
                return (
                    <div key={idx} className="sdr-activity-cell">
                        <input type="checkbox" checked={checked} disabled={disabled}
                            onChange={() => {
                                const next = { ...activities, [activityKey]: !checked };
                                updateEntry(idx, `${section}Activities`, JSON.stringify(next));
                            }} />
                    </div>
                );
            })}
        </div>
    );
}

export default function TimesheetFormPage({ timesheetId, clients, onBack, showToast }) {
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
    const submitted = ts?.status === 'submitted';

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
            }).catch((err) => showToast(err.message, 'error'));
        }
    }, [timesheetId, showToast]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    };

    const adlDailyHours = (e) => computeHours(e.adlTimeIn, e.adlTimeOut);
    const iadlDailyHours = (e) => computeHours(e.iadlTimeIn, e.iadlTimeOut);
    const totalPas = entries.reduce((s, e) => s + adlDailyHours(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlDailyHours(e), 0);
    const totalAll = totalPas + totalHm;

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = {
                entries: entries.map((e) => ({
                    id: e.id, dateOfService: e.dateOfService,
                    adlActivities: e.adlActivities || '{}', adlTimeIn: e.adlTimeIn || null, adlTimeOut: e.adlTimeOut || null,
                    adlPcaInitials: e.adlPcaInitials || '', adlClientInitials: e.adlClientInitials || '',
                    iadlActivities: e.iadlActivities || '{}', iadlTimeIn: e.iadlTimeIn || null, iadlTimeOut: e.iadlTimeOut || null,
                    iadlPcaInitials: e.iadlPcaInitials || '', iadlClientInitials: e.iadlClientInitials || '',
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

    const handleShareLinks = async () => {
        try {
            const links = await api.generateSigningLinks(ts.id);
            setShareLinkModal(links);
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (!ts) return <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);

    const renderSection = (title, tag, activities, nutritionActivities, section) => (
        <div className="sdr-section">
            <div className="sdr-section-title">{title} <span className="sdr-section-tag">{tag}</span></div>
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
                <ActivityRow key={act} label={act} entries={entries} section={section} activityKey={act} updateEntry={updateEntry} disabled={submitted} />
            ))}
            {nutritionActivities && <>
                <div className="sdr-subsection-label">NUTRITION</div>
                {nutritionActivities.map((act) => (
                    <ActivityRow key={act} label={act} entries={entries} section={section} activityKey={act} updateEntry={updateEntry} disabled={submitted} />
                ))}
            </>}
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>PCA Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}PcaInitials`] || ''} onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} disabled={submitted} maxLength={4} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-initials-row">
                <div className="sdr-activity-label"><strong>Client Initials</strong></div>
                {entries.map((e, i) => (
                    <div key={i} className="sdr-activity-cell">
                        <input type="text" className="sdr-initials-input" value={e[`${section}ClientInitials`] || ''} onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} disabled={submitted} maxLength={4} />
                    </div>
                ))}
            </div>
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time In</div>
                {entries.map((e, i) => (<div key={i} className="sdr-activity-cell"><input type="time" className="sdr-time-input" value={e[`${section}TimeIn`] || ''} onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} disabled={submitted} /></div>))}
            </div>
            <div className="sdr-activity-row sdr-time-row">
                <div className="sdr-activity-label">Time Out</div>
                {entries.map((e, i) => (<div key={i} className="sdr-activity-cell"><input type="time" className="sdr-time-input" value={e[`${section}TimeOut`] || ''} onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} disabled={submitted} /></div>))}
            </div>
            <div className="sdr-activity-row sdr-total-row">
                <div className="sdr-activity-label"><strong>Daily Totals</strong></div>
                {entries.map((e, i) => {
                    const hrs = section === 'adl' ? adlDailyHours(e) : iadlDailyHours(e);
                    return <div key={i} className="sdr-activity-cell sdr-hours-cell">{hrs > 0 ? hrs.toFixed(2) : '—'}</div>;
                })}
            </div>
        </div>
    );

    return (
        <>
            <div className="content-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn--ghost btn--icon" onClick={onBack} title="Back">←</button>
                    <div>
                        <h1 className="content-header__title" style={{ margin: 0 }}>PCA Service Delivery Record</h1>
                        <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{weekLabel}</p>
                    </div>
                </div>
                <div className="content-header__actions">
                    {submitted ? (
                        <span className="ts-badge ts-badge--submitted">Submitted {ts.submittedAt ? new Date(ts.submittedAt).toLocaleString() : ''}</span>
                    ) : (
                        <>
                            <button className="btn btn--outline btn--sm" onClick={handleShareLinks}>{Icons.share} Share</button>
                            <button className="btn btn--outline btn--sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
                            <button className="btn btn--primary btn--sm" onClick={handleSubmit}>Submit</button>
                        </>
                    )}
                </div>
            </div>

            <div className="page-content sdr-form">
                <div className="sdr-client-info">
                    <div className="sdr-info-field"><span className="sdr-info-label">Client:</span> <span className="sdr-info-value">{ts.client?.clientName}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Phone:</span> <span className="sdr-info-value">{ts.clientPhone || '—'}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Client ID:</span> <span className="sdr-info-value">{ts.clientIdNumber || '—'}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">PCA:</span> <span className="sdr-info-value">{ts.pcaName}</span></div>
                    <div className="sdr-info-field"><span className="sdr-info-label">Status:</span> <span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span></div>
                </div>

                {renderSection("Activities of Daily Living — ADL's", 'PAS', ADL_ACTIVITIES, null, 'adl')}
                {renderSection("IADL's Instrumental Activities of Daily Living", 'HM', IADL_ACTIVITIES, NUTRITION_ACTIVITIES, 'iadl')}

                <div className="sdr-totals-bar">
                    <div className="sdr-total-item"><span>Total Hours in This Time Sheet</span><strong>{totalAll.toFixed(2)}</strong></div>
                    <div className="sdr-total-item"><span>Total Hours for PAS</span><strong>{totalPas.toFixed(2)}</strong></div>
                    <div className="sdr-total-item"><span>Total Hours for Homemaker</span><strong>{totalHm.toFixed(2)}</strong></div>
                </div>

                <div className="sdr-section">
                    <div className="sdr-section-title">Acknowledgement and Required Signatures</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                        <div className="form-group"><label>Recipient Name (First, MI, Last)</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={submitted} placeholder="Jane A. Doe" /></div>
                        <div className="form-group"><label>Date</label><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={submitted} /></div>
                    </div>
                    <div className="ts-signatures">
                        <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} disabled={submitted} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16, padding: '0 16px' }}>
                        <div className="form-group"><label>PCA Name (First, MI, Last)</label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} disabled={submitted} placeholder="Maria A. Garcia" /></div>
                        <div className="form-group"><label>Date</label><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} disabled={submitted} /></div>
                    </div>
                    <div className="ts-signatures">
                        <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} disabled={submitted} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 0, padding: '0 16px' }}>
                        <div className="form-group"><label>Supervisor Name</label><input type="text" value={ts.supervisorName || 'Sona Hakobyan'} disabled style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} /></div>
                    </div>
                    <div className="ts-signatures" style={{ paddingBottom: 16 }}>
                        <SignaturePad label="Supervisor Signature" value={supervisorSig} onChange={setSupervisorSig} disabled={submitted} />
                    </div>
                </div>
            </div>

            {shareLinkModal && (
                <Modal onClose={() => setShareLinkModal(null)}>
                    <h2 className="modal__title"><span style={{ display: 'inline-block', width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }}>{Icons.share}</span>Signing Links</h2>
                    <p className="modal__desc">Share these secure one-time links. Each link expires in 72 hours and can only be used once.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="share-link-group">
                            <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>PCA Link</label>
                            <div className="share-link-row">
                                <input type="text" readOnly value={shareLinkModal.pcaLink} className="share-link-input" />
                                <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.pcaLink); showToast('PCA link copied!'); }}>{Icons.copy} Copy</button>
                            </div>
                        </div>
                        <div className="share-link-group">
                            <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block' }}>Client / Guardian Link</label>
                            <div className="share-link-row">
                                <input type="text" readOnly value={shareLinkModal.clientLink} className="share-link-input" />
                                <button className="btn btn--outline btn--sm" onClick={() => { navigator.clipboard.writeText(shareLinkModal.clientLink); showToast('Client link copied!'); }}>{Icons.copy} Copy</button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
