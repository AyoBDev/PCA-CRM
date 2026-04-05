import { useState, useEffect, useMemo } from 'react';
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
    if (m <= 7) return `${String(h).padStart(2, '0')}:00`;
    if (m <= 22) return `${String(h).padStart(2, '0')}:15`;
    if (m <= 37) return `${String(h).padStart(2, '0')}:30`;
    if (m <= 52) return `${String(h).padStart(2, '0')}:45`;
    return `${String(h + 1).padStart(2, '0')}:00`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const ri = roundTo15(timeIn), ro = roundTo15(timeOut);
    const [hI, mI] = ri.split(':').map(Number);
    const [hO, mO] = ro.split(':').map(Number);
    const diff = (hO * 60 + mO) - (hI * 60 + mI);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

export default function SigningFormPage({ token: tokenProp }) {
    const params = useParams();
    const token = tokenProp || params.token;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pcaFullName, setPcaFullName] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [recipientSig, setRecipientSig] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        api.getSigningForm(token)
            .then((data) => {
                setTs(data.timesheet);
                setEntries(data.timesheet.entries || []);
                setPcaFullName(data.timesheet.pcaFullName || '');
                setPcaSig(data.timesheet.pcaSignature || '');
                setRecipientName(data.timesheet.recipientName || '');
                setRecipientSig(data.timesheet.recipientSignature || '');
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
    };

    const toggleActivity = (idx, section, activityKey) => {
        setEntries((prev) => prev.map((e, i) => {
            if (i !== idx) return e;
            const activities = JSON.parse(e[`${section}Activities`] || '{}');
            return { ...e, [`${section}Activities`]: JSON.stringify({ ...activities, [activityKey]: !activities[activityKey] }) };
        }));
    };

    const adlHrs = (e) => computeHours(e.adlTimeIn, e.adlTimeOut);
    const iadlHrs = (e) => computeHours(e.iadlTimeIn, e.iadlTimeOut);
    const totalPas = entries.reduce((s, e) => s + adlHrs(e), 0);
    const totalHm = entries.reduce((s, e) => s + iadlHrs(e), 0);

    const dayHasActivity = (e) => {
        const adlActs = JSON.parse(e.adlActivities || '{}');
        const iadlActs = JSON.parse(e.iadlActivities || '{}');
        const hasChecked = Object.values(adlActs).some(Boolean) || Object.values(iadlActs).some(Boolean);
        const hasTime = e.adlTimeIn || e.adlTimeOut || e.iadlTimeIn || e.iadlTimeOut;
        return hasChecked || hasTime;
    };

    const missing = useMemo(() => {
        const issues = [];
        entries.forEach((e) => {
            if (!dayHasActivity(e)) return;
            const day = DAY_SHORT[e.dayOfWeek];
            if (!(e.adlPcaInitials || '').trim() && !(e.iadlPcaInitials || '').trim()) issues.push(`${day}: PCA initials`);
            if (!(e.adlClientInitials || '').trim() && !(e.iadlClientInitials || '').trim()) issues.push(`${day}: Client initials`);
        });
        if (!pcaFullName.trim()) issues.push('PCA full name');
        if (!pcaSig) issues.push('PCA signature');
        if (!recipientName.trim()) issues.push('Client/recipient name');
        if (!recipientSig) issues.push('Client signature');
        return issues;
    }, [entries, pcaFullName, pcaSig, recipientName, recipientSig]);

    const canSubmit = missing.length === 0;

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            await api.submitSigningForm(token, {
                entries,
                pcaFullName,
                pcaSignature: pcaSig,
                recipientName,
                recipientSignature: recipientSig,
                completionDate: today,
            });
            setSuccess(true);
        } catch (err) { setError(err.message); }
        setSubmitting(false);
    };

    if (loading) return (
        <div className="signing-page">
            <div className="signing-card"><p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading form...</p></div>
        </div>
    );
    if (error) return (
        <div className="signing-page">
            <div className="signing-card signing-card--error">
                <div className="signing-card__icon" style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertCircle}</div>
                <h2>{error}</h2>
                <p>This signing link is no longer valid. Please request a new link from your administrator.</p>
            </div>
        </div>
    );
    if (success) return (
        <div className="signing-page">
            <div className="signing-card signing-card--success">
                <div className="signing-card__icon" style={{ color: 'hsl(142 76% 36%)' }}>{Icons.checkCircle}</div>
                <h2>Thank you!</h2>
                <p>The timesheet has been submitted successfully. You may close this page.</p>
            </div>
        </div>
    );

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);

    return (
        <div className="signing-page">
            <div className="signing-form-container">
                <div className="signing-header">
                    <div className="signing-header__logo">{Icons.shieldCheck}</div>
                    <h1 className="signing-header__title">NV Best PCA</h1>
                    <p className="signing-header__sub">PCA Service Delivery Record</p>
                </div>

                <div className="signing-info-bar">
                    <div><strong>Client:</strong> {ts.client?.clientName}</div>
                    <div><strong>PCA:</strong> {ts.pcaName}</div>
                    <div><strong>Week:</strong> {weekLabel}</div>
                </div>

                <div className="signing-entries">
                    {entries.map((entry, idx) => {
                        const dayName = DAY_SHORT[entry.dayOfWeek] || `Day ${entry.dayOfWeek}`;
                        const dateStr = entry.dateOfService ? new Date(entry.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                        return (
                            <div key={entry.id} className="signing-day-card">
                                <div className="signing-day-card__header">{dayName} {dateStr && <span>{dateStr}</span>}</div>
                                <div className="signing-day-card__body">

                                    <div className="signing-section-label">ADL Activities</div>
                                    <div className="signing-activity-grid">
                                        {ADL_ACTIVITIES.map((act) => {
                                            const activities = JSON.parse(entry.adlActivities || '{}');
                                            return (
                                                <label key={act} className="signing-activity-check">
                                                    <input type="checkbox" checked={!!activities[act]} onChange={() => toggleActivity(idx, 'adl', act)} />
                                                    <span>{act}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="signing-field-row">
                                        <div className="signing-field">
                                            <label>Time In</label>
                                            <input type="time" value={entry.adlTimeIn || ''} onChange={(e) => updateEntry(idx, 'adlTimeIn', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Time Out</label>
                                            <input type="time" value={entry.adlTimeOut || ''} onChange={(e) => updateEntry(idx, 'adlTimeOut', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Hours</label>
                                            <div className="signing-hours">{adlHrs(entry).toFixed(2)}</div>
                                        </div>
                                    </div>

                                    <div className="signing-section-label" style={{ marginTop: 12 }}>IADL Activities</div>
                                    <div className="signing-activity-grid">
                                        {IADL_ACTIVITIES.map((act) => {
                                            const activities = JSON.parse(entry.iadlActivities || '{}');
                                            return (
                                                <label key={act} className="signing-activity-check">
                                                    <input type="checkbox" checked={!!activities[act]} onChange={() => toggleActivity(idx, 'iadl', act)} />
                                                    <span>{act}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="signing-field-row">
                                        <div className="signing-field">
                                            <label>Time In</label>
                                            <input type="time" value={entry.iadlTimeIn || ''} onChange={(e) => updateEntry(idx, 'iadlTimeIn', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Time Out</label>
                                            <input type="time" value={entry.iadlTimeOut || ''} onChange={(e) => updateEntry(idx, 'iadlTimeOut', e.target.value)} />
                                        </div>
                                        <div className="signing-field">
                                            <label>Hours</label>
                                            <div className="signing-hours">{iadlHrs(entry).toFixed(2)}</div>
                                        </div>
                                    </div>

                                    <div className="signing-highlight signing-highlight--pca" style={{ marginTop: 12 }}>
                                        <div className="signing-highlight__label">PCA Initials</div>
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL</label>
                                                <input type="text" value={entry.adlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'adlPcaInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL</label>
                                                <input type="text" value={entry.iadlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'iadlPcaInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="signing-highlight signing-highlight--client" style={{ marginTop: 8 }}>
                                        <div className="signing-highlight__label">Hand device to client</div>
                                        <div className="signing-highlight__sublabel">Client Initials</div>
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL</label>
                                                <input type="text" value={entry.adlClientInitials || ''} onChange={(e) => updateEntry(idx, 'adlClientInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL</label>
                                                <input type="text" value={entry.iadlClientInitials || ''} onChange={(e) => updateEntry(idx, 'iadlClientInitials', e.target.value.toUpperCase())} maxLength={5} style={{ width: 80 }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="signing-totals">
                    <div><strong>Total PAS (ADL):</strong> {totalPas.toFixed(2)} hrs</div>
                    <div><strong>Total HM (IADL):</strong> {totalHm.toFixed(2)} hrs</div>
                    <div><strong>Total Hours:</strong> {(totalPas + totalHm).toFixed(2)} hrs</div>
                </div>

                <div className="signing-highlight signing-highlight--pca signing-signature-section">
                    <div className="signing-highlight__label">PCA Signature</div>
                    <div className="form-group">
                        <label>PCA Full Name</label>
                        <input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} placeholder="Enter your full name" />
                    </div>
                    <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} />
                </div>

                <div className="signing-highlight signing-highlight--client signing-signature-section">
                    <div className="signing-highlight__label">Hand device to client for signature</div>
                    <div className="form-group">
                        <label>Recipient / Responsible Party Name</label>
                        <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Enter client full name" />
                    </div>
                    <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} />
                </div>

                {missing.length > 0 && (
                    <div className="signing-missing">
                        <strong>Missing before submit:</strong>
                        <ul>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    </div>
                )}

                <button
                    className={`btn ${canSubmit ? 'btn--success' : 'btn--primary'}`}
                    style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16, opacity: canSubmit ? 1 : 0.5 }}
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                >
                    {submitting ? 'Submitting...' : 'Submit Timesheet'}
                </button>
            </div>
        </div>
    );
}
