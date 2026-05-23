import { useState, useRef, useEffect } from 'react';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

const ACCOUNT_OPTIONS = ['71040', '71120', '71119', '71635'];

const DEFAULT_ACCOUNT_BY_CODE = {
    PCS: '71040',
    SDPC: '71119',
    S5130: '71120',
    S5150: '71635',
};

const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', border: '#22c55e', label: 'PCA SERVICE AUTHORIZATION', icon: 'shieldCheck' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', border: '#8b5cf6', label: 'SDPC SERVICE AUTHORIZATION', icon: 'users' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', border: '#f59e0b', label: 'HOMEMAKER SERVICE AUTHORIZATION', icon: 'building' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', border: '#06b6d4', label: 'RESPITE SERVICE AUTHORIZATION', icon: 'heart' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', border: '#3b82f6', label: 'ATTENDANT CARE AUTHORIZATION', icon: 'user' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', border: '#ec4899', label: 'COMPANION SERVICE AUTHORIZATION', icon: 'users' },
};
const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', border: '#64748b', label: 'SERVICE AUTHORIZATION', icon: 'clipboard' };

const LEFT_CODES = ['PCS', 'SDPC'];

const STATUS_SORT_ORDER = { active: 0, pending: 1, inactive: 2 };

const STATUS_STYLES = {
    active: { color: '#16a34a', bg: 'hsl(142 76% 95%)', border: '#86efac', label: 'Active' },
    pending: { color: '#d97706', bg: 'hsl(38 92% 95%)', border: '#fcd34d', label: 'Pending' },
    inactive: { color: '#dc2626', bg: 'hsl(0 84% 96%)', border: '#fca5a5', label: 'Inactive' },
};

function ThreeDotMenu({ onEdit, onDelete }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <div className="pa-three-dot" ref={ref}>
            <button className="pa-three-dot__btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {open && (
                <div className="pa-three-dot__menu">
                    <button className="pa-three-dot__item" onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}>
                        {Icons.edit} Edit
                    </button>
                    <button className="pa-three-dot__item pa-three-dot__item--danger" onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}>
                        {Icons.archive} Archive
                    </button>
                </div>
            )}
        </div>
    );
}

export default function ProgramsAuthTab({
    client,
    clientId,
    navigate,
    isAdmin,
    openAuthModal,
    handleArchiveAuth,
    handleRestoreAuth,
    handleUploadAuthDoc,
    handleDownloadAuthDoc,
    handleDeleteAuthDoc,
    expandedServiceCode,
    setExpandedServiceCode,
    authFilterStatus,
    setAuthFilterStatus,
    expandedAuthAttachments,
    setExpandedAuthAttachments,
    authGroupsForInsurance,
    formatDate,
    unitsToHours,
    fetchClient,
    showToast,
    totalDocs,
}) {
    const [expandedAuthIds, setExpandedAuthIds] = useState({});
    const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);

    const toggleAuthExpanded = (authId) => {
        setExpandedAuthIds(prev => ({ ...prev, [authId]: !prev[authId] }));
    };

    const filterAuths = (auths) => {
        if (authFilterStatus === 'all') return auths;
        if (authFilterStatus === 'active') return auths.filter(a => !a.archivedAt && (a.manualStatus || 'active') === 'active');
        if (authFilterStatus === 'pending') return auths.filter(a => (a.manualStatus || 'active') === 'pending');
        if (authFilterStatus === 'inactive') return auths.filter(a => (a.manualStatus || 'active') === 'inactive');
        return auths;
    };

    const sortAuths = (auths) => {
        return [...auths].sort((a, b) => {
            const statusA = STATUS_SORT_ORDER[a.manualStatus || 'active'] ?? 1;
            const statusB = STATUS_SORT_ORDER[b.manualStatus || 'active'] ?? 1;
            if (statusA !== statusB) return statusA - statusB;
            const dateA = a.authorizationEndDate ? new Date(a.authorizationEndDate) : new Date(0);
            const dateB = b.authorizationEndDate ? new Date(b.authorizationEndDate) : new Date(0);
            return dateB - dateA;
        });
    };

    const allCodes = Object.keys(authGroupsForInsurance);
    const leftCodes = LEFT_CODES.filter(c => allCodes.includes(c));
    const rightCodes = allCodes.filter(c => !LEFT_CODES.includes(c));

    let totalActive = 0, totalUnits = 0;
    Object.values(authGroupsForInsurance).forEach(({ current }) => {
        totalActive += current.length;
        current.forEach(a => {
            totalUnits += a.authorizedUnits || 0;
        });
    });
    const totalHours = (totalUnits / 4).toFixed(2);

    async function handleAccountNumberChange(code, value) {
        const { current, archived } = authGroupsForInsurance[code];
        const allAuths = [...current, ...archived];
        try {
            await Promise.all(allAuths.map(a => api.updateAuthAccountNumber(a.id, value)));
            if (fetchClient) fetchClient();
        } catch (err) {
            if (showToast) showToast('Failed to update account number', 'error');
        }
    }

    async function handleStatusChange(authId, newStatus) {
        try {
            await api.updateAuthManualStatus(authId, newStatus);
            if (fetchClient) fetchClient();
            if (showToast) showToast(`Status updated to ${newStatus}`);
        } catch (err) {
            if (showToast) showToast(err.message || 'Failed to update status', 'error');
        }
    }

    function renderServiceCard(code) {
        const { current, archived } = authGroupsForInsurance[code];
        const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
        const allAuths = [...current, ...archived];
        const filteredAuths = sortAuths(filterAuths(allAuths));
        const activeAuths = current.filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt);
        const latestAuth = activeAuths[0] || current[0] || allAuths[0];
        const attachCount = latestAuth ? (latestAuth.documents || []).length : 0;
        const currentAccountNumber = latestAuth?.accountNumber || DEFAULT_ACCOUNT_BY_CODE[code] || '';

        const isExpanded = expandedServiceCode === code;

        return (
            <div key={code} className="pa-service-card" style={{ '--card-accent': colors.accent, '--card-bg': colors.bg, '--card-border': colors.border }}>
                <div className="pa-service-card__header">
                    <div className="pa-service-card__icon-wrap" style={{ background: colors.bg, color: colors.accent }}>
                        {Icons[colors.icon]}
                    </div>
                    <div className="pa-service-card__title-area">
                        <h4 className="pa-service-card__title">{colors.label}</h4>
                        {latestAuth?.authorizationNumber && <span className="pa-badge pa-badge--auth-num">#{latestAuth.authorizationNumber}</span>}
                        {activeAuths.length > 0 && <span className="pa-badge pa-badge--active">Active</span>}
                    </div>
                    <div className="pa-service-card__account">
                        <span className="pa-service-card__account-label">Account Number</span>
                        <select
                            className="pa-service-card__account-select"
                            value={currentAccountNumber}
                            onChange={(e) => handleAccountNumberChange(code, e.target.value)}
                        >
                            <option value="">—</option>
                            {ACCOUNT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>

                <div className="pa-service-card__body">
                    {latestAuth ? (
                        <>
                            <div className="pa-service-card__detail">
                                {Icons.calendar} <span>{formatDate(latestAuth.authorizationStartDate)} – {formatDate(latestAuth.authorizationEndDate)}</span>
                            </div>
                            <div className="pa-service-card__detail">
                                {Icons.clock} <span>{latestAuth.authorizedUnits || 0} units ({unitsToHours(latestAuth.authorizedUnits || 0)} hrs)</span>
                            </div>
                            <div className="pa-service-card__detail">
                                {Icons.paperclip} <span>{attachCount} attachment{attachCount !== 1 ? 's' : ''}</span>
                            </div>
                        </>
                    ) : (
                        <div className="pa-service-card__detail" style={{ color: 'hsl(var(--muted-foreground))' }}>No authorizations</div>
                    )}
                </div>

                <div className="pa-service-card__footer">
                    <button className="btn btn--outline btn--sm" onClick={() => navigate(`/clients/${clientId}/service/${code}`)}>{Icons.externalLink} Open</button>
                    <button
                        className="btn btn--outline btn--sm pa-btn--view-details"
                        style={{ color: colors.accent, borderColor: colors.accent }}
                        onClick={() => setExpandedServiceCode(isExpanded ? null : code)}
                    >
                        {isExpanded ? Icons.chevronDown : Icons.chevronRight} {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>
                </div>

                {isExpanded && (
                    <div className="pa-service-card__expanded">
                        {filteredAuths.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>No authorizations match the current filter.</div>
                        ) : (
                            <div className="pa-auth-list">
                                {filteredAuths.map(a => {
                                    const authStatus = a.manualStatus || 'active';
                                    const statusStyle = STATUS_STYLES[authStatus] || STATUS_STYLES.active;
                                    const isAuthExpanded = expandedAuthIds[a.id];

                                    return (
                                        <div key={a.id} className={`pa-auth-item pa-auth-item--${authStatus}`}>
                                            <div className="pa-auth-item__header" onClick={() => toggleAuthExpanded(a.id)}>
                                                <div className="pa-auth-item__left">
                                                    <span className="pa-auth-item__chevron">
                                                        {isAuthExpanded ? Icons.chevronDown : Icons.chevronRight}
                                                    </span>
                                                    <span className="pa-auth-item__name" style={a.archivedAt ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>
                                                        {a.serviceName || a.serviceCategory || code}
                                                        {a.authorizationNumber && <span className="pa-auth-item__number">#{a.authorizationNumber}</span>}
                                                    </span>
                                                    <span className="pa-auth-item__dates">
                                                        {formatDate(a.authorizationStartDate)} – {formatDate(a.authorizationEndDate)}
                                                    </span>
                                                    {a.authorizedUnits > 0 && (
                                                        <span className="pa-auth-item__units">{a.authorizedUnits} units ({unitsToHours(a.authorizedUnits)} hrs)</span>
                                                    )}
                                                </div>
                                                <div className="pa-auth-item__right" onClick={e => e.stopPropagation()}>
                                                    <select
                                                        className="pa-auth-item__status-select"
                                                        value={authStatus}
                                                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                                                        style={{ color: statusStyle.color, background: statusStyle.bg, borderColor: statusStyle.border }}
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="pending">Pending</option>
                                                        <option value="inactive">Inactive</option>
                                                    </select>
                                                    {a.daysToExpire !== null && !a.archivedAt && (
                                                        <span className={`ts-badge ts-badge--${a.status === 'Expired' ? 'critical' : a.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                                            {a.status} {a.daysToExpire >= 0 ? `(${a.daysToExpire}d)` : `(${Math.abs(a.daysToExpire)}d ago)`}
                                                        </span>
                                                    )}
                                                    {a.archivedAt && <span className="ts-badge ts-badge--draft">Archived</span>}
                                                    {!a.archivedAt ? (
                                                        <ThreeDotMenu
                                                            onEdit={() => openAuthModal(a, code)}
                                                            onDelete={() => handleArchiveAuth(a.id)}
                                                        />
                                                    ) : (
                                                        <button className="btn btn--ghost btn--xs" onClick={() => handleRestoreAuth(a.id)}>{Icons.rotateCcw} Restore</button>
                                                    )}
                                                </div>
                                            </div>

                                            {isAuthExpanded && (
                                                <div className="pa-auth-item__body">
                                                    {a.notes && <div className="pa-auth-item__notes">{a.notes}</div>}
                                                    <div className="cp-auth-attachments">
                                                        <button
                                                            className="cp-auth-attachments__toggle"
                                                            onClick={() => setExpandedAuthAttachments(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                                                        >
                                                            {Icons.fileText} {(a.documents || []).length} attachment{(a.documents || []).length !== 1 ? 's' : ''}
                                                            <span style={{ marginLeft: 4 }}>{expandedAuthAttachments[a.id] ? Icons.chevronDown : Icons.chevronRight}</span>
                                                        </button>
                                                        {expandedAuthAttachments[a.id] && (
                                                            <div className="cp-auth-attachments__list">
                                                                {(a.documents || []).length === 0 ? (
                                                                    <div className="cp-auth-attachments__empty">No attachments</div>
                                                                ) : (
                                                                    (a.documents || []).map(doc => (
                                                                        <div key={doc.id} className="cp-auth-attachments__item">
                                                                            <span className="cp-auth-attachments__name" onClick={() => handleDownloadAuthDoc(doc)} title="Download">
                                                                                {Icons.download} {doc.fileName}
                                                                            </span>
                                                                            {confirmDeleteDoc === doc.id ? (
                                                                                <span className="cp-auth-attachments__confirm-delete">
                                                                                    <span>Delete?</span>
                                                                                    <button className="btn btn--danger btn--xs" onClick={() => { handleDeleteAuthDoc(doc); setConfirmDeleteDoc(null); }}>Yes</button>
                                                                                    <button className="btn btn--outline btn--xs" onClick={() => setConfirmDeleteDoc(null)}>No</button>
                                                                                </span>
                                                                            ) : (
                                                                                <button className="btn btn--danger-ghost btn--icon btn--xs" onClick={() => setConfirmDeleteDoc(doc.id)} title="Delete">
                                                                                    {Icons.trash}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ))
                                                                )}
                                                                <label className="cp-auth-attachments__upload">
                                                                    {Icons.upload} Upload
                                                                    <input type="file" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) handleUploadAuthDoc(a.id, e.target.files[0]); e.target.value = ''; }} />
                                                                </label>
                                                            </div>
                                                        )}
                                                    </div>
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
        );
    }

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title" style={{ fontSize: 18, fontWeight: 700 }}>Authorizations by Service</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="pa-filter-tabs">
                            {[
                                { value: 'all', label: 'All' },
                                { value: 'active', label: 'Active' },
                                { value: 'pending', label: 'Pending' },
                                { value: 'inactive', label: 'Inactive' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    className={`pa-filter-tabs__tab ${authFilterStatus === opt.value ? 'pa-filter-tabs__tab--active' : ''}`}
                                    onClick={() => setAuthFilterStatus(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <button className="btn btn--primary btn--sm" onClick={() => openAuthModal(null, '')}>{Icons.plus} Add Authorization</button>
                    </div>
                </div>
                <div className="cp-card__body">
                    {Object.keys(authGroupsForInsurance).length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>No authorizations on file.</p>
                        </div>
                    ) : (
                        <div className="pa-services-grid">
                            <div className="pa-services-grid__left">
                                {leftCodes.map(code => renderServiceCard(code))}
                            </div>
                            <div className="pa-services-grid__right">
                                {rightCodes.map(code => renderServiceCard(code))}
                            </div>
                        </div>
                    )}

                    {Object.keys(authGroupsForInsurance).length > 0 && (
                        <div className="pa-summary-bar">
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#22c55e' }}>{Icons.checkCircle}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">TOTAL ACTIVE</span>
                                    <span className="pa-summary-bar__value">{totalActive}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#3b82f6' }}>{Icons.clock}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">TOTAL UNITS</span>
                                    <span className="pa-summary-bar__value">{totalUnits}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#f59e0b' }}>{Icons.clock}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">TOTAL HOURS</span>
                                    <span className="pa-summary-bar__value">{totalHours}</span>
                                </div>
                            </div>
                            <div className="pa-summary-bar__item">
                                <div className="pa-summary-bar__icon" style={{ color: '#22c55e' }}>{Icons.paperclip}</div>
                                <div className="pa-summary-bar__data">
                                    <span className="pa-summary-bar__label">DOCUMENTS</span>
                                    <span className="pa-summary-bar__value">{totalDocs || 0}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
