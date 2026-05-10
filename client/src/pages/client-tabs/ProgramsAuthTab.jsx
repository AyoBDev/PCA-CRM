import Icons from '../../components/common/Icons';

const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', label: 'PCA Service Authorization' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', label: 'SDPC Service Authorization' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', label: 'Homemaker Service Authorization' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', label: 'Respite Service Authorization' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', label: 'Attendant Care Authorization' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', label: 'Companion Service Authorization' },
};
const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', label: 'Service Authorization' };

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
}) {
    const filterAuths = (auths) => {
        if (authFilterStatus === 'all') return auths;
        if (authFilterStatus === 'active') return auths.filter(a => !a.archivedAt && a.status !== 'Expired');
        if (authFilterStatus === 'expired') return auths.filter(a => a.status === 'Expired');
        if (authFilterStatus === 'archived') return auths.filter(a => a.archivedAt);
        return auths;
    };

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Insurance & Authorizations</h3>
                    <button className="btn btn--primary btn--sm" onClick={() => openAuthModal(null, '')}>{Icons.plus} Add Authorization</button>
                </div>
                <div className="cp-card__body">
                    <div className="cp-insurance-detail">
                        <div className="cp-insurance-row">
                            <span className="cp-insurance-label">Insurance Type</span>
                            <span className="cp-insurance-value">{client.insuranceType || '—'}</span>
                        </div>
                        <div className="cp-insurance-row">
                            <span className="cp-insurance-label">Medicaid ID</span>
                            <span className="cp-insurance-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{client.medicaidId || '—'}</span>
                        </div>
                        <div className="cp-insurance-row">
                            <span className="cp-insurance-label">PA Number</span>
                            <span className="cp-insurance-value">{client.paNumber || '—'}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
                        <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'hsl(var(--foreground))' }}>Authorizations by Service</h4>
                        <div className="cl-filters__tabs" style={{ gap: 4 }}>
                            {[
                                { value: 'all', label: 'All' },
                                { value: 'active', label: 'Active' },
                                { value: 'expired', label: 'Expired' },
                                { value: 'archived', label: 'Archived' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    className={`cl-filters__tab ${authFilterStatus === opt.value ? 'cl-filters__tab--active' : ''}`}
                                    onClick={() => setAuthFilterStatus(opt.value)}
                                    style={{ padding: '3px 10px', fontSize: 11 }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {Object.keys(authGroupsForInsurance).length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>No authorizations on file.</p>
                        </div>
                    ) : (
                        <div className="cp-auth-sections">
                            {Object.entries(authGroupsForInsurance).map(([code, { current, archived }]) => {
                                const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
                                const allAuths = [...current, ...archived];
                                const filteredAuths = filterAuths(allAuths);
                                const isExpanded = expandedServiceCode === code;
                                return (
                                    <div key={code} className="cp-auth-group" style={{ '--auth-accent': colors.accent, '--auth-bg': colors.bg }}>
                                        <div className="cp-auth-group__bar" />
                                        <div className="cp-auth-group__content">
                                            <div
                                                className="cp-auth-group__header-clickable"
                                                onClick={() => setExpandedServiceCode(isExpanded ? null : code)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <h4 className="cp-auth-group__title" style={{ margin: 0, cursor: 'pointer' }}>{colors.label || `${code} Service Authorization`}</h4>
                                                </div>
                                                <div className="cp-auth-group__summary">
                                                    <span className="ts-badge ts-badge--submitted">{current.length} active</span>
                                                    {archived.length > 0 && <span className="ts-badge ts-badge--draft">{archived.length} archived</span>}
                                                    <button className="btn btn--outline btn--xs" onClick={(e) => { e.stopPropagation(); navigate(`/clients/${clientId}/service/${code}`); }}>{Icons.externalLink || Icons.chevronRight} Open</button>
                                                    <button className="btn btn--outline btn--xs" onClick={(e) => { e.stopPropagation(); openAuthModal(null, code); }}>{Icons.plus} Add</button>
                                                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
                                                        {isExpanded ? Icons.chevronDown : Icons.chevronRight}
                                                    </span>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="cp-auth-expanded">
                                                    {filteredAuths.length === 0 ? (
                                                        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>No authorizations match the current filter.</div>
                                                    ) : (
                                                        filteredAuths.map(a => (
                                                            <div key={a.id} className="cp-auth-detail-row">
                                                                <div className="cp-auth-detail-row__main">
                                                                    <span className="cp-auth-item__dot" style={{ background: a.archivedAt ? '#94a3b8' : colors.accent }} />
                                                                    <div className="cp-auth-detail-row__info">
                                                                        <div className="cp-auth-detail-row__name" style={a.archivedAt ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>
                                                                            {a.serviceName || a.serviceCategory || code}
                                                                            {a.authorizationNumber && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono, monospace)', marginLeft: 6 }}>#{a.authorizationNumber}</span>}
                                                                        </div>
                                                                        <div className="cp-auth-detail-row__meta">
                                                                            {(a.authorizationStartDate || a.authorizationEndDate) && (
                                                                                <span>{formatDate(a.authorizationStartDate)} – {formatDate(a.authorizationEndDate)}</span>
                                                                            )}
                                                                            {a.authorizedUnits > 0 && <span>{a.authorizedUnits} units ({unitsToHours(a.authorizedUnits)} hrs)</span>}
                                                                            {a.authorizedHours > 0 && <span>{a.authorizedHours} hours</span>}
                                                                        </div>
                                                                        {a.notes && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{a.notes}</div>}
                                                                    </div>
                                                                    <div className="cp-auth-detail-row__actions">
                                                                        {a.daysToExpire !== null && !a.archivedAt && (
                                                                            <span className={`ts-badge ts-badge--${a.status === 'Expired' ? 'critical' : a.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                                                                {a.status} {a.daysToExpire >= 0 ? `(${a.daysToExpire}d)` : `(${Math.abs(a.daysToExpire)}d ago)`}
                                                                            </span>
                                                                        )}
                                                                        {a.archivedAt && <span className="ts-badge ts-badge--draft">Archived</span>}
                                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                                            {!a.archivedAt ? (
                                                                                <>
                                                                                    <button className="btn btn--ghost btn--xs" onClick={() => openAuthModal(a, code)}>{Icons.edit}</button>
                                                                                    <button className="btn btn--ghost btn--xs" onClick={() => handleArchiveAuth(a.id)}>{Icons.archive}</button>
                                                                                </>
                                                                            ) : (
                                                                                <button className="btn btn--ghost btn--xs" onClick={() => handleRestoreAuth(a.id)}>{Icons.rotateCcw} Restore</button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
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
                                                                                        <button className="btn btn--danger-ghost btn--icon btn--xs" onClick={() => handleDeleteAuthDoc(doc)} title="Delete">
                                                                                            {Icons.trash}
                                                                                        </button>
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
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
