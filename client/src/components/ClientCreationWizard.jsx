import { useState, useCallback } from 'react';
import Modal from './common/Modal';
import * as api from '../api';
import { useToast } from '../hooks/useToast';
import { getAccountForCategory, ACCOUNT_NUMBER_OPTIONS } from '../utils/accountMapping';

const EMPTY_AUTH = {
    serviceCategory: '',
    serviceCode: 'PCS',
    serviceName: '',
    accountNumber: '',
    sandataClientId: '',
    authorizationNumber: '',
    authorizedUnits: '',
    startDate: '',
    endDate: '',
    notes: '',
    manualStatus: 'active',
    files: [],
};

function handleDatePaste(setter) {
    return (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setter(parsed);
        }
    };
}

function StepIndicator({ currentStep, onStepClick }) {
    const steps = ['Client Info', 'Authorizations', 'Review'];
    return (
        <div className="wizard-steps">
            {steps.map((label, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;
                const isClickable = stepNum < currentStep;
                let cls = 'wizard-step';
                if (isActive) cls += ' wizard-step--active';
                else if (isCompleted) cls += ' wizard-step--completed';
                else cls += ' wizard-step--disabled';
                return (
                    <span key={stepNum} style={{ display: 'contents' }}>
                        {i > 0 && (
                            <div className={`wizard-step-connector${isCompleted || isActive ? ' wizard-step-connector--completed' : ''}`} />
                        )}
                        <div className={cls} onClick={isClickable ? () => onStepClick(stepNum) : undefined}>
                            <div className="wizard-step__circle">
                                {isCompleted ? '✓' : stepNum}
                            </div>
                            <span className="wizard-step__label">{label}</span>
                        </div>
                    </span>
                );
            })}
        </div>
    );
}

function StepClientInfo({ form, setForm, insuranceTypes, onDatePaste }) {
    return (
        <>
            <div className="form-group">
                <label>Client Name <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Full name" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Medicaid ID</label>
                    <input type="text" value={form.medicaidId} onChange={(e) => setForm({ ...form, medicaidId: e.target.value })} placeholder="e.g. 00002399084" />
                </div>
                <div className="form-group">
                    <label>Insurance Type</label>
                    <select value={form.insuranceType} onChange={(e) => setForm({ ...form, insuranceType: e.target.value })}>
                        {insuranceTypes.length > 0 ? insuranceTypes.map(t => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                        )) : <option value="MEDICAID">MEDICAID</option>}
                    </select>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Phone</label>
                    <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
                </div>
                <div className="form-group">
                    <label>Date of Birth</label>
                    <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} onPaste={onDatePaste('dob')} />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Gender</label>
                    <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                        <option value="">— Select —</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Address</label>
                    <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Doctor Name</label>
                    <input type="text" value={form.doctorName} onChange={(e) => setForm({ ...form, doctorName: e.target.value })} placeholder="Optional" />
                </div>
                <div className="form-group">
                    <label>Doctor Phone</label>
                    <input type="text" value={form.doctorPhone} onChange={(e) => setForm({ ...form, doctorPhone: e.target.value })} placeholder="Optional" />
                </div>
            </div>
        </>
    );
}

function AuthCard({ index, auth, onChange, onRemove }) {
    const update = (field, value) => onChange(index, { ...auth, [field]: value });

    const handleServiceCategoryChange = (newCategory) => {
        const updates = { serviceCategory: newCategory };
        const defaultAcc = getAccountForCategory(newCategory);
        if (defaultAcc && (!auth.accountNumber || ACCOUNT_NUMBER_OPTIONS.includes(auth.accountNumber))) {
            updates.accountNumber = defaultAcc;
        }
        onChange(index, { ...auth, ...updates });
    };

    return (
        <div className="wizard-auth-card">
            <div className="wizard-auth-card__header">
                <span className="wizard-auth-card__title">Authorization {index + 1}</span>
                <button type="button" className="wizard-auth-card__remove" onClick={() => onRemove(index)} title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Service Category</label>
                    <input type="text" value={auth.serviceCategory} onChange={(e) => handleServiceCategoryChange(e.target.value)} placeholder="PCS, WAIVER 58…" />
                </div>
                <div className="form-group">
                    <label>Service Code <span style={{ color: '#dc2626' }}>*</span></label>
                    <select value={auth.serviceCode} onChange={(e) => update('serviceCode', e.target.value)}>
                        <optgroup label="EVV Services">
                            <option value="PCS">PCS</option>
                            <option value="SDPC">SDPC</option>
                            <option value="S5120">S5120 — Chore Services</option>
                            <option value="S5125">S5125 — Attendant Care</option>
                            <option value="S5130">S5130 — Homemaker</option>
                            <option value="S5135">S5135 — Companion</option>
                            <option value="S5150">S5150 — Respite</option>
                        </optgroup>
                        <optgroup label="Timesheet Services">
                            <option value="TIMESHEETS">Timesheets (Private)</option>
                            <option value="TIMESHEET_PCS">Timesheets-PCS</option>
                            <option value="TIMESHEET_HOMEMAKER">Timesheets-Homemaker</option>
                            <option value="TIMESHEET_RESPITE">Timesheets-Respite</option>
                            <option value="TIMESHEET_COMPANION">Timesheets-Companion Care</option>
                            <option value="TIMESHEET_CHORE">Timesheets-Chore</option>
                        </optgroup>
                        <optgroup label="Programs">
                            <option value="PAS">PAS</option>
                            <option value="COPE">COPE</option>
                        </optgroup>
                    </select>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Service Name</label>
                    <input type="text" value={auth.serviceName} onChange={(e) => update('serviceName', e.target.value)} placeholder="Personal Care Services" />
                </div>
                <div className="form-group">
                    <label>Account Number</label>
                    <select value={auth.accountNumber} onChange={(e) => update('accountNumber', e.target.value)}>
                        <option value="">— Select —</option>
                        {ACCOUNT_NUMBER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Sandata Client ID</label>
                    <input type="text" value={auth.sandataClientId} onChange={(e) => update('sandataClientId', e.target.value)} placeholder="e.g. 1234567" />
                </div>
                <div className="form-group">
                    <label>Authorization Number</label>
                    <input type="text" value={auth.authorizationNumber} onChange={(e) => update('authorizationNumber', e.target.value)} placeholder="e.g. 45268348457" />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Auth Units <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="number" value={auth.authorizedUnits} onChange={(e) => update('authorizedUnits', e.target.value)} placeholder="0" />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                    <label>Start Date <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="date" value={auth.startDate} onChange={(e) => update('startDate', e.target.value)} onPaste={handleDatePaste((v) => update('startDate', v))} />
                </div>
                <div className="form-group">
                    <label>End Date <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="date" value={auth.endDate} onChange={(e) => update('endDate', e.target.value)} onPaste={handleDatePaste((v) => update('endDate', v))} />
                </div>
            </div>
            <div className="form-group">
                <label>Notes</label>
                <input type="text" value={auth.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional notes…" />
            </div>
            <div className="form-group">
                <label>Status</label>
                <div className="auth-status-cards">
                    <label className={`auth-status-card ${auth.manualStatus === 'active' ? 'auth-status-card--active' : ''}`}>
                        <input type="radio" name={`authStatus-${index}`} value="active" checked={auth.manualStatus === 'active'} onChange={() => update('manualStatus', 'active')} />
                        <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                        <span className="auth-status-card__label">Active</span>
                    </label>
                    <label className={`auth-status-card ${auth.manualStatus === 'inactive' ? 'auth-status-card--inactive' : ''}`}>
                        <input type="radio" name={`authStatus-${index}`} value="inactive" checked={auth.manualStatus === 'inactive'} onChange={() => update('manualStatus', 'inactive')} />
                        <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                        <span className="auth-status-card__label">Inactive</span>
                    </label>
                    <label className={`auth-status-card ${auth.manualStatus === 'expired' ? 'auth-status-card--expired' : ''}`}>
                        <input type="radio" name={`authStatus-${index}`} value="expired" checked={auth.manualStatus === 'expired'} onChange={() => update('manualStatus', 'expired')} />
                        <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                        <span className="auth-status-card__label" style={{ color: '#dc2626' }}>Expired</span>
                    </label>
                </div>
            </div>
            <div className="form-group">
                <label>Upload PA / Care Plan Documents</label>
                <input
                    type="file"
                    multiple
                    onChange={(e) => update('files', Array.from(e.target.files))}
                    style={{ fontSize: 13 }}
                />
                {auth.files.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                        {auth.files.length} file{auth.files.length !== 1 ? 's' : ''} selected
                    </div>
                )}
            </div>
        </div>
    );
}

function StepAuthorizations({ authorizations, setAuthorizations }) {
    const handleChange = (index, updated) => {
        setAuthorizations(prev => prev.map((a, i) => i === index ? updated : a));
    };
    const handleRemove = (index) => {
        setAuthorizations(prev => prev.filter((_, i) => i !== index));
    };
    const handleAdd = () => {
        setAuthorizations(prev => [...prev, { ...EMPTY_AUTH, files: [] }]);
    };

    return (
        <>
            {authorizations.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                    No authorizations added yet. Click below to add one, or skip this step.
                </div>
            )}
            {authorizations.map((auth, i) => (
                <AuthCard key={i} index={i} auth={auth} onChange={handleChange} onRemove={handleRemove} />
            ))}
            <button type="button" className="btn btn--outline" onClick={handleAdd} style={{ width: '100%' }}>
                + Add Authorization
            </button>
        </>
    );
}

function StepReview({ form, authorizations }) {
    const insName = form.insuranceType || '—';
    return (
        <>
            <div className="wizard-review-section">
                <div className="wizard-review-section__title">Client Information</div>
                <div className="wizard-review-grid">
                    <div className="wizard-review-item">
                        <div className="wizard-review-item__label">Name</div>
                        <div className="wizard-review-item__value">{form.clientName}</div>
                    </div>
                    {form.medicaidId && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Medicaid ID</div>
                            <div className="wizard-review-item__value">{form.medicaidId}</div>
                        </div>
                    )}
                    <div className="wizard-review-item">
                        <div className="wizard-review-item__label">Insurance Type</div>
                        <div className="wizard-review-item__value">{insName}</div>
                    </div>
                    {form.phone && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Phone</div>
                            <div className="wizard-review-item__value">{form.phone}</div>
                        </div>
                    )}
                    {form.dob && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Date of Birth</div>
                            <div className="wizard-review-item__value">{form.dob}</div>
                        </div>
                    )}
                    {form.gender && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Gender</div>
                            <div className="wizard-review-item__value">{form.gender}</div>
                        </div>
                    )}
                    {form.address && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Address</div>
                            <div className="wizard-review-item__value">{form.address}</div>
                        </div>
                    )}
                    {form.doctorName && (
                        <div className="wizard-review-item">
                            <div className="wizard-review-item__label">Doctor</div>
                            <div className="wizard-review-item__value">{form.doctorName}{form.doctorPhone ? ` (${form.doctorPhone})` : ''}</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="wizard-review-section">
                <div className="wizard-review-section__title">Authorizations ({authorizations.length})</div>
                {authorizations.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                        No authorizations added — you can add these later from the Authorizations section.
                    </div>
                ) : (
                    authorizations.map((auth, i) => (
                        <div key={i} className="wizard-auth-card" style={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{auth.serviceCode}</span>
                                <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                    {auth.authorizedUnits} units
                                </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                                {auth.startDate} → {auth.endDate}
                                {auth.manualStatus !== 'active' && ` • ${auth.manualStatus}`}
                                {auth.files.length > 0 && ` • ${auth.files.length} document${auth.files.length !== 1 ? 's' : ''}`}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

export default function ClientCreationWizard({ onClose, onCreated, insuranceTypes }) {
    const { showToast } = useToast();
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '',
        dob: '', gender: '', doctorName: '', doctorPhone: '',
    });
    const [authorizations, setAuthorizations] = useState([]);

    const onDatePaste = useCallback((field) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        }
        if (!parsed) {
            m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
            if (m) {
                const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                if (!isNaN(d)) parsed = d.toISOString().split('T')[0];
            }
        }
        if (parsed && !isNaN(new Date(parsed + 'T00:00:00'))) {
            e.preventDefault();
            setForm(prev => ({ ...prev, [field]: parsed }));
        }
    }, []);

    const validateStep1 = () => {
        if (!form.clientName.trim()) {
            showToast('Client name is required', 'error');
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        for (let i = 0; i < authorizations.length; i++) {
            const a = authorizations[i];
            if (!a.serviceCode) {
                showToast(`Authorization ${i + 1}: Service code is required`, 'error');
                return false;
            }
            if (!a.authorizedUnits || parseInt(a.authorizedUnits) <= 0) {
                showToast(`Authorization ${i + 1}: Units must be greater than 0`, 'error');
                return false;
            }
            if (!a.startDate) {
                showToast(`Authorization ${i + 1}: Start date is required`, 'error');
                return false;
            }
            if (!a.endDate) {
                showToast(`Authorization ${i + 1}: End date is required`, 'error');
                return false;
            }
        }
        return true;
    };

    const handleNext = () => {
        if (step === 1 && !validateStep1()) return;
        if (step === 2 && !validateStep2()) return;
        setStep(s => s + 1);
    };

    const handleBack = () => setStep(s => s - 1);

    const handleStepClick = (targetStep) => {
        if (targetStep < step) setStep(targetStep);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const client = await api.createClient(form.clientName, {
                medicaidId: form.medicaidId,
                insuranceType: form.insuranceType,
                address: form.address,
                phone: form.phone,
                gender: form.gender,
                dob: form.dob || null,
                doctorName: form.doctorName,
                doctorPhone: form.doctorPhone,
            });

            let authErrors = 0;
            for (const auth of authorizations) {
                try {
                    const created = await api.createAuthorization(client.id, {
                        serviceCategory: auth.serviceCategory,
                        serviceCode: auth.serviceCode,
                        serviceName: auth.serviceName,
                        authorizationNumber: auth.authorizationNumber,
                        accountNumber: auth.accountNumber,
                        sandataClientId: auth.sandataClientId,
                        authorizedUnits: parseInt(auth.authorizedUnits) || 0,
                        authorizationStartDate: auth.startDate || null,
                        authorizationEndDate: auth.endDate || null,
                        notes: auth.notes,
                        manualStatus: auth.manualStatus,
                    });

                    if (auth.files.length > 0) {
                        for (const file of auth.files) {
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('notes', '');
                            try {
                                await api.uploadAuthDocument(created.id, fd);
                            } catch (fileErr) {
                                showToast(`Failed to upload "${file.name}": ${fileErr.message}`, 'error');
                            }
                        }
                    }
                } catch (authErr) {
                    authErrors++;
                    showToast(`Failed to create authorization: ${authErr.message}`, 'error');
                }
            }

            if (authErrors > 0 && authorizations.length > 0) {
                showToast(`Client created with ${authErrors} authorization error(s). Check the client detail page.`, 'error');
            } else {
                showToast('Client created successfully');
            }

            onCreated(client);
        } catch (err) {
            showToast(`Failed to create client: ${err.message}`, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">New Client</h2>
            <StepIndicator currentStep={step} onStepClick={handleStepClick} />

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                {step === 1 && (
                    <StepClientInfo form={form} setForm={setForm} insuranceTypes={insuranceTypes} onDatePaste={onDatePaste} />
                )}
                {step === 2 && (
                    <StepAuthorizations authorizations={authorizations} setAuthorizations={setAuthorizations} />
                )}
                {step === 3 && (
                    <StepReview form={form} authorizations={authorizations} />
                )}
            </div>

            <div className="wizard-nav">
                <div>
                    {step > 1 && (
                        <button type="button" className="btn btn--outline" onClick={handleBack}>Back</button>
                    )}
                </div>
                <div className="wizard-nav__right">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    {step < 3 ? (
                        <button type="button" className="btn btn--primary" onClick={handleNext}>Next</button>
                    ) : (
                        <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Creating...' : 'Create Client'}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
