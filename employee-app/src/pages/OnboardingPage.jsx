import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getOnboardingInfo, saveOnboardingPersonal, saveOnboardingEmergency, saveOnboardingAvailabilityDraft, uploadOnboardingDocument, ackOnboardingPolicy, submitOnboardingV2 } from '../api';
import PersonalInfoStep from '../components/onboarding/PersonalInfoStep';
import EmergencyContactStep from '../components/onboarding/EmergencyContactStep';
import DocumentsStep from '../components/onboarding/DocumentsStep';
import CertificationsStep from '../components/onboarding/CertificationsStep';
import PoliciesStep from '../components/onboarding/PoliciesStep';
import ReviewStep from '../components/onboarding/ReviewStep';

// Logical step sequence. "Availability" spans 3 screens internally (Schedule, Travel, Time Off)
// but counts as ONE stage for progress/resumability purposes.
const STEPS = [
    { key: 'password', label: 'Password' },
    { key: 'personal', label: 'Personal Info' },
    { key: 'emergency', label: 'Emergency Contact' },
    { key: 'availability-schedule', label: 'Schedule' },
    { key: 'availability-travel', label: 'Travel' },
    { key: 'availability-timeoff', label: 'Time Off' },
    { key: 'documents', label: 'Documents' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'policies', label: 'Policies' },
    { key: 'review', label: 'Review' },
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

const AVAILABILITY_STEPS = [3, 4, 5];

// A document/certification requirement is satisfied once submitted or approved;
// a policy only once approved. Mirrors the server's isOnboardingComplete rule.
function reqSatisfied(r) {
    return r.kind === 'policy' ? r.status === 'approved' : (r.status === 'submitted' || r.status === 'approved');
}

export default function OnboardingPage() {
    const { token } = useParams();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [info, setInfo] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [initialStepApplied, setInitialStepApplied] = useState(false);

    // Password
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // Personal Info + Emergency Contact
    const [personal, setPersonal] = useState({});
    const [emergency, setEmergency] = useState({});

    // Availability: Schedule
    const [availableFrom, setAvailableFrom] = useState('');
    const [availableUntil, setAvailableUntil] = useState('');
    const [weeklySchedule, setWeeklySchedule] = useState(
        Object.fromEntries(DAYS.map(d => [d, { available: d !== 'sun', start: '08:00', end: '17:00' }]))
    );
    const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(40);
    const [maxConcurrentClients, setMaxConcurrentClients] = useState(1);

    // Availability: Travel
    const [maxTravelTime, setMaxTravelTime] = useState(30);
    const [transportation, setTransportation] = useState('Own car');
    const [notes, setNotes] = useState('');

    // Availability: Time Off. Each holiday mirrors a weekly day-row: a toggle,
    // and when ON, the hours the caregiver is available that day.
    const [holidayAvailability, setHolidayAvailability] = useState(
        Object.fromEntries(HOLIDAYS.map(h => [h.key, { available: false, start: '08:00', end: '17:00' }]))
    );
    const [blackoutDates, setBlackoutDates] = useState([]);
    const [newBlackout, setNewBlackout] = useState('');
    const [initialTimeOff, setInitialTimeOff] = useState([]);
    const [newTimeOff, setNewTimeOff] = useState({ start: '', end: '', reason: '' });

    const refetchInfo = useCallback(() => {
        return getOnboardingInfo(token).then(setInfo).catch(err => setError(err.message));
    }, [token]);

    useEffect(() => {
        getOnboardingInfo(token)
            .then(data => {
                setInfo(data);
                if (!initialStepApplied) {
                    rehydrate(data);
                    setInitialStepApplied(true);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
        // rehydrate is stable for the life of the component; intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // Refill everything the server has saved so a returning employee resumes where
    // they left off. Password is never restored (it isn't stored until submit).
    function rehydrate(data) {
        const saved = data && data.saved ? data.saved : {};
        if (saved.personal) setPersonal(p => ({ ...p, ...saved.personal }));
        if (saved.emergency) setEmergency(e => ({ ...e, ...saved.emergency }));
        const a = saved.availability;
        if (a) {
            if (a.availableFrom) setAvailableFrom(a.availableFrom);
            if (a.availableUntil) setAvailableUntil(a.availableUntil);
            if (a.weeklySchedule) setWeeklySchedule(prev => ({ ...prev, ...a.weeklySchedule }));
            if (a.maxHoursPerWeek != null) setMaxHoursPerWeek(a.maxHoursPerWeek);
            if (a.maxConcurrentClients != null) setMaxConcurrentClients(a.maxConcurrentClients);
            if (a.maxTravelTime != null) setMaxTravelTime(a.maxTravelTime);
            if (a.transportation) setTransportation(a.transportation);
            if (a.notes) setNotes(a.notes);
            if (a.holidayAvailability) setHolidayAvailability(prev => ({ ...prev, ...a.holidayAvailability }));
            if (Array.isArray(a.blackoutDates)) setBlackoutDates(a.blackoutDates);
            if (Array.isArray(a.initialTimeOff)) setInitialTimeOff(a.initialTimeOff);
        }
        // Jump to the first step that still needs attention. Password (0) is always
        // required in the submitting session, so a returning user with saved progress
        // resumes at the first UNSAVED data step instead.
        setStep(firstIncompleteStep(data));
    }

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

    function toggleHoliday(key) {
        setHolidayAvailability(prev => ({
            ...prev,
            [key]: { ...prev[key], available: !prev[key].available },
        }));
    }

    function updateHolidayTime(key, field, value) {
        setHolidayAvailability(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value },
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
        if (step === 3) {
            if (!availableFrom) return 'Available from date is required';
            if (!maxHoursPerWeek || maxHoursPerWeek < 1) return 'Max hours per week is required';
            if (!maxConcurrentClients || maxConcurrentClients < 1) return 'Max clients is required';
        }
        if (step === 4) {
            if (!maxTravelTime || maxTravelTime < 1) return 'Max travel time is required';
            if (!transportation) return 'Transportation method is required';
        }
        return null;
    }

    async function handleNext() {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError('');

        try {
            if (step === 1) {
                // Personal Info step -> save
                await saveOnboardingPersonal(token, personal);
            } else if (step === 2) {
                // Emergency Contact step -> save
                await saveOnboardingEmergency(token, emergency);
            } else if (step === 5) {
                // Last availability screen (Time Off) -> persist the whole availability form
                // as a draft so it survives a page reload. (Final submit re-sends it too.)
                await saveOnboardingAvailabilityDraft(token, buildAvailability());
            }
        } catch (err) {
            setError(err.message);
            return;
        }

        setStep(s => s + 1);
    }

    async function handleUploadDocument(reqId, file, expirationDate) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (expirationDate) formData.append('expirationDate', expirationDate);
            await uploadOnboardingDocument(token, reqId, formData);
            await refetchInfo();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleAckPolicy(reqId) {
        try {
            await ackOnboardingPolicy(token, reqId);
            await refetchInfo();
        } catch (err) {
            setError(err.message);
        }
    }

    function buildAvailability() {
        return {
            availableFrom, availableUntil: availableUntil || null,
            weeklySchedule, maxHoursPerWeek, maxConcurrentClients,
            maxTravelTime, transportation, notes,
            holidayAvailability, blackoutDates, initialTimeOff,
        };
    }

    // Whether a given step's data is complete. Prefers LOCAL form state (what the
    // user has actually entered this session) so a dot turns green the moment they
    // fill a step, then falls back to server-known `data` for a resumed session.
    // Requirement steps read live status from `data.requirements`.
    function stepDone(i, data) {
        const prog = (data && data.progress) || {};
        const reqs = (data && data.requirements) || [];
        switch (i) {
            case 0: return step > 0; // password: entered in-session; "done" once passed
            case 1: return Boolean((personal.dob && personal.address) || prog.personal);
            case 2: return Boolean(emergency.emergencyContactName || prog.emergency);
            case 3: case 4: case 5: return Boolean(availableFrom || prog.availability);
            case 6: return reqs.filter(r => r.kind === 'document').every(reqSatisfied);
            case 7: return reqs.filter(r => r.kind === 'certification').every(reqSatisfied);
            case 8: return reqs.filter(r => r.kind === 'policy').every(reqSatisfied);
            case 9: return false; // review is the terminal action, never "done" until submit
            default: return false;
        }
    }

    // Where a returning user should resume. A brand-new employee (no saved progress
    // at all) starts at Password (step 0). Once ANY progress exists, we skip password
    // (it can't be restored) and land on the first data step that isn't saved yet.
    function firstIncompleteStep(data) {
        const prog = (data && data.progress) || {};
        const anyProgress = prog.personal || prog.emergency || prog.availability
            || ((data && data.requirements) || []).some(reqSatisfied);
        if (!anyProgress) return 0;
        for (let i = 1; i < STEPS.length; i++) {
            // availability spans 3 screens; if the draft is missing, resume at the first one
            if (AVAILABILITY_STEPS.includes(i)) {
                if (!prog.availability) return 3;
                i = 5; // skip the other availability screens
                continue;
            }
            if (!stepDone(i, data)) return i;
        }
        return STEPS.length - 1; // Review
    }

    async function handleSubmit() {
        setError('');
        setSubmitting(true);
        try {
            const res = await submitOnboardingV2(token, { password, availability: buildAvailability() });
            if (res && res.error) { setError(res.error); return; }
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

    const requirements = info.requirements || [];
    const isLastStep = step === STEPS.length - 1;

    return (
        <div className="onboard-page">
            <div className="onboard-card">
                <h1 className="onboard-title">Welcome, {info.employeeName}!</h1>
                <p className="onboard-subtitle">Complete your setup to get started.</p>

                <div className="wizard-dots">
                    {STEPS.map((s, i) => {
                        let mod = '';
                        let mark = '';
                        if (i === step) {
                            mod = 'wizard-dot--active';
                        } else if (i < step) {
                            // A step already passed: green if its data is saved, red if it was
                            // required but skipped/left incomplete.
                            if (stepDone(i, info)) { mod = 'wizard-dot--done'; mark = '✓'; }
                            else { mod = 'wizard-dot--incomplete'; mark = '!'; }
                        }
                        const title = (i < step && !stepDone(i, info)) ? `${s.label} — needs attention` : s.label;
                        return <span key={s.key} className={`wizard-dot ${mod}`} title={title} aria-label={title}>{mark}</span>;
                    })}
                </div>
                <div className="wizard-dots__label">
                    {STEPS[step].label} <span>· Step {step + 1} of {STEPS.length}</span>
                </div>

                {error && <div className="onboard-error">{error}</div>}

                {step === 0 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Set Your Password</h2>
                        <div className="form-group">
                            <label>Password (min 8 characters)</label>
                            <div className="onboard-password-wrap">
                                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                                <button type="button" className="onboard-password-toggle" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                                    {showPassword ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <div className="onboard-password-wrap">
                                <input type={showPasswordConfirm ? 'text' : 'password'} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} autoComplete="new-password" />
                                <button type="button" className="onboard-password-toggle" onClick={() => setShowPasswordConfirm(v => !v)} tabIndex={-1}>
                                    {showPasswordConfirm ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <PersonalInfoStep value={personal} onChange={setPersonal} />
                )}

                {step === 2 && (
                    <EmergencyContactStep value={emergency} onChange={setEmergency} />
                )}

                {step === 3 && (
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

                {step === 4 && (
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

                {step === 5 && (
                    <div className="onboard-step">
                        <h2 className="onboard-step-title">Time Off & Holidays</h2>
                        <h3 className="onboard-section-label">Holiday Availability</h3>
                        <p className="onboard-hint">Toggle ON the holidays you are willing to work, then set the hours you're available that day.</p>
                        <div className="onboard-schedule-grid">
                            {HOLIDAYS.map(h => (
                                <div key={h.key} className={`onboard-day-row ${holidayAvailability[h.key].available ? '' : 'onboard-day-row--off'}`}>
                                    <label className="onboard-day-toggle">
                                        <input type="checkbox" checked={holidayAvailability[h.key].available} onChange={() => toggleHoliday(h.key)} />
                                        <span>{h.label}</span>
                                    </label>
                                    {holidayAvailability[h.key].available && (
                                        <div className="onboard-day-times">
                                            <input type="time" value={holidayAvailability[h.key].start} onChange={e => updateHolidayTime(h.key, 'start', e.target.value)} step="900" />
                                            <span>to</span>
                                            <input type="time" value={holidayAvailability[h.key].end} onChange={e => updateHolidayTime(h.key, 'end', e.target.value)} step="900" />
                                        </div>
                                    )}
                                </div>
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

                {step === 6 && (
                    <DocumentsStep requirements={requirements} onUpload={handleUploadDocument} />
                )}

                {step === 7 && (
                    <CertificationsStep requirements={requirements} onUpload={handleUploadDocument} />
                )}

                {step === 8 && (
                    <PoliciesStep requirements={requirements} onAck={handleAckPolicy} />
                )}

                {step === 9 && (
                    <ReviewStep
                        requirements={requirements}
                        personal={personal}
                        emergency={emergency}
                        availability={buildAvailability()}
                        hasPassword={Boolean(password)}
                        onSubmit={handleSubmit}
                        onEditStep={(s) => { setError(''); setStep(s); }}
                    />
                )}

                {!isLastStep && (
                    <div className="onboard-actions">
                        {step > 0 && (
                            <button type="button" className="btn btn--outline" onClick={() => { setError(''); setStep(s => s - 1); }}>Back</button>
                        )}
                        <button type="button" className="btn btn--primary" onClick={handleNext} disabled={submitting}>Next</button>
                    </div>
                )}
                {isLastStep && (
                    <div className="onboard-actions">
                        <button type="button" className="btn btn--outline" onClick={() => { setError(''); setStep(s => s - 1); }}>Back</button>
                    </div>
                )}
            </div>
        </div>
    );
}
