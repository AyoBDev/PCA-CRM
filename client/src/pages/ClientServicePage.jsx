import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../hooks/useToast';

const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', label: 'PCA Service Authorization' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', label: 'SDPC Service Authorization' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', label: 'Homemaker Service Authorization' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', label: 'Respite Service Authorization' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', label: 'Attendant Care Authorization' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', label: 'Companion Service Authorization' },
};
const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', label: 'Service Authorization' };

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function unitsToHours(units) {
    if (!units) return '—';
    return (units / 4).toFixed(1);
}

export default function ClientServicePage() {
    const { clientId, serviceCode } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [client, setClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [historyExpanded, setHistoryExpanded] = useState(true);
    const [expandedHistoryDocs, setExpandedHistoryDocs] = useState(new Set());

    // Auth modal state
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [editingAuth, setEditingAuth] = useState(null);
    const [authForm, setAuthForm] = useState({ serviceCode: '', authorizationNumber: '', authorizedUnits: '', authorizedHours: '', authorizationStartDate: '', authorizationEndDate: '', notes: '' });
    const [saving, setSaving] = useState(false);

    const fetchClient = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getClient(Number(clientId));
            setClient(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [clientId, showToast]);

    useEffect(() => { fetchClient(); }, [fetchClient]);

    const colors = AUTH_COLORS[serviceCode] || DEFAULT_AUTH_COLOR;

    const allAuths = (client?.authorizations || [])
        .filter(a => (a.serviceCode || a.serviceCategory || 'Other') === serviceCode)
        .sort((a, b) => new Date(b.authorizationStartDate || 0) - new Date(a.authorizationStartDate || 0));

    const currentAuth = allAuths.find(a => !a.archivedAt && a.status !== 'Expired' && a.manualStatus === 'active');
    const historyAuths = allAuths.filter(a => a !== currentAuth);

    // Modal handlers
    const openAuthModal = (auth = null) => {
        if (auth) {
            setEditingAuth(auth);
            setAuthForm({
                serviceCode: auth.serviceCode || serviceCode,
                authorizationNumber: auth.authorizationNumber || '',
                authorizedUnits: auth.authorizedUnits || '',
                authorizedHours: auth.authorizedHours || '',
                authorizationStartDate: auth.authorizationStartDate ? new Date(auth.authorizationStartDate).toISOString().split('T')[0] : '',
                authorizationEndDate: auth.authorizationEndDate ? new Date(auth.authorizationEndDate).toISOString().split('T')[0] : '',
                notes: auth.notes || '',
            });
        } else {
            setEditingAuth(null);
            setAuthForm({
                serviceCode: serviceCode,
                authorizationNumber: '',
                authorizedUnits: '',
                authorizedHours: '',
                authorizationStartDate: '',
                authorizationEndDate: '',
                notes: '',
            });
        }
        setShowAuthModal(true);
    };

    const handleAuthDatePaste = (field) => (e) => {
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
            setAuthForm(prev => ({ ...prev, [field]: parsed }));
        }
    };

    const handleSaveAuth = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = {
                ...authForm,
                authorizedUnits: authForm.authorizedUnits ? Number(authForm.authorizedUnits) : null,
                authorizedHours: authForm.authorizedHours ? Number(authForm.authorizedHours) : null,
            };
            if (editingAuth) {
                await api.updateAuthorization(editingAuth.id, data);
                showToast('Authorization updated');
            } else {
                await api.createAuthorization(Number(clientId), data);
                showToast('Authorization created');
            }
            setShowAuthModal(false);
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleUploadAuthDoc = async (authId, file) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            await api.uploadAuthDocument(authId, formData);
            showToast('Document uploaded');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDownloadAuthDoc = async (doc) => {
        try {
            const blob = await api.downloadAuthDocument(doc.id);
            const url = URL.createObjectURL(blob);
            if (doc.mimeType === 'application/pdf' || doc.fileName?.toLowerCase().endsWith('.pdf')) {
                window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDeleteAuthDoc = async (doc) => {
        try {
            await api.deleteAuthDocument(doc.id);
            showToast('Document deleted');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleArchiveAuth = async (authId) => {
        try {
            await api.archiveAuthorization(authId);
            showToast('Authorization archived');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestoreAuth = async (authId) => {
        try {
            await api.restoreAuthorization(authId);
            showToast('Authorization restored');
            fetchClient();
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (loading) {
        return (
            <div className="page-content">
                <div className="cp-loading">
                    <div className="cp-loading__spinner" />
                    <div>Loading...</div>
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div className="page-content">
                <div className="empty-state">
                    <div className="empty-state__title">Client not found</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="csp-page">
                {/* Header */}
                <div className="csp-header" style={{ '--service-accent': colors.accent, '--service-bg': colors.bg }}>
                    <button className="csp-back" onClick={() => navigate(`/clients/${clientId}`)}>
                        {Icons.chevronLeft} Back to {client.clientName}
                    </button>
                    <div className="csp-header__row">
                        <div>
                            <h1 className="csp-header__title">{colors.label}</h1>
                            <div className="csp-header__subtitle">{client.clientName} &bull; {serviceCode}</div>
                        </div>
                        <button className="btn btn--primary btn--sm" onClick={() => openAuthModal(null)}>
                            {Icons.plus} Add Authorization
                        </button>
                    </div>
                </div>

                {/* Current Authorization */}
                <div className="csp-section">
                    <h3 className="csp-section__title">Current Authorization</h3>
                    {currentAuth ? (
                        <div className="csp-current-card" style={{ '--service-accent': colors.accent }}>
                            <div className="csp-current-card__grid">
                                <div className="csp-current-card__field">
                                    <span className="csp-current-card__label">Start Date</span>
                                    <span className="csp-current-card__value">{formatDate(currentAuth.authorizationStartDate)}</span>
                                </div>
                                <div className="csp-current-card__field">
                                    <span className="csp-current-card__label">End Date</span>
                                    <span className="csp-current-card__value">{formatDate(currentAuth.authorizationEndDate)}</span>
                                </div>
                                <div className="csp-current-card__field">
                                    <span className="csp-current-card__label">Units</span>
                                    <span className="csp-current-card__value">{currentAuth.authorizedUnits || 0}</span>
                                </div>
                                <div className="csp-current-card__field">
                                    <span className="csp-current-card__label">Hours</span>
                                    <span className="csp-current-card__value">{currentAuth.authorizedHours || unitsToHours(currentAuth.authorizedUnits)}</span>
                                </div>
                                {currentAuth.authorizationNumber && (
                                    <div className="csp-current-card__field">
                                        <span className="csp-current-card__label">Auth #</span>
                                        <span className="csp-current-card__value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{currentAuth.authorizationNumber}</span>
                                    </div>
                                )}
                                <div className="csp-current-card__field">
                                    <span className="csp-current-card__label">Status</span>
                                    <span className={`ts-badge ts-badge--${currentAuth.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                        {currentAuth.status} {currentAuth.daysToExpire != null && `(${currentAuth.daysToExpire}d)`}
                                    </span>
                                </div>
                            </div>
                            {currentAuth.notes && (
                                <div className="csp-current-card__notes">{currentAuth.notes}</div>
                            )}

                            {/* Attachments */}
                            <div className="csp-attachments">
                                <h5 className="csp-attachments__title">Attachments</h5>
                                {(currentAuth.documents || []).length === 0 ? (
                                    <div className="csp-attachments__empty">No attachments</div>
                                ) : (
                                    <div className="csp-attachments__list">
                                        {(currentAuth.documents || []).map(doc => (
                                            <div key={doc.id} className="csp-attachments__item">
                                                <span className="csp-attachments__name" onClick={() => handleDownloadAuthDoc(doc)}>
                                                    {Icons.download} {doc.fileName}
                                                </span>
                                                <button className="btn btn--danger-ghost btn--icon btn--xs" onClick={() => handleDeleteAuthDoc(doc)}>
                                                    {Icons.trash}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <label className="csp-attachments__upload">
                                    {Icons.upload} Upload
                                    <input type="file" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) handleUploadAuthDoc(currentAuth.id, e.target.files[0]); e.target.value = ''; }} />
                                </label>
                            </div>

                            <div className="csp-current-card__actions">
                                <button className="btn btn--outline btn--sm" onClick={() => openAuthModal(currentAuth)}>{Icons.edit} Edit</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => handleArchiveAuth(currentAuth.id)}>{Icons.archive} Archive</button>
                            </div>
                        </div>
                    ) : (
                        <div className="csp-empty-card">
                            <div className="csp-empty-card__icon">{Icons.clipboard}</div>
                            <p>No active authorization for this service.</p>
                            <button className="btn btn--primary btn--sm" onClick={() => openAuthModal(null)}>{Icons.plus} Add Authorization</button>
                        </div>
                    )}
                </div>

                {/* History */}
                {historyAuths.length > 0 && (
                    <div className="csp-section">
                        <button className="csp-history-toggle" onClick={() => setHistoryExpanded(!historyExpanded)}>
                            <span className="csp-history-toggle__chevron">{historyExpanded ? Icons.chevronDown : Icons.chevronRight}</span>
                            <h3 className="csp-section__title" style={{ margin: 0 }}>History ({historyAuths.length} past authorization{historyAuths.length !== 1 ? 's' : ''})</h3>
                        </button>
                        {historyExpanded && (
                            <div className="csp-history-list">
                                {historyAuths.map(a => {
                                    const docsExpanded = expandedHistoryDocs.has(a.id);
                                    const docs = a.documents || [];
                                    return (
                                        <div key={a.id} className={`csp-history-item ${a.archivedAt ? 'csp-history-item--archived' : ''}`}>
                                            <div className="csp-history-item__main">
                                                <div className="csp-history-item__dates">
                                                    {formatDate(a.authorizationStartDate)} – {formatDate(a.authorizationEndDate)}
                                                </div>
                                                <div className="csp-history-item__meta">
                                                    {a.authorizedUnits > 0 && <span>{a.authorizedUnits} units</span>}
                                                    {(a.authorizedHours > 0 || a.authorizedUnits > 0) && <span>{a.authorizedHours || unitsToHours(a.authorizedUnits)} hrs</span>}
                                                    {a.authorizationNumber && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>#{a.authorizationNumber}</span>}
                                                </div>
                                            </div>
                                            <div className="csp-history-item__actions">
                                                {a.archivedAt ? (
                                                    <span className="ts-badge ts-badge--draft">Archived</span>
                                                ) : (
                                                    <span className="ts-badge ts-badge--critical">Expired</span>
                                                )}
                                                <button className="btn btn--ghost btn--xs" onClick={() => {
                                                    setExpandedHistoryDocs(prev => {
                                                        const next = new Set(prev);
                                                        next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                                                        return next;
                                                    });
                                                }} title="Attachments">
                                                    {Icons.download}
                                                    {docs.length > 0 && <span style={{ marginLeft: 2, fontSize: 10 }}>{docs.length}</span>}
                                                </button>
                                                <button className="btn btn--ghost btn--xs" onClick={() => openAuthModal(a)}>{Icons.edit}</button>
                                                {a.archivedAt && (
                                                    <button className="btn btn--ghost btn--xs" onClick={() => handleRestoreAuth(a.id)}>{Icons.rotateCcw}</button>
                                                )}
                                            </div>
                                            {docsExpanded && (
                                                <div className="csp-attachments" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid hsl(var(--border))' }}>
                                                    {docs.length === 0 ? (
                                                        <div className="csp-attachments__empty">No attachments</div>
                                                    ) : (
                                                        <div className="csp-attachments__list">
                                                            {docs.map(doc => (
                                                                <div key={doc.id} className="csp-attachments__item">
                                                                    <span className="csp-attachments__name" onClick={() => handleDownloadAuthDoc(doc)}>
                                                                        {Icons.download} {doc.fileName}
                                                                    </span>
                                                                    <button className="btn btn--danger-ghost btn--icon btn--xs" onClick={() => handleDeleteAuthDoc(doc)}>
                                                                        {Icons.trash}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <label className="csp-attachments__upload">
                                                        {Icons.upload} Upload
                                                        <input type="file" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) handleUploadAuthDoc(a.id, e.target.files[0]); e.target.value = ''; }} />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Auth Modal */}
            {showAuthModal && (
                <Modal onClose={() => setShowAuthModal(false)}>
                    <h2 className="modal__title">{editingAuth ? 'Edit Authorization' : 'Add Authorization'}</h2>
                    <form onSubmit={handleSaveAuth}>
                        <div className="form-group">
                            <label>Service Code</label>
                            <select value={authForm.serviceCode} onChange={(e) => setAuthForm({ ...authForm, serviceCode: e.target.value })} disabled required>
                                <option value="">Select service code...</option>
                                <option value="PCS">PCS - Personal Care</option>
                                <option value="SDPC">SDPC - Self Directed</option>
                                <option value="S5125">S5125 - Attendant Care</option>
                                <option value="S5130">S5130 - Homemaker</option>
                                <option value="S5150">S5150 - Respite</option>
                                <option value="S5135">S5135 - Companion</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Authorization Number</label>
                            <input type="text" value={authForm.authorizationNumber} onChange={(e) => setAuthForm({ ...authForm, authorizationNumber: e.target.value })} placeholder="Auth number" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Authorized Units (15-min)</label>
                                <input type="number" value={authForm.authorizedUnits} onChange={(e) => setAuthForm({ ...authForm, authorizedUnits: e.target.value })} placeholder="e.g. 120" />
                            </div>
                            <div className="form-group">
                                <label>Authorized Hours</label>
                                <input type="number" step="0.5" value={authForm.authorizedHours} onChange={(e) => setAuthForm({ ...authForm, authorizedHours: e.target.value })} placeholder="e.g. 30" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Start Date</label>
                                <input type="date" value={authForm.authorizationStartDate} onChange={(e) => setAuthForm({ ...authForm, authorizationStartDate: e.target.value })} onPaste={handleAuthDatePaste('authorizationStartDate')} />
                            </div>
                            <div className="form-group">
                                <label>End Date</label>
                                <input type="date" value={authForm.authorizationEndDate} onChange={(e) => setAuthForm({ ...authForm, authorizationEndDate: e.target.value })} onPaste={handleAuthDatePaste('authorizationEndDate')} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={authForm.notes} onChange={(e) => setAuthForm({ ...authForm, notes: e.target.value })} rows={2} placeholder="Optional notes" />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setShowAuthModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary" disabled={saving || !authForm.serviceCode}>{saving ? 'Saving...' : editingAuth ? 'Update' : 'Create'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
}
