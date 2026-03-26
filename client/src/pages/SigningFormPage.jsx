import { useState, useEffect } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import SignaturePad from '../components/common/SignaturePad';
import { formatWeek } from '../utils/dates';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function SigningFormPage({ token }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [role, setRole] = useState(null);
    const [ts, setTs] = useState(null);
    const [entries, setEntries] = useState([]);
    const [recipientName, setRecipientName] = useState('');
    const [recipientSig, setRecipientSig] = useState('');
    const [pcaFullName, setPcaFullName] = useState('');
    const [pcaSig, setPcaSig] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        api.getSigningForm(token)
            .then((data) => {
                setRole(data.role);
                setTs(data.timesheet);
                setEntries(data.timesheet.entries || []);
                setRecipientName(data.timesheet.recipientName || '');
                setRecipientSig(data.timesheet.recipientSignature || '');
                setPcaFullName(data.timesheet.pcaFullName || '');
                setPcaSig(data.timesheet.pcaSignature || '');
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const updateEntry = (idx, field, value) => {
        setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const payload = { entries };
            if (role === 'pca') {
                payload.pcaFullName = pcaFullName;
                payload.pcaSignature = pcaSig;
            } else {
                payload.recipientName = recipientName;
                payload.recipientSignature = recipientSig;
            }
            await api.submitSigningForm(token, payload);
            setSuccess(true);
        } catch (err) { setError(err.message); }
        setSubmitting(false);
    };

    if (loading) return (
        <div className="signing-page">
            <div className="signing-card"><p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading form…</p></div>
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
                <p>Your {role === 'pca' ? 'service record' : 'acknowledgement'} has been submitted successfully. You may close this page.</p>
            </div>
        </div>
    );

    const weekLabel = formatWeek(ts.weekStart.split('T')[0]);
    const adlDailyHrs = (e) => { const [hI, mI] = (e.adlTimeIn || '').split(':').map(Number); const [hO, mO] = (e.adlTimeOut || '').split(':').map(Number); if (!e.adlTimeIn || !e.adlTimeOut) return 0; const d = (hO * 60 + mO) - (hI * 60 + mI); return d > 0 ? Math.round(d / 60 * 100) / 100 : 0; };
    const iadlDailyHrs = (e) => { const [hI, mI] = (e.iadlTimeIn || '').split(':').map(Number); const [hO, mO] = (e.iadlTimeOut || '').split(':').map(Number); if (!e.iadlTimeIn || !e.iadlTimeOut) return 0; const d = (hO * 60 + mO) - (hI * 60 + mI); return d > 0 ? Math.round(d / 60 * 100) / 100 : 0; };

    return (
        <div className="signing-page">
            <div className="signing-form-container">
                <div className="signing-header">
                    <div className="signing-header__logo">{Icons.shieldCheck}</div>
                    <h1 className="signing-header__title">NV Best PCA</h1>
                    <p className="signing-header__sub">
                        {role === 'pca' ? 'PCA Service Delivery Record' : 'Client Acknowledgement'}
                    </p>
                </div>

                <div className="signing-info-bar">
                    <div><strong>Client:</strong> {ts.client?.clientName}</div>
                    <div><strong>PCA:</strong> {ts.pcaName}</div>
                    <div><strong>Week:</strong> {weekLabel}</div>
                </div>

                {/* Day entries */}
                <div className="signing-entries">
                    {entries.map((entry, idx) => {
                        const dayName = DAY_SHORT[entry.dayOfWeek] || `Day ${entry.dayOfWeek}`;
                        const dateStr = entry.dateOfService ? new Date(entry.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                        return (
                            <div key={entry.id} className="signing-day-card">
                                <div className="signing-day-card__header">{dayName} {dateStr && <span>{dateStr}</span>}</div>

                                {role === 'pca' ? (
                                    <div className="signing-day-card__body">
                                        <div className="signing-field-row">
                                            <div className="signing-field">
                                                <label>ADL Time In</label>
                                                <input type="time" value={entry.adlTimeIn || ''} onChange={(e) => updateEntry(idx, 'adlTimeIn', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>ADL Time Out</label>
                                                <input type="time" value={entry.adlTimeOut || ''} onChange={(e) => updateEntry(idx, 'adlTimeOut', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>ADL Hrs</label>
                                                <div className="signing-hours">{adlDailyHrs(entry).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 8 }}>
                                            <label>PCA Initials</label>
                                            <input type="text" value={entry.adlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'adlPcaInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                        <div className="signing-field-row" style={{ marginTop: 12 }}>
                                            <div className="signing-field">
                                                <label>IADL Time In</label>
                                                <input type="time" value={entry.iadlTimeIn || ''} onChange={(e) => updateEntry(idx, 'iadlTimeIn', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL Time Out</label>
                                                <input type="time" value={entry.iadlTimeOut || ''} onChange={(e) => updateEntry(idx, 'iadlTimeOut', e.target.value)} />
                                            </div>
                                            <div className="signing-field">
                                                <label>IADL Hrs</label>
                                                <div className="signing-hours">{iadlDailyHrs(entry).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 8 }}>
                                            <label>PCA Initials (IADL)</label>
                                            <input type="text" value={entry.iadlPcaInitials || ''} onChange={(e) => updateEntry(idx, 'iadlPcaInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="signing-day-card__body">
                                        <div className="signing-field-row">
                                            <div className="signing-field"><label>ADL</label><div className="signing-hours">{entry.adlTimeIn || '—'} → {entry.adlTimeOut || '—'} ({adlDailyHrs(entry).toFixed(2)}h)</div></div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 6 }}>
                                            <label>Client Initials (ADL)</label>
                                            <input type="text" value={entry.adlClientInitials || ''} onChange={(e) => updateEntry(idx, 'adlClientInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                        <div className="signing-field-row" style={{ marginTop: 12 }}>
                                            <div className="signing-field"><label>IADL</label><div className="signing-hours">{entry.iadlTimeIn || '—'} → {entry.iadlTimeOut || '—'} ({iadlDailyHrs(entry).toFixed(2)}h)</div></div>
                                        </div>
                                        <div className="signing-field" style={{ marginTop: 6 }}>
                                            <label>Client Initials (IADL)</label>
                                            <input type="text" value={entry.iadlClientInitials || ''} onChange={(e) => updateEntry(idx, 'iadlClientInitials', e.target.value)} maxLength={5} style={{ width: 80 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Signature section */}
                <div className="signing-signature-section">
                    {role === 'pca' ? (
                        <>
                            <div className="form-group"><label>PCA Full Name</label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} placeholder="Enter your full name" /></div>
                            <SignaturePad label="PCA Signature" value={pcaSig} onChange={setPcaSig} />
                        </>
                    ) : (
                        <>
                            <div className="form-group"><label>Recipient / Responsible Party Name</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Enter your full name" /></div>
                            <SignaturePad label="Recipient / Responsible Party Signature" value={recipientSig} onChange={setRecipientSig} />
                        </>
                    )}
                </div>

                <button className="btn btn--primary" style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16 }} onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit'}
                </button>
            </div>
        </div>
    );
}
