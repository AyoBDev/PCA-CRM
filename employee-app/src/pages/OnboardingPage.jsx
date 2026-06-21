import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getOnboardingInfo, submitOnboarding } from '../api';

const STEPS = [
    { label: 'Password' },
    { label: 'Schedule' },
    { label: 'Travel' },
    { label: 'Time Off' },
];

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOLIDAYS = [
    { key: 'newYears', label: "New Year's Day (Jan 1)" },
    { key: 'mlk', label: 'MLK Day (3rd Mon in Jan)' },
    { key: 'presidents', label: "Presidents' Day (3rd Mon in Feb)" },
    { key: 'memorial', label: 'Memorial Day (Last Mon in May)' },
    { key: 'independence', label: 'Independence Day (Jul 4)' },
    { key: 'labor', label: 'Labor Day (1st Mon in Sep)' },
    { key: 'thanksgiving', label: 'Thanksgiving (4th Thu in Nov)' },
    { key: 'christmas', label: 'Christmas (Dec 25)' },
];

const TRANSPORTATION_OPTIONS = ['Own car', 'Public transit', 'Rideshare', 'Walk', 'Other'];

export default function OnboardingPage() {
    const { token } = useParams();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [info, setInfo] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    // Step 1: Password
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    // Step 2: Schedule
    const [availableFrom, setAvailableFrom] = useState('');
    const [availableUntil, setAvailableUntil] = useState('');
    const [weeklySchedule, setWeeklySchedule] = useState(
        Object.fromEntries(DAYS.map(d => [d, { available: d !== 'sun', start: '08:00', end: '17:00' }]))
    );
    const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(40);
    const [maxConcurrentClients, setMaxConcurrentClients] = useState(1);

    // Step 3: Travel
    const [maxTravelTime, setMaxTravelTime] = useState(30);
    const [transportation, setTransportation] = useState('Own car');
    const [notes, setNotes] = useState('');

    // Step 4: Time Off
    const [holidayAvailability, setHolidayAvailability] = useState(
        Object.fromEntries(HOLIDAYS.map(h => [h.key, false]))
    );
    const [blackoutDates, setBlackoutDates] = useState([]);
    const [newBlackout, setNewBlackout] = useState('');
    const [initialTimeOff, setInitialTimeOff] = useState([]);
    const [newTimeOff, setNewTimeOff] = useState({ start: '', end: '', reason: '' });

    useEffect(() => {
        getOnboardingInfo(token)
            .then(setInfo)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    function toggleDay(day) {
        setWeeklySchedule(prev => ({
            ...prev,
            [day]: { ...prev[day], available: !prev[day].available },
        }));
    }

    function updateDayTime(day, field, value) {
        setWeeklySchedule(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value },
        }));
    }

    function addBlackout() {
        if (newBlackout && !blackoutDates.includes(newBlackout)) {
            setBlackoutDates(prev => [...prev, newBlackout].sort());
            setNewBlackout('');
        }
    }

    function removeBlackout(date) {
        setBlackoutDates(prev => prev.filter(d => d !== date));
    }

    function addTimeOff() {
        if (newTimeOff.start && newTimeOff.end) {
            setInitialTimeOff(prev => [...prev, { ...newTimeOff }]);
            setNewTimeOff({ start: '', end: '', reason: '' });
        }
    }

    function removeTimeOff(idx) {
        setInitialTimeOff(prev => prev.filter((_, i) => i !== idx));
    }

    function validateStep() {
        if (step === 0) {
            if (password.length < 8) return 'Password must be at least 8 characters';
            if (password !== passwordConfirm) return 'Passwords do not match';
        }
        if (step === 1) {
            if (!availableFrom) return 'Available from date is required';
            if (!maxHoursPerWeek || maxHoursPerWeek < 1) return 'Max hours per week is required';
            if (!maxConcurrentClients || maxConcurrentClients < 1) return 'Max clients is required';
        }
        if (step === 2) {
            if (!maxTravelTime || maxTravelTime < 1) return 'Max travel time is required';
            if (!transportation) return 'Transportation method is required';
        }
        return null;
    }

    function handleNext() {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError('');
        setStep(s => s + 1);
    }

    async function handleSubmit() {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError('');
        setSubmitting(true);
        try {
            await submitOnboarding(token, {
                password,
                passwordConfirm,
                availability: {
                    availableFrom,
                    availableUntil: availableUntil || null,
                    weeklySchedule,
                    maxHoursPerWeek: Number(maxHoursPerWeek),
                    maxConcurrentClients: Number(maxConcurrentClients),
                    maxTravelTime: Number(maxTravelTime),
                    transportation,
                    holidayAvailability,
                    blackoutDates,
                    initialTimeOff,
                    notes,
                },
            });
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return <div className="onboard-page"><div className="onboard-card"><p>Loading...</p></div></div>;
    if (!info && error) return (
        <div className="onboard-page">
            <div className="onboard-card">
                <h1 className="onboard-title">Onboarding</h1>
                <p className="onboard-error">{error}</p>
            </div>
        </div>
    );
    if (done) return (
        <div className="onboard-page">
            <div className="onboard-card">
                <div className="onboard-done-icon">&#10003;</div>
                <h1 className="onboard-title">All Done!</h1>
                <p className="onboard-subtitle">Your information has been submitted. Your admin will review and activate your account. You'll receive an email when you're all set.</p>
            </div>
        </div>
    );

    return (
        <div className="onboard-page">
            <div className="onboard-card">
                <h1 className="onboard-title">Welcome, {info.employeeName}!</h1>
                <p className="onboard-subtitle">Complete your setup to get started.</p>

                <div className="wizard-steps">
                    {STEPS.map((s, i) => (
                        <div key={i} className={`wizard-step ${i === step ? 'wizard-step--active' : ''} ${i < step ? 'wizard-step--completed' : ''}`}>
                            {i > 0 && <div className={`wizard-step-connector ${i <= step ? 'wizard-step-connector--completed' : ''}`} />}
                            <div className="wizard-step__circle">{i < step ? '✓' : i + 1}</div>
                            <span className="wizard-step__label">{s.label}</span>
                        </div>
                    ))}
                </div>

                {error && <div className="onboard-error">{error}</div>}

                {step === 0 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Set Your Password</h2>
                        <div className="form-group">
                            <label>Password (min 8 characters)</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                        </div>
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} autoComplete="new-password" />
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Your Weekly Schedule</h2>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label>Available From</label>
                                <input type="date" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Available Until (optional)</label>
                                <input type="date" value={availableUntil} onChange={e => setAvailableUntil(e.target.value)} />
                            </div>
                        </div>
                        <div className="onboard-schedule-grid">
                            {DAYS.map((day, i) => (
                                <div key={day} className={`onboard-day-row ${weeklySchedule[day].available ? '' : 'onboard-day-row--off'}`}>
                                    <label className="onboard-day-toggle">
                                        <input type="checkbox" checked={weeklySchedule[day].available} onChange={() => toggleDay(day)} />
                                        <span>{DAY_LABELS[i]}</span>
                                    </label>
                                    {weeklySchedule[day].available && (
                                        <div className="onboard-day-times">
                                            <input type="time" value={weeklySchedule[day].start} onChange={e => updateDayTime(day, 'start', e.target.value)} step="900" />
                                            <span>to</span>
                                            <input type="time" value={weeklySchedule[day].end} onChange={e => updateDayTime(day, 'end', e.target.value)} step="900" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label>Max Hours / Week</label>
                                <input type="number" min="1" max="80" value={maxHoursPerWeek} onChange={e => setMaxHoursPerWeek(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Max Clients at Once</label>
                                <input type="number" min="1" max="10" value={maxConcurrentClients} onChange={e => setMaxConcurrentClients(e.target.value)} />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Travel & Preferences</h2>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label>Max Travel Time (minutes)</label>
                                <input type="number" min="5" max="120" step="5" value={maxTravelTime} onChange={e => setMaxTravelTime(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Transportation</label>
                                <select value={transportation} onChange={e => setTransportation(e.target.value)}>
                                    {TRANSPORTATION_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Notes / Comments (optional)</label>
                            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any preferences or notes for your scheduler..." />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Time Off & Holidays</h2>
                        <h3 className="onboard-section-label">Holiday Availability</h3>
                        <p className="onboard-hint">Toggle ON the holidays you are willing to work.</p>
                        <div className="onboard-holiday-grid">
                            {HOLIDAYS.map(h => (
                                <label key={h.key} className="onboard-holiday-item">
                                    <input type="checkbox" checked={holidayAvailability[h.key]} onChange={() => setHolidayAvailability(prev => ({ ...prev, [h.key]: !prev[h.key] }))} />
                                    <span>{h.label}</span>
                                </label>
                            ))}
                        </div>

                        <h3 className="onboard-section-label">Blackout Dates</h3>
                        <p className="onboard-hint">Specific dates you can never work.</p>
                        <div className="onboard-inline-add">
                            <input type="date" value={newBlackout} onChange={e => setNewBlackout(e.target.value)} />
                            <button type="button" className="btn btn--outline btn--sm" onClick={addBlackout}>Add</button>
                        </div>
                        {blackoutDates.length > 0 && (
                            <div className="onboard-chip-list">
                                {blackoutDates.map(d => (
                                    <span key={d} className="onboard-chip">
                                        {d}
                                        <button type="button" onClick={() => removeBlackout(d)}>&times;</button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <h3 className="onboard-section-label">Initial Time Off</h3>
                        <p className="onboard-hint">Any upcoming planned absences.</p>
                        <div className="onboard-timeoff-add">
                            <input type="date" value={newTimeOff.start} onChange={e => setNewTimeOff(p => ({ ...p, start: e.target.value }))} placeholder="Start" />
                            <input type="date" value={newTimeOff.end} onChange={e => setNewTimeOff(p => ({ ...p, end: e.target.value }))} placeholder="End" />
                            <input type="text" value={newTimeOff.reason} onChange={e => setNewTimeOff(p => ({ ...p, reason: e.target.value }))} placeholder="Reason" />
                            <button type="button" className="btn btn--outline btn--sm" onClick={addTimeOff}>Add</button>
                        </div>
                        {initialTimeOff.length > 0 && (
                            <div className="onboard-timeoff-list">
                                {initialTimeOff.map((t, i) => (
                                    <div key={i} className="onboard-timeoff-item">
                                        <span>{t.start} — {t.end}</span>
                                        <span className="text-muted">{t.reason}</span>
                                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => removeTimeOff(i)}>&times;</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="onboard-actions">
                    {step > 0 && (
                        <button type="button" className="btn btn--outline" onClick={() => { setError(''); setStep(s => s - 1); }}>Back</button>
                    )}
                    {step < STEPS.length - 1 ? (
                        <button type="button" className="btn btn--primary" onClick={handleNext}>Next</button>
                    ) : (
                        <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
