import { useState } from 'react';
import Modal from './Modal';
import AutocompleteInput from './AutocompleteInput';
import { useServices } from '../../hooks/useServices';
import { ServiceCodeSelect, SERVICE_CATEGORIES, SERVICE_NAME_SUGGESTIONS } from '../../utils/serviceCodes';
import { SERVICE_CODE_NAMES } from '../../utils/constants';
import { getAccountForCategory, getAccountForServiceCode, ACCOUNT_NUMBER_OPTIONS } from '../../utils/accountMapping';

// Local mirror of the day-before-start computation used for the renewal
// close-preview banner (the previous authorization auto-closes the day
// before the new one starts).
function fmtDayBefore(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-US');
}

/**
 * Shared Add / Edit / Renew Authorization form.
 *
 * Single source of the authorization form used across AuthorizationsPage,
 * ClientsPage, and ClientDetailPage. Supports both Weekly Units (Medicaid,
 * Waiver, PAS, Homemaker, Respite, Companion) and Annual Visits (GUIDE)
 * authorization types.
 *
 * Props:
 *  - auth: existing authorization to edit/renew (null/undefined for create)
 *  - clientId: client the auth belongs to (for renewal payloads)
 *  - onSave(data): called with the form payload on submit
 *  - onClose(): close the modal
 *  - onRenewal(payload): optional — called when Status = Renewal on an edit (not correcting in place)
 *  - onInactivate({ id, authorizationEndDate, inactiveReason, inactiveNote }): optional —
 *      called when Status = Inactive on an edit
 *  - isRenewal: optional — render as a "Renew Authorization" flow
 *  - showStatus: default true — on an existing auth, shows the Renewal/Inactive status
 *      toggle (no manual "Active" option — editing always defaults to Renewal). A
 *      brand-new auth never shows status cards (plain create flow).
 *  - showUpload: default true — show the PA / Care Plan file upload field
 */
export default function AuthorizationFormModal({
    auth,
    clientId,
    onSave,
    onClose,
    onRenewal,
    onInactivate,
    isRenewal = false,
    showStatus = true,
    showUpload = true,
}) {
    const { serviceOptions } = useServices();
    const [serviceCategory, setServiceCategory] = useState(auth?.serviceCategory || '');
    const [serviceCode, setServiceCode] = useState(auth?.serviceCode || 'PCS');
    const [serviceName, setServiceName] = useState(auth?.serviceName || '');
    const [authorizedUnits, setAuthorizedUnits] = useState(auth?.authorizedUnits || '');
    const [authorizationNumber, setAuthorizationNumber] = useState(auth?.authorizationNumber || '');
    const [accountNumber, setAccountNumber] = useState(auth?.accountNumber || getAccountForCategory(auth?.serviceCategory) || '');
    const [sandataClientId, setSandataClientId] = useState(auth?.sandataClientId || '');
    const [startDate, setStartDate] = useState(
        !isRenewal && auth?.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : ''
    );
    const [endDate, setEndDate] = useState(
        !isRenewal && auth?.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : ''
    );
    const [notes, setNotes] = useState(isRenewal ? '' : (auth?.notes || ''));
    // Editing an existing auth opens with NO status chosen — the user must pick
    // Renewal or Inactive, and only then do that flow's fields appear. An
    // explicit /renew flow starts on renewal; a brand-new auth uses 'active'
    // (its create flow doesn't show status cards).
    const [manualStatus, setManualStatus] = useState(
        isRenewal ? 'renewal' : (auth?.id ? '' : 'active')
    );
    const [notePreset, setNotePreset] = useState('Annual Renewal – No Changes');
    const [inactiveEnd, setInactiveEnd] = useState(new Date().toISOString().split('T')[0]);
    const [inactiveReason, setInactiveReason] = useState('Client transferred to another agency');
    const [inactiveNote, setInactiveNote] = useState('');
    const [correctingInPlace, setCorrectingInPlace] = useState(false);
    // Renewal activation: 'scheduled' = keep the current auth in effect until the
    // new start date, then the renewal takes over automatically (dates are the
    // source of truth). 'immediate' = retire the current auth now and make the
    // renewal current today. Defaults to scheduled; only meaningful when the new
    // start date is in the future.
    const [renewalActivation, setRenewalActivation] = useState('scheduled');
    const [files, setFiles] = useState([]);

    // GUIDE annual-visits detail fields
    const [authorizedVisitsPerYear, setAuthorizedVisitsPerYear] = useState(auth?.authorizedVisitsPerYear ?? '');
    const [hoursPerVisit, setHoursPerVisit] = useState(auth?.hoursPerVisit ?? '');

    const isEdit = !!auth?.id;

    // Authorization type is DERIVED from the service category / name — GUIDE clients
    // are tracked as Annual Visits, everyone else as Weekly Units. There is no
    // manual toggle; the type follows whatever category/name the user selects.
    const isGuide = /guide/i.test(serviceCategory || '') || /guide/i.test(serviceName || '');
    const authorizationType = isGuide ? 'Annual Visits' : 'Weekly Units';
    const isAnnual = authorizationType === 'Annual Visits';
    const hoursPerYear = (Number(authorizedVisitsPerYear) || 0) * (Number(hoursPerVisit) || 0);

    // The activation choice only matters when the new start date is in the future.
    // A start of today or earlier is always effectively immediate.
    const todayStr = new Date().toISOString().slice(0, 10);
    const startIsFuture = !!startDate && startDate > todayStr;

    // Parse pasted date text into YYYY-MM-DD for date inputs
    const handleDatePaste = (setter) => (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (!text) return;
        let parsed = null;
        let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) parsed = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        if (!parsed) {
            m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (m) parsed = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
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

    // When a category/name resolves to GUIDE, seed the annual-visit defaults so
    // the office only has to confirm or adjust (18 visits / 4 hrs / Jul 1 – Jun 30).
    const applyGuideDefaultsIfNeeded = (category, name) => {
        const guide = /guide/i.test(category || '') || /guide/i.test(name || '');
        if (!guide || isEdit) return;
        const now = new Date();
        const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
        setAuthorizedVisitsPerYear(prev => prev || '18');
        setHoursPerVisit(prev => prev || '4');
        setStartDate(prev => prev || `${y}-07-01`);
        setEndDate(prev => prev || `${y + 1}-06-30`);
    };

    const handleServiceCategoryChange = (newCategory) => {
        setServiceCategory(newCategory);
        const defaultAcc = getAccountForCategory(newCategory);
        if (defaultAcc && (!accountNumber || ACCOUNT_NUMBER_OPTIONS.includes(accountNumber))) {
            setAccountNumber(defaultAcc);
        }
        applyGuideDefaultsIfNeeded(newCategory, serviceName);
    };

    const handleServiceNameChange = (newName) => {
        setServiceName(newName);
        applyGuideDefaultsIfNeeded(serviceCategory, newName);
    };

    const handleServiceCodeChange = (newCode) => {
        setServiceCode(newCode);
        const defaultName = SERVICE_CODE_NAMES[newCode] || '';
        if (defaultName && !serviceName) setServiceName(defaultName);
        const defaultAcc = getAccountForServiceCode(newCode);
        if (defaultAcc && (!accountNumber || ACCOUNT_NUMBER_OPTIONS.includes(accountNumber))) {
            setAccountNumber(defaultAcc);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isEdit && manualStatus === 'renewal' && !correctingInPlace) {
            if (typeof onRenewal !== 'function') {
                // Guard: never silently fall through to onSave (which would save
                // this as manualStatus:'active') when the parent hasn't wired a
                // renewal handler — that would look like a normal save but
                // silently discard the intended renewal.
                console.error('AuthorizationFormModal: manualStatus is "renewal" but no onRenewal handler was provided. Aborting submit to avoid silently saving as active.');
                return;
            }
            const note = notePreset === 'custom'
                ? (notes.trim() || 'Other')
                : (notePreset + (notes.trim() ? ' - ' + notes.trim() : ''));
            onRenewal({
                oldAuthId: auth.id,
                clientId: auth.clientId || clientId,
                serviceCategory,
                serviceCode,
                serviceName,
                authorizationNumber,
                authorizedUnits: parseInt(authorizedUnits) || 0,
                authorizationStartDate: startDate || null,
                authorizationEndDate: endDate || null,
                notes: note,
                accountNumber,
                sandataClientId,
                authorizationType,
                authorizedVisitsPerYear: isAnnual && authorizedVisitsPerYear ? Number(authorizedVisitsPerYear) : null,
                hoursPerVisit: isAnnual && hoursPerVisit ? Number(hoursPerVisit) : null,
                // Explicit activation: only a future start can be 'scheduled'; a
                // start today/earlier is always immediate.
                renewalActivation: startIsFuture ? renewalActivation : 'immediate',
                files,
            });
            return;
        }
        if (isEdit && manualStatus === 'inactive') {
            if (typeof onInactivate !== 'function') {
                // Guard: never silently fall through to onSave (which would save
                // this as manualStatus:'active') when the parent hasn't wired an
                // inactivate handler — that is the exact opposite of what the
                // user asked for ("Save & Mark Inactive").
                console.error('AuthorizationFormModal: manualStatus is "inactive" but no onInactivate handler was provided. Aborting submit to avoid silently saving as active.');
                return;
            }
            onInactivate({ id: auth.id, authorizationEndDate: inactiveEnd, inactiveReason, inactiveNote });
            return;
        }
        // Create, or "correct current" in-place edit → plain save (no new auth).
        onSave({
            serviceCategory,
            serviceCode,
            serviceName,
            authorizationNumber,
            authorizedUnits: parseInt(authorizedUnits) || 0,
            authorizationStartDate: startDate || null,
            authorizationEndDate: endDate || null,
            notes,
            accountNumber,
            sandataClientId,
            manualStatus: 'active',
            files,
            authorizationType,
            authorizedVisitsPerYear: isAnnual && authorizedVisitsPerYear ? Number(authorizedVisitsPerYear) : null,
            hoursPerVisit: isAnnual && hoursPerVisit ? Number(hoursPerVisit) : null,
        });
    };

    const title = isRenewal ? 'Renew Authorization' : isEdit ? 'Edit Authorization' : 'Add Authorization';
    const desc = isRenewal
        ? 'Create a new authorization to replace the previous one.'
        : isEdit ? 'Update the authorization details below.' : 'Fill in the service and date details.';
    // Edit mode gets an eyebrow + service title (matches the approved mockup);
    // create/renew keep the plain modal title.
    const editTitle = (serviceCode || serviceName)
        ? `${serviceCode || ''}${serviceCode && serviceName ? ' - ' : ''}${serviceName || ''}`
        : 'Edit Authorization';

    return (
        <Modal onClose={onClose} wide>
            {isEdit ? (
                <>
                    <div className="modal__eyebrow">Edit Authorization</div>
                    <h2 className="modal__title">{editTitle}</h2>
                </>
            ) : (
                <>
                    <h2 className="modal__title">{title}</h2>
                    <p className="modal__desc">{desc}</p>
                </>
            )}
            <form onSubmit={handleSubmit}>
                {/* Create/renew flow shows the full field set up front. Edit mode
                    hides these — the status cards come first and reveal only the
                    fields relevant to the chosen action. Values still live in
                    state (seeded from `auth`) so renewal + correct-in-place carry
                    them. */}
                {!isEdit && (
                <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label>Service Category</label>
                        <AutocompleteInput value={serviceCategory} onChange={handleServiceCategoryChange} options={SERVICE_CATEGORIES} placeholder="PCS, SDPC, Waiver 58…" />
                    </div>
                    <div className="form-group">
                        <label>Service Code</label>
                        <ServiceCodeSelect value={serviceCode} onChange={(e) => handleServiceCodeChange(e.target.value)} options={serviceOptions()} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Service Name</label>
                        <AutocompleteInput value={serviceName} onChange={handleServiceNameChange} options={SERVICE_NAME_SUGGESTIONS} placeholder="Personal Care Services" filterMode="includes" />
                    </div>
                    <div className="form-group">
                        <label>Account Number</label>
                        <select value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}>
                            <option value="">- Select -</option>
                            {ACCOUNT_NUMBER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>Sandata Client ID</label>
                        <input type="text" value={sandataClientId} onChange={(e) => setSandataClientId(e.target.value)} placeholder="e.g. 1234567" />
                    </div>
                    <div className="form-group">
                        <label>Authorization Number</label>
                        <input type="text" value={authorizationNumber} onChange={(e) => setAuthorizationNumber(e.target.value)} placeholder="e.g. 45268348457" />
                    </div>
                </div>

                {/* Authorization type is derived from the service category / name.
                    GUIDE → Annual Visits (visits/year); everything else → Weekly Units. */}
                <div className="form-group">
                    <label>Authorization Type</label>
                    <div
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500,
                            background: isAnnual ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
                            color: isAnnual ? 'hsl(var(--accent-foreground))' : 'hsl(var(--muted-foreground))',
                            border: `1px solid ${isAnnual ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border))'}`,
                        }}
                    >
                        {isAnnual ? 'Annual Visits (GUIDE)' : 'Weekly Units'}
                    </div>
                    <p className="form-hint">Set automatically from the service category - GUIDE is tracked by annual visits, all other services by weekly units.</p>
                </div>

                {isAnnual ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                            <label>Visits / Year</label>
                            <input type="number" value={authorizedVisitsPerYear} onChange={(e) => setAuthorizedVisitsPerYear(e.target.value)} placeholder="e.g. 18" />
                        </div>
                        <div className="form-group">
                            <label>Hours / Visit</label>
                            <input type="number" step="0.25" value={hoursPerVisit} onChange={(e) => setHoursPerVisit(e.target.value)} placeholder="e.g. 4" />
                        </div>
                        <div className="form-group">
                            <label>Hours / Year</label>
                            <input type="text" readOnly value={hoursPerYear || ''} placeholder="auto" style={{ background: 'hsl(var(--muted))' }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                            <label>Auth Units</label>
                            <input type="number" value={authorizedUnits} onChange={(e) => setAuthorizedUnits(e.target.value)} placeholder="0" />
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label>{isAnnual ? 'Period Start' : 'Auth Start'}</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onPaste={handleDatePaste(setStartDate)} />
                    </div>
                    <div className="form-group">
                        <label>{isAnnual ? 'Period End' : 'Auth End'}</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onPaste={handleDatePaste(setEndDate)} required />
                    </div>
                </div>
                </>
                )}

                {/* Edit mode: a one-line helper mirrors the create flow's derived
                    authorization-type hint, shown above the status cards. */}
                {isEdit && (
                    <p className="form-hint" style={{ marginTop: 0 }}>
                        Set automatically from the service category - GUIDE is tracked by annual visits, all other services by weekly units.
                    </p>
                )}

                {/* Existing auth: Renewal / Inactive toggle only — no manual "Active" card.
                    Brand-new auth: no status cards at all (plain create flow). */}
                {showStatus && isEdit && (
                    <div className="form-group">
                        <label>Status</label>
                        <div className="auth-status-cards">
                            <label className={`auth-status-card ${manualStatus === 'renewal' ? 'auth-status-card--renewal' : ''}`}>
                                <input type="radio" name="authStatus" value="renewal" checked={manualStatus === 'renewal'} onChange={() => { setManualStatus('renewal'); setCorrectingInPlace(false); }} />
                                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                <span className="auth-status-card__label auth-status-card__label--renewal">Renewal</span>
                                <span className="auth-status-card__desc">Annual renewal or any significant change - new dates, new units, new care plan.</span>
                            </label>
                            <label className={`auth-status-card ${manualStatus === 'inactive' ? 'auth-status-card--inactive' : ''}`}>
                                <input type="radio" name="authStatus" value="inactive" checked={manualStatus === 'inactive'} onChange={() => setManualStatus('inactive')} />
                                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                <span className="auth-status-card__label">Inactive</span>
                                <span className="auth-status-card__desc">Client transferred, passed away, or no longer receiving this service.</span>
                            </label>
                        </div>
                    </div>
                )}

                {isEdit && manualStatus === 'renewal' && !correctingInPlace && (
                    <>
                        <div className="preview-box">
                            On save, <b>{auth.authorizationNumber || 'the current authorization'}</b> auto-closes
                            with an end date of <b>{startDate ? fmtDayBefore(startDate) : '-'}</b> - the day before
                            this new authorization starts. No overlapping dates, no manual entry.
                        </div>

                        {/* When the new start date is in the future, ask whether the
                            current authorization should keep running until then
                            (scheduled) or be replaced right away (immediate). Dates
                            are the source of truth; this is the explicit override. */}
                        {startIsFuture && (
                            <div className="form-group">
                                <label>When should this renewal take effect?</label>
                                <div className="auth-status-cards">
                                    <label className={`auth-status-card ${renewalActivation === 'scheduled' ? 'auth-status-card--renewal' : ''}`}>
                                        <input type="radio" name="renewalActivation" value="scheduled"
                                            checked={renewalActivation === 'scheduled'} onChange={() => setRenewalActivation('scheduled')} />
                                        <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                        <span className="auth-status-card__label">Wait until start date</span>
                                        <span className="auth-status-card__desc">
                                            Recommended. The current authorization stays in effect (Scheduler, Care Plan, units)
                                            through {startDate ? fmtDayBefore(startDate) : '-'}, then this renewal takes over automatically on {startDate || 'its start date'}.
                                        </span>
                                    </label>
                                    <label className={`auth-status-card ${renewalActivation === 'immediate' ? 'auth-status-card--renewal' : ''}`}>
                                        <input type="radio" name="renewalActivation" value="immediate"
                                            checked={renewalActivation === 'immediate'} onChange={() => setRenewalActivation('immediate')} />
                                        <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                        <span className="auth-status-card__label">Start immediately</span>
                                        <span className="auth-status-card__desc">
                                            Replace the current authorization now. It is retired today and this renewal becomes current
                                            immediately, even though its start date is in the future.
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}
                        <div className="form-group">
                            <label>New Authorization Number</label>
                            <input type="text" value={authorizationNumber} onChange={(e) => setAuthorizationNumber(e.target.value)} placeholder="e.g. A-2026-0119" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>{isAnnual ? 'Authorized Visits' : 'Auth Units'}</label>
                                <input type="number" value={isAnnual ? authorizedVisitsPerYear : authorizedUnits} onChange={(e) => (isAnnual ? setAuthorizedVisitsPerYear(e.target.value) : setAuthorizedUnits(e.target.value))} placeholder="0" />
                            </div>
                            <div className="form-group">
                                <label>Auth Start</label>
                                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onPaste={handleDatePaste(setStartDate)} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Auth End</label>
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onPaste={handleDatePaste(setEndDate)} required />
                            </div>
                            <div className="form-group">
                                <label>Note</label>
                                <select value={notePreset} onChange={(e) => setNotePreset(e.target.value)}>
                                    <option>Annual Renewal – No Changes</option>
                                    <option>Hours Increased</option>
                                    <option>Hours Decreased</option>
                                    <option>New Care Plan Received</option>
                                    <option value="custom">Other - write below</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Add detail - e.g. increased from 40 to 48 units/week per new care plan."
                            />
                        </div>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCorrectingInPlace(true)}>
                            Correct current authorization instead
                        </button>
                    </>
                )}

                {/* Correct-in-place: fix a typo on the current auth without creating
                    a new one. Reveals the editable core fields only. */}
                {isEdit && manualStatus === 'renewal' && correctingInPlace && (
                    <>
                        <div className="form-group">
                            <label>Authorization Number</label>
                            <input type="text" value={authorizationNumber} onChange={(e) => setAuthorizationNumber(e.target.value)} placeholder="e.g. A-2025-0119" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>{isAnnual ? 'Authorized Visits' : 'Auth Units'}</label>
                                <input type="number" value={isAnnual ? authorizedVisitsPerYear : authorizedUnits} onChange={(e) => (isAnnual ? setAuthorizedVisitsPerYear(e.target.value) : setAuthorizedUnits(e.target.value))} placeholder="0" />
                            </div>
                            <div className="form-group">
                                <label>Auth Start</label>
                                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onPaste={handleDatePaste(setStartDate)} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Auth End</label>
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onPaste={handleDatePaste(setEndDate)} required />
                            </div>
                            <div className="form-group">
                                <label>Account Number</label>
                                <select value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}>
                                    <option value="">- Select -</option>
                                    {ACCOUNT_NUMBER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCorrectingInPlace(false)}>
                            ← Back to renewal
                        </button>
                    </>
                )}

                {isEdit && manualStatus === 'inactive' && (
                    <>
                        <div className="preview-box preview-box--danger">
                            This authorization will stay visible on this client's profile under <b>{serviceCode}</b>, flagged
                            inactive with the reason and note below - nothing is deleted.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Authorization End Date</label>
                                <input type="date" value={inactiveEnd} onChange={(e) => setInactiveEnd(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Reason</label>
                                <select value={inactiveReason} onChange={(e) => setInactiveReason(e.target.value)}>
                                    <option>Client transferred to another agency</option>
                                    <option>Client passed away</option>
                                    <option>No contact with client</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={inactiveNote} onChange={(e) => setInactiveNote(e.target.value)} placeholder="Optional additional detail..." />
                        </div>
                    </>
                )}

                {showUpload && (!isEdit || (manualStatus === 'renewal' && !correctingInPlace)) && (
                    <div className="form-group">
                        <label>Upload PA / Care Plan Documents</label>
                        <input
                            type="file"
                            multiple
                            onChange={(e) => setFiles(Array.from(e.target.files))}
                            style={{ fontSize: 13 }}
                        />
                        {files.length > 0 && (
                            <div style={{ marginTop: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                {files.length} file{files.length !== 1 ? 's' : ''} selected
                            </div>
                        )}
                    </div>
                )}

                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={isEdit && manualStatus !== 'renewal' && manualStatus !== 'inactive'}
                    >
                        {!isEdit ? 'Add Authorization'
                            : correctingInPlace ? 'Save Correction'
                            : manualStatus === 'inactive' ? 'Save & Mark Inactive'
                            : manualStatus === 'renewal' ? 'Save Renewal'
                            : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
