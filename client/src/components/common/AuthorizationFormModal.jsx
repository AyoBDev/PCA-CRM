import { useState } from 'react';
import Modal from './Modal';
import AutocompleteInput from './AutocompleteInput';
import { useServices } from '../../hooks/useServices';
import { ServiceCodeSelect, SERVICE_CATEGORIES, SERVICE_NAME_SUGGESTIONS } from '../../utils/serviceCodes';
import { SERVICE_CODE_NAMES } from '../../utils/constants';
import { getAccountForCategory, getAccountForServiceCode, ACCOUNT_NUMBER_OPTIONS } from '../../utils/accountMapping';

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
 *  - onRenewal(payload): optional — called when Status = Renewal on an edit
 *  - isRenewal: optional — render as a "Renew Authorization" flow
 *  - showStatus: default true — show the Active/Renewal/Inactive status cards
 *  - showUpload: default true — show the PA / Care Plan file upload field
 */
export default function AuthorizationFormModal({
    auth,
    clientId,
    onSave,
    onClose,
    onRenewal,
    isRenewal = false,
    showStatus = true,
    showUpload = true,
}) {
    const { serviceOptions } = useServices();
    const [serviceCategory, setServiceCategory] = useState(auth?.serviceCategory || '');
    const [serviceCode, setServiceCode] = useState(auth?.serviceCode || 'PCS');
    const [serviceName, setServiceName] = useState(auth?.serviceName || '');
    const [authorizedUnits, setAuthorizedUnits] = useState(isRenewal ? '' : (auth?.authorizedUnits || ''));
    const [authorizationNumber, setAuthorizationNumber] = useState(isRenewal ? '' : (auth?.authorizationNumber || ''));
    const [accountNumber, setAccountNumber] = useState(auth?.accountNumber || getAccountForCategory(auth?.serviceCategory) || '');
    const [sandataClientId, setSandataClientId] = useState(auth?.sandataClientId || '');
    const [startDate, setStartDate] = useState(
        !isRenewal && auth?.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : ''
    );
    const [endDate, setEndDate] = useState(
        !isRenewal && auth?.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : ''
    );
    const [notes, setNotes] = useState(isRenewal ? '' : (auth?.notes || ''));
    const [manualStatus, setManualStatus] = useState(isRenewal ? 'active' : (auth?.manualStatus || 'active'));
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
        if (manualStatus === 'renewal' && isEdit && onRenewal) {
            onRenewal({
                oldAuthId: auth.id,
                clientId: auth.clientId || clientId,
                serviceCategory,
                serviceCode,
                serviceName,
                accountNumber,
            });
            return;
        }
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
            manualStatus,
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

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{title}</h2>
            <p className="modal__desc">{desc}</p>
            <form onSubmit={handleSubmit}>
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
                            <option value="">— Select —</option>
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
                    <p className="form-hint">Set automatically from the service category — GUIDE is tracked by annual visits, all other services by weekly units.</p>
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
                <div className="form-group">
                    <label>Notes</label>
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
                </div>

                {showStatus && (
                    <div className="form-group">
                        <label>Status</label>
                        <div className="auth-status-cards">
                            <label className={`auth-status-card ${manualStatus === 'active' ? 'auth-status-card--active' : ''}`}>
                                <input type="radio" name="authStatus" value="active" checked={manualStatus === 'active'} onChange={() => setManualStatus('active')} />
                                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                <span className="auth-status-card__label">Active</span>
                                <span className="auth-status-card__desc">Authorization is currently valid and in use.</span>
                            </label>
                            {isEdit && !isRenewal && onRenewal && (
                                <label className={`auth-status-card ${manualStatus === 'renewal' ? 'auth-status-card--renewal' : ''}`}>
                                    <input type="radio" name="authStatus" value="renewal" checked={manualStatus === 'renewal'} onChange={() => setManualStatus('renewal')} />
                                    <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                    <span className="auth-status-card__label" style={{ color: '#2563eb' }}>Renewal</span>
                                    <span className="auth-status-card__desc">Move to history and create a new authorization.</span>
                                </label>
                            )}
                            <label className={`auth-status-card ${manualStatus === 'inactive' ? 'auth-status-card--inactive' : ''}`}>
                                <input type="radio" name="authStatus" value="inactive" checked={manualStatus === 'inactive'} onChange={() => setManualStatus('inactive')} />
                                <div className="auth-status-card__radio"><span className="auth-status-card__dot" /></div>
                                <span className="auth-status-card__label">Inactive</span>
                                <span className="auth-status-card__desc">Authorization is no longer in use.</span>
                            </label>
                        </div>
                    </div>
                )}

                {showUpload && (
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
                    <button type="submit" className="btn btn--primary">{isRenewal ? 'Create Renewal' : isEdit ? 'Save Changes' : 'Add Authorization'}</button>
                </div>
            </form>
        </Modal>
    );
}
