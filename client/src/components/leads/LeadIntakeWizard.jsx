import { useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';
import * as api from '../../api';
import Icons from '../common/Icons';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { LEAD_STATUSES, LEAD_CASE_TYPES, computeDeposit, computeWeekly } from '../../utils/leadConstants';
import LeadAttachmentList from './LeadAttachmentList';

const SERVICE_OPTIONS = [
    'B/D/G', 'Toileting', 'Diaper Change', 'Transfer Assistance', 'Mobility',
    'Eating', 'Meal Preparation', 'Light Housekeeping', 'Grocery Shopping', 'Laundry',
    'Companionship', 'Transportation / Private Clients Only', 'Medication Reminders', 'Other',
];
const SHIFT_OPTIONS = ['Morning shift', 'Afternoon shift', 'Evening shift'];
const AUTH_STATUS_OPTIONS = ['Not started', 'Application in process', 'Auth received'];
const GENDER_PREF_OPTIONS = ['No preference', 'Male', 'Female'];
const AGE_PREF_OPTIONS = ['No preference', 'Younger (20s-30s)', 'Middle-aged (40s-50s)', 'Older / more experienced'];
const LANGUAGE_OPTIONS = ['English', 'Spanish', 'French', 'Creole', 'Other'];
const RELATION_OPTIONS = ['Spouse', 'Son/Daughter', 'Parent', 'Sibling', 'Other'];
const DAYS_PER_WEEK_OPTIONS = ['1-2 days', '3-4', '5 days (M-F)', '6-7 days', 'Flexible'];
const START_DATE_OPTIONS = ['ASAP', 'Within 1 week', 'Within 2 weeks', 'Next month'];
// Channel the lead came in through (value stored on Lead.leadSource).
const LEAD_SOURCE_OPTIONS = [
    { value: 'referrer', label: 'Referrer' },
    { value: 'call',     label: 'Call' },
    { value: 'website',  label: 'Website' },
    { value: 'fax',      label: 'Fax' },
    { value: 'other',    label: 'Other' },
];

const STEP_LABELS = ['Basic Info', 'Service Needs', 'Case Type', 'Preferences', 'Status'];

const EMPTY = {
    createdBy: '',
    firstName: '', lastName: '', phone: '', alternatePhone: '', address: '', dob: '', gender: '',
    medicaidId: '', insuranceNumber: '', insuranceType: '',
    leadSource: '', otherLeadSource: '', referralSource: '', doctorName: '', doctorPhone: '', caseworkerName: '', caseworkerPhone: '',
    emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '', emergencyContactEmail: '', callNotes: '',
    servicesRequested: [], otherService: '', daysPerWeek: '', hoursPerDay: '', startDateNeeded: '',
    caseType: 'initial', authStatus: '', expectedStartDate: '', currentAgencyName: '', currentAuthHoursMonth: 0, authNumber: '', transferReason: '', transferNotes: '',
    ppRate: 0, ppHoursPerWeek: 0, ppDepositHours: 0,
    genderPreference: 'No preference', agePreference: 'No preference', shiftPreferences: ['Morning shift'], languagePreference: 'English', otherLanguage: '', scheduleNotes: '',
    status: 'new', assignedTo: '', followUpDate: '',
};

function safeArr(v) {
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v || '[]'); } catch { return []; }
}

function hydrate(lead) {
    if (!lead) return EMPTY;
    const rawServices = safeArr(lead.servicesRequested);
    const otherEntry = rawServices.find((s) => typeof s === 'string' && s.startsWith('Other:'));
    const services = rawServices.map((s) => (s === otherEntry ? 'Other' : s));
    const otherService = otherEntry ? otherEntry.slice('Other:'.length).trim() : '';
    const storedLang = lead.languagePreference || 'English';
    const isCustomLang = storedLang && !LANGUAGE_OPTIONS.includes(storedLang);
    // Lead source: if the stored value isn't one of the known channel keys,
    // treat it as a custom "Other" entry and surface the text in the input.
    const storedSource = lead.leadSource || '';
    const isCustomSource = storedSource && !LEAD_SOURCE_OPTIONS.some((o) => o.value === storedSource);
    return {
        ...EMPTY,
        ...lead,
        servicesRequested: services,
        otherService,
        shiftPreferences: safeArr(lead.shiftPreferences).length ? safeArr(lead.shiftPreferences) : ['Morning shift'],
        languagePreference: isCustomLang ? 'Other' : storedLang,
        otherLanguage: isCustomLang ? storedLang : '',
        leadSource: isCustomSource ? 'other' : storedSource,
        otherLeadSource: isCustomSource ? storedSource : '',
        dob: lead.dob ? lead.dob.slice(0, 10) : '',
        expectedStartDate: lead.expectedStartDate ? lead.expectedStartDate.slice(0, 10) : '',
        followUpDate: lead.followUpDate ? lead.followUpDate.slice(0, 10) : '',
    };
}

function StepBar({ step }) {
    return (
        <div className="lead-wizard-steps" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            {STEP_LABELS.map((label, i) => {
                const n = i + 1;
                const isActive = n === step;
                const isDone = n < step;
                return (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEP_LABELS.length - 1 ? 1 : 'initial' }}>
                        <span className={`step-dot${isActive ? ' step-dot--active' : ''}${isDone ? ' step-dot--done' : ''}`}>
                            {isDone ? Icons.check : n}
                        </span>
                        <span className="step-label" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>
                        {i < STEP_LABELS.length - 1 && <span className="step-connector" style={{ flex: 1, height: 1, background: 'hsl(var(--border))' }} />}
                    </span>
                );
            })}
        </div>
    );
}

/* ── Colored card block that wraps a group of fields ── */
function FormCard({ title, children }) {
    return (
        <div className="lead-form-card">
            <div className="lead-form-card__header">{title}</div>
            <div className="lead-form-card__body">{children}</div>
        </div>
    );
}

const ATTACH_ACCEPT = 'image/*,application/pdf,.doc,.docx';

// Attachments card — staged files on a new lead, live upload/delete on an edit.
function AttachmentsCard({ isEdit, pendingFiles, existingDocs, busy, onAdd, onRemovePending, onRemoveExisting }) {
    const inputRef = useRef(null);
    return (
        <FormCard title="Attachments">
            <div className="fld" style={{ marginBottom: 0 }}>
                <label>Documents &amp; Images</label>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ATTACH_ACCEPT}
                    style={{ display: 'none' }}
                    onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }}
                />
                <div className="lead-attach">
                    <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => inputRef.current?.click()}
                        disabled={busy}
                    >
                        {Icons.paperclip} Add files
                    </button>
                    <span className="lead-attach__hint">Images, PDF, or Word docs · up to 20 MB each</span>
                </div>

                <LeadAttachmentList
                    docs={existingDocs}
                    pending={pendingFiles}
                    busy={busy}
                    onRemoveExisting={onRemoveExisting}
                    onRemovePending={onRemovePending}
                />

                {!isEdit && pendingFiles.length > 0 && (
                    <span className="lead-attach__note">These upload automatically when you save the referral.</span>
                )}
            </div>
        </FormCard>
    );
}

function Step1Basic({ form, set, insuranceOptions, users }) {
    const isEdit = !!form.id;
    // Preserve a current/legacy value (e.g. logged-in user) that isn't in the users list.
    const knownStaff = users.some((u) => u.name === form.createdBy);
    return (
        <>
            {/* Staff attribution — auto-filled with the current user; still editable on new referrals. */}
            <FormCard title="Staff Member Entering Lead">
                <div className="fld" style={{ marginBottom: 0 }}>
                    <label>
                        Staff Member / Created By <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                        className="finput"
                        value={form.createdBy}
                        onChange={(e) => set('createdBy', e.target.value)}
                        disabled={isEdit}
                    >
                        <option value="">— Select staff member —</option>
                        {form.createdBy && !knownStaff && (
                            <option value={form.createdBy}>{form.createdBy}</option>
                        )}
                        {users.map((u) => (
                            <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                    </select>
                    {isEdit ? (
                        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            Recorded at intake — cannot be changed
                        </span>
                    ) : (
                        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            Defaults to you — change it if someone else is entering this lead.
                        </span>
                    )}
                </div>
            </FormCard>

            <FormCard title="Basic Information">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>First Name <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="finput" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
                    </div>
                    <div className="fld">
                        <label>Last Name <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="finput" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Phone</label>
                        <input className="finput" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Alternate Phone</label>
                        <input className="finput" value={form.alternatePhone} onChange={(e) => set('alternatePhone', e.target.value)} />
                    </div>
                </div>
                <div className="fld">
                    <label>Address</label>
                    <input className="finput" value={form.address} onChange={(e) => set('address', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Date of Birth</label>
                        <input className="finput" type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Gender</label>
                        <select className="finput" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                            <option value="">— Select —</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Medicaid ID</label>
                        <input className="finput" value={form.medicaidId} onChange={(e) => set('medicaidId', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Insurance Number</label>
                        <input className="finput" value={form.insuranceNumber} onChange={(e) => set('insuranceNumber', e.target.value)} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Insurance Type</label>
                        <select className="finput" value={form.insuranceType} onChange={(e) => set('insuranceType', e.target.value)}>
                            <option value="">— Select —</option>
                            {insuranceOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div className="fld">
                        <label>Referral Source</label>
                        <input className="finput" value={form.referralSource} onChange={(e) => set('referralSource', e.target.value)} placeholder="e.g. Hospital discharge planner" />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld" style={{ marginBottom: 0 }}>
                        <label>Lead Source</label>
                        <select className="finput" value={form.leadSource} onChange={(e) => set('leadSource', e.target.value)}>
                            <option value="">— Select —</option>
                            {LEAD_SOURCE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        {form.leadSource === 'other' && (
                            <input
                                className="finput"
                                style={{ marginTop: 8 }}
                                value={form.otherLeadSource}
                                onChange={(e) => set('otherLeadSource', e.target.value)}
                                placeholder="Please specify the source"
                            />
                        )}
                        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            How did this lead reach us?
                        </span>
                    </div>
                </div>
            </FormCard>

            <FormCard title="Doctor / Caseworker">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Doctor Name</label>
                        <input className="finput" value={form.doctorName} onChange={(e) => set('doctorName', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Doctor Phone</label>
                        <input className="finput" value={form.doctorPhone} onChange={(e) => set('doctorPhone', e.target.value)} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Caseworker Name</label>
                        <input className="finput" value={form.caseworkerName} onChange={(e) => set('caseworkerName', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Caseworker Phone</label>
                        <input className="finput" value={form.caseworkerPhone} onChange={(e) => set('caseworkerPhone', e.target.value)} />
                    </div>
                </div>
            </FormCard>

            <FormCard title="Emergency Contact">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Name</label>
                        <input className="finput" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Relation</label>
                        <select className="finput" value={form.emergencyContactRelation} onChange={(e) => set('emergencyContactRelation', e.target.value)}>
                            <option value="">— Select —</option>
                            {RELATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Phone</label>
                        <input className="finput" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
                    </div>
                    <div className="fld">
                        <label>Email</label>
                        <input className="finput" type="email" value={form.emergencyContactEmail} onChange={(e) => set('emergencyContactEmail', e.target.value)} />
                    </div>
                </div>
            </FormCard>

            <FormCard title="Call Notes">
                <div className="fld" style={{ marginBottom: 0 }}>
                    <label>Notes from the intake call</label>
                    <textarea className="finput" rows={4} value={form.callNotes} onChange={(e) => set('callNotes', e.target.value)} placeholder="Notes from the intake call…" />
                </div>
            </FormCard>
        </>
    );
}

function Step2Services({ form, set, toggleArr }) {
    return (
        <>
            <FormCard title="Services Requested">
                <div className="fld">
                    <label>Select all that apply</label>
                    <div className="chk-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {SERVICE_OPTIONS.map((opt) => (
                            <label key={opt} className="chk-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={form.servicesRequested.includes(opt)}
                                    onChange={() => toggleArr('servicesRequested', opt)}
                                />
                                <span>{opt}</span>
                            </label>
                        ))}
                    </div>
                    {form.servicesRequested.includes('Other') && (
                        <input
                            className="finput"
                            style={{ marginTop: 8 }}
                            value={form.otherService}
                            onChange={(e) => set('otherService', e.target.value)}
                            placeholder="Please specify other service"
                        />
                    )}
                </div>
            </FormCard>

            <FormCard title="Schedule Details">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Days per Week</label>
                        <select className="finput" value={form.daysPerWeek} onChange={(e) => set('daysPerWeek', e.target.value)}>
                            <option value="">— Select —</option>
                            {DAYS_PER_WEEK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div className="fld">
                        <label>Hours per Day</label>
                        <input className="finput" value={form.hoursPerDay} onChange={(e) => set('hoursPerDay', e.target.value)} placeholder="e.g. 8" />
                    </div>
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                    <label>Start Date Needed</label>
                    <select className="finput" value={form.startDateNeeded} onChange={(e) => set('startDateNeeded', e.target.value)}>
                        <option value="">— Select —</option>
                        {START_DATE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </FormCard>
        </>
    );
}

function Step3CaseType({ form, set }) {
    const deposit = computeDeposit({ rate: form.ppRate, depositHours: form.ppDepositHours });
    const weekly = computeWeekly({ rate: form.ppRate, hoursPerWeek: form.ppHoursPerWeek });

    return (
        <>
            <FormCard title="Case Type">
                <div className="ctype-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 0 }}>
                    {Object.entries(LEAD_CASE_TYPES).map(([key, meta]) => (
                        <div
                            key={key}
                            className={`ctype-card${form.caseType === key ? ' ctype-card--selected' : ''}`}
                            onClick={() => set('caseType', key)}
                            style={{ cursor: 'pointer', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 12, textAlign: 'center' }}
                        >
                            <input
                                type="radio"
                                name="caseType"
                                value={key}
                                checked={form.caseType === key}
                                onChange={() => set('caseType', key)}
                            />
                            <div className="ctype-card__label">{meta.label}</div>
                        </div>
                    ))}
                </div>
            </FormCard>

            {form.caseType === 'initial' && (
                <FormCard title="Initial Case Details">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="fld">
                            <label>Auth Status</label>
                            <select className="finput" value={form.authStatus} onChange={(e) => set('authStatus', e.target.value)}>
                                <option value="">Select...</option>
                                {AUTH_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <div className="fld" style={{ marginBottom: 0 }}>
                            <label>Expected Start Date</label>
                            <input className="finput" type="date" value={form.expectedStartDate} onChange={(e) => set('expectedStartDate', e.target.value)} />
                        </div>
                    </div>
                </FormCard>
            )}

            {form.caseType === 'transfer' && (
                <FormCard title="Transfer Details">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="fld">
                            <label>Current Agency Name</label>
                            <input className="finput" value={form.currentAgencyName} onChange={(e) => set('currentAgencyName', e.target.value)} />
                        </div>
                        <div className="fld">
                            <label>Current Auth Hours / Month</label>
                            <input className="finput" type="number" value={form.currentAuthHoursMonth} onChange={(e) => set('currentAuthHoursMonth', e.target.value)} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="fld">
                            <label>Auth Number</label>
                            <input className="finput" value={form.authNumber} onChange={(e) => set('authNumber', e.target.value)} />
                        </div>
                        <div className="fld">
                            <label>Transfer Reason</label>
                            <input className="finput" value={form.transferReason} onChange={(e) => set('transferReason', e.target.value)} />
                        </div>
                    </div>
                    <div className="fld" style={{ marginBottom: 0 }}>
                        <label>Transfer Notes</label>
                        <textarea className="finput" rows={3} value={form.transferNotes} onChange={(e) => set('transferNotes', e.target.value)} />
                    </div>
                </FormCard>
            )}

            {form.caseType === 'private' && (
                <FormCard title="Private Pay Details">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div className="fld">
                            <label>Rate ($/hr)</label>
                            <input className="finput" type="number" value={form.ppRate} onChange={(e) => set('ppRate', e.target.value)} />
                        </div>
                        <div className="fld">
                            <label>Hours per Week</label>
                            <input className="finput" type="number" value={form.ppHoursPerWeek} onChange={(e) => set('ppHoursPerWeek', e.target.value)} />
                        </div>
                        <div className="fld" style={{ marginBottom: 0 }}>
                            <label>Deposit Hours</label>
                            <input className="finput" type="number" value={form.ppDepositHours} onChange={(e) => set('ppDepositHours', e.target.value)} />
                        </div>
                    </div>
                    <div className="dep-box" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 12, marginTop: 8 }}>
                        <div className="dep-box__row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Deposit Due</span>
                            <strong>${deposit.toFixed(2)}</strong>
                        </div>
                        <div className="dep-box__row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Estimated Weekly Charge</span>
                            <strong>${weekly.toFixed(2)}</strong>
                        </div>
                    </div>
                </FormCard>
            )}
        </>
    );
}

function Step4Preferences({ form, set, toggleArr }) {
    return (
        <>
            <FormCard title="Caregiver Preferences">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Gender Preference</label>
                        <select className="finput" value={form.genderPreference} onChange={(e) => set('genderPreference', e.target.value)}>
                            {GENDER_PREF_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div className="fld" style={{ marginBottom: 0 }}>
                        <label>Age Preference</label>
                        <select className="finput" value={form.agePreference} onChange={(e) => set('agePreference', e.target.value)}>
                            {AGE_PREF_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                </div>

                <div className="fld">
                    <label>Shift Preferences</label>
                    <div className="pref-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {SHIFT_OPTIONS.map((opt) => (
                            <button
                                type="button"
                                key={opt}
                                className={`pref-chip${form.shiftPreferences.includes(opt) ? ' pref-chip--selected' : ''}`}
                                onClick={() => toggleArr('shiftPreferences', opt)}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="fld" style={{ marginBottom: 0 }}>
                    <label>Language Preference</label>
                    <select className="finput" value={form.languagePreference} onChange={(e) => set('languagePreference', e.target.value)}>
                        {LANGUAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {form.languagePreference === 'Other' && (
                        <input
                            className="finput"
                            style={{ marginTop: 8 }}
                            value={form.otherLanguage}
                            onChange={(e) => set('otherLanguage', e.target.value)}
                            placeholder="Please specify other language"
                        />
                    )}
                </div>
            </FormCard>

            <FormCard title="Schedule Notes">
                <div className="fld" style={{ marginBottom: 0 }}>
                    <label>Additional scheduling notes</label>
                    <textarea className="finput" rows={4} value={form.scheduleNotes} onChange={(e) => set('scheduleNotes', e.target.value)} />
                </div>
            </FormCard>
        </>
    );
}

function Step5Status({ form, set, users }) {
    const knownName = users.some((u) => u.name === form.assignedTo);
    return (
        <>
            <FormCard title="Lead Status">
                <div className="fld" style={{ marginBottom: 0 }}>
                    <div className="status-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {LEAD_STATUSES.map((s) => (
                            <label
                                key={s.id}
                                className={`status-item${form.status === s.id ? ' status-item--selected' : ''}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 10, cursor: 'pointer' }}
                            >
                                <input type="radio" name="status" value={s.id} checked={form.status === s.id} onChange={() => set('status', s.id)} />
                                <span className="status-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                                <span style={{ display: 'flex', flexDirection: 'column' }}>
                                    <strong>{s.label}</strong>
                                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{s.hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            </FormCard>

            <FormCard title="Routing">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fld">
                        <label>Assigned To</label>
                        <select className="finput" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                            <option value="">Unassigned</option>
                            {form.assignedTo && !knownName && <option value={form.assignedTo}>{form.assignedTo}</option>}
                            {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>
                    <div className="fld" style={{ marginBottom: 0 }}>
                        <label>Follow-up Date</label>
                        <input className="finput" type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} />
                    </div>
                </div>
            </FormCard>
        </>
    );
}

export default function LeadIntakeWizard({ open = true, initialLead, onClose, onSave }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(() => hydrate(initialLead));
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [users, setUsers] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [step1Error, setStep1Error] = useState('');
    // Attachments staged on a NEW lead (uploaded after the lead is created).
    const [pendingFiles, setPendingFiles] = useState([]);
    // Attachments already saved on an EXISTING lead (edit mode).
    const [existingDocs, setExistingDocs] = useState([]);
    const [docBusy, setDocBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setStep(1);
            const hydrated = hydrate(initialLead);
            // New referral: default the "entered by" staff name to the logged-in user.
            if (!initialLead && !hydrated.createdBy && user?.name) {
                hydrated.createdBy = user.name;
            }
            setForm(hydrated);
            setStep1Error('');
            setPendingFiles([]);
            setExistingDocs([]);
            // Edit mode: load any attachments already on this lead.
            if (initialLead?.id) {
                api.listLeadDocuments(initialLead.id).then(setExistingDocs).catch(() => setExistingDocs([]));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialLead, user]);

    useEffect(() => {
        if (!open) return;
        api.getInsuranceTypes().then(setInsuranceTypes).catch(() => setInsuranceTypes([]));
        api.getUsers()
            .then((data) => setUsers(Array.isArray(data) ? data : data.users || []))
            .catch(() => setUsers([]));
    }, [open]);

    if (!open) return null;

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

    const isEdit = !!form.id;

    // Add picked files: in edit mode upload immediately; otherwise stage them.
    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        if (isEdit) {
            setDocBusy(true);
            try {
                for (const file of files) {
                    const doc = await api.uploadLeadDocument(form.id, file);
                    setExistingDocs((d) => [doc, ...d]);
                }
            } catch (err) {
                showToast(err.message || 'Upload failed', 'error');
            } finally {
                setDocBusy(false);
            }
        } else {
            setPendingFiles((p) => [...p, ...files]);
        }
    }
    const removePending = (idx) => setPendingFiles((p) => p.filter((_, i) => i !== idx));
    async function removeExisting(id) {
        setDocBusy(true);
        try {
            await api.deleteLeadDocument(id);
            setExistingDocs((d) => d.filter((x) => x.id !== id));
        } catch (err) {
            showToast(err.message || 'Delete failed', 'error');
        } finally {
            setDocBusy(false);
        }
    }

    const insuranceOptions = [
        // Drop any DB "Private Pay" row so it isn't duplicated by the appended option below.
        ...insuranceTypes.map((t) => t.name).filter((n) => n.trim().toLowerCase() !== 'private pay'),
        'Private Pay (no insurance)',
    ];

    async function submit() {
        setSubmitting(true);
        try {
            const { otherService, otherLanguage, otherLeadSource, ...rest } = form;
            const services = form.servicesRequested.map((s) =>
                s === 'Other' && otherService.trim() ? `Other: ${otherService.trim()}` : s
            );
            const languagePreference =
                form.languagePreference === 'Other' && otherLanguage.trim()
                    ? otherLanguage.trim()
                    : form.languagePreference;
            // When "Other" is picked, persist the typed value as the lead source.
            const leadSource =
                form.leadSource === 'other' && otherLeadSource.trim()
                    ? otherLeadSource.trim()
                    : form.leadSource;
            const saved = await onSave({
                ...rest,
                languagePreference,
                leadSource,
                currentAuthHoursMonth: Number(form.currentAuthHoursMonth) || 0,
                ppRate: Number(form.ppRate) || 0,
                ppHoursPerWeek: Number(form.ppHoursPerWeek) || 0,
                ppDepositHours: Number(form.ppDepositHours) || 0,
                servicesRequested: JSON.stringify(services),
                shiftPreferences: JSON.stringify(form.shiftPreferences),
            });
            // Upload any files staged for a brand-new lead now that it exists.
            const newLeadId = saved?.id;
            if (newLeadId && pendingFiles.length) {
                let failed = 0;
                for (const file of pendingFiles) {
                    try { await api.uploadLeadDocument(newLeadId, file); }
                    catch { failed += 1; }
                }
                if (failed) showToast(`${failed} attachment${failed > 1 ? 's' : ''} failed to upload`, 'error');
            }
        } catch {
            // onSave surfaces its own error toast; keep the wizard open on failure.
        } finally {
            setSubmitting(false);
        }
    }

    function handleNext() {
        if (step === 1 && !form.id && !form.createdBy) {
            setStep1Error('Please select the staff member entering this lead.');
            return;
        }
        setStep1Error('');
        setStep((s) => Math.min(5, s + 1));
    }
    const handleBack = () => setStep((s) => Math.max(1, s - 1));

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{initialLead ? 'Edit Referral' : 'New Referral'}</h2>
            <StepBar step={step} />

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4, paddingBottom: 4 }}>
                {step === 1 && (
                    <>
                        <Step1Basic form={form} set={set} insuranceOptions={insuranceOptions} users={users} />
                        <AttachmentsCard
                            isEdit={isEdit}
                            pendingFiles={pendingFiles}
                            existingDocs={existingDocs}
                            busy={docBusy}
                            onAdd={addFiles}
                            onRemovePending={removePending}
                            onRemoveExisting={removeExisting}
                        />
                    </>
                )}
                {step === 2 && <Step2Services form={form} set={set} toggleArr={toggleArr} />}
                {step === 3 && <Step3CaseType form={form} set={set} />}
                {step === 4 && <Step4Preferences form={form} set={set} toggleArr={toggleArr} />}
                {step === 5 && <Step5Status form={form} set={set} users={users} />}
            </div>

            {step1Error && (
                <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                    {step1Error}
                </div>
            )}

            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <div>
                    {step > 1 && (
                        <button type="button" className="btn btn--outline" onClick={handleBack}>Back</button>
                    )}
                </div>
                <div className="wizard-nav__right" style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    {step < 5 ? (
                        <button type="button" className="btn btn--primary" onClick={handleNext}>Next</button>
                    ) : (
                        <button type="button" className="btn btn--primary" onClick={submit} disabled={submitting}>
                            {submitting ? 'Saving…' : 'Save Referral'}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
