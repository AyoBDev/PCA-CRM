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

export default function ProfileInsuranceTab({
    client,
    clientId,
    employees,
    isAdmin,
    navigate,
    showToast,
    fetchClient,
    openAuthModal,
    handleArchiveAuth,
    handleRestoreAuth,
    handleUploadAuthDoc,
    handleDownloadAuthDoc,
    handleDeleteAuthDoc,
    setShowCareTeamModal,
    handleRemoveCareTeam,
    editingNotes,
    setEditingNotes,
    notesValue,
    setNotesValue,
    handleSaveNotes,
    editingPcaNotes,
    setEditingPcaNotes,
    pcaNotesValue,
    setPcaNotesValue,
    handleSavePcaNotes,
    editingCaregiverReqs,
    setEditingCaregiverReqs,
    caregiverReqsValue,
    setCaregiverReqsValue,
    handleSaveCaregiverReqs,
    editingMainServices,
    setEditingMainServices,
    mainServicesValue,
    setMainServicesValue,
    handleSaveMainServices,
    expandedAuthAttachments,
    setExpandedAuthAttachments,
    summaryExpandedService,
    setSummaryExpandedService,
    authGroups,
    formatDate,
    unitsToHours,
    openEditClientModal,
    totalDocs,
}) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-summary-grid">
                {/* Care Plan Overview */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            <span className="cp-card__dot cp-card__dot--green" />
                            Care Plan Overview
                        </h3>
                    </div>
                    <div className="cp-card__body">
                        {Object.keys(authGroups).length === 0 ? (
                            <div className="cp-empty-state-card">
                                <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                <p>No authorizations on file.</p>
                            </div>
                        ) : (
                            <div className="cp-auth-sections">
                                {Object.entries(authGroups).map(([code, auths]) => {
                                    const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
                                    const isExpanded = summaryExpandedService === code;
                                    const activeAuths = auths.filter(a => !a.archivedAt);
                                    const expiredAuths = auths.filter(a => a.status === 'Expired');
                                    return (
                                        <div key={code} className="cp-auth-group" style={{ '--auth-accent': colors.accent, '--auth-bg': colors.bg }}>
                                            <div className="cp-auth-group__bar" />
                                            <div className="cp-auth-group__content">
                                                <div
                                                    className="cp-auth-group__header-clickable"
                                                    onClick={() => setSummaryExpandedService(isExpanded ? null : code)}
                                                >
                                                    <h4 className="cp-auth-group__title" style={{ margin: 0, cursor: 'pointer' }}>
                                                        {colors.label || `${code} Service Authorization`}
                                                    </h4>
                                                    <div className="cp-auth-group__summary">
                                                        <span className="ts-badge ts-badge--submitted">{activeAuths.length} active</span>
                                                        {expiredAuths.length > 0 && <span className="ts-badge ts-badge--critical">{expiredAuths.length} expired</span>}
                                                        <button className="btn btn--outline btn--xs" onClick={(e) => { e.stopPropagation(); navigate(`/clients/${clientId}/service/${code}`); }}>{Icons.externalLink || Icons.chevronRight} Open</button>
                                                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12, marginLeft: 4 }}>
                                                            {isExpanded ? Icons.chevronDown : Icons.chevronRight}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isExpanded && (
                                                    <div className="cp-auth-expanded">
                                                        {auths.map(a => (
                                                            <div key={a.id} className="cp-auth-detail-row">
                                                                <div className="cp-auth-detail-row__main">
                                                                    <span className="cp-auth-item__dot" style={{ background: colors.accent }} />
                                                                    <div className="cp-auth-detail-row__info">
                                                                        <div className="cp-auth-detail-row__name">
                                                                            {a.serviceName || a.serviceCategory || code}
                                                                            {a.authorizationNumber && (
                                                                                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono, monospace)', marginLeft: 6 }}>
                                                                                    #{a.authorizationNumber}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="cp-auth-detail-row__meta">
                                                                            {(a.authorizationStartDate || a.authorizationEndDate) && (
                                                                                <span>{formatDate(a.authorizationStartDate)} – {formatDate(a.authorizationEndDate)}</span>
                                                                            )}
                                                                            {a.authorizedUnits > 0 && <span>{a.authorizedUnits} units ({unitsToHours(a.authorizedUnits)} hrs)</span>}
                                                                        </div>
                                                                    </div>
                                                                    <div className="cp-auth-detail-row__status">
                                                                        {a.daysToExpire !== null && (
                                                                            <span className={`ts-badge ts-badge--${a.status === 'Expired' ? 'critical' : a.status === 'Renewal Reminder' ? 'draft' : 'submitted'}`}>
                                                                                {a.status} {a.daysToExpire >= 0 ? `(${a.daysToExpire}d)` : `(${Math.abs(a.daysToExpire)}d ago)`}
                                                                            </span>
                                                                        )}
                                                                        {a.archivedAt && <span className="ts-badge ts-badge--draft">Archived</span>}
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
                                                        ))}
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

                {/* Care Team */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Care Team</h3>
                        <button className="btn btn--outline btn--xs" onClick={() => setShowCareTeamModal(true)}>{Icons.plus} Assign</button>
                    </div>
                    <div className="cp-card__body">
                        {(!client.careTeam || client.careTeam.length === 0) ? (
                            <div className="cp-empty-state-card">
                                <div className="cp-empty-state-card__icon">{Icons.users}</div>
                                <p>No PCA assigned yet.</p>
                            </div>
                        ) : (
                            <ol className="cp-care-team-list">
                                {client.careTeam.map(m => (
                                    <li key={m.id} className="cp-care-team-item">
                                        <span className="cp-care-team-name">{m.employee.name}</span>
                                        <span className="cp-care-team-role">
                                            ({m.role === 'family_pca' ? 'Family' : 'Agency'})
                                        </span>
                                        <button className="btn btn--danger-ghost btn--icon cp-inline-action" title="Remove" onClick={() => handleRemoveCareTeam(m.id)}>
                                            {Icons.trash}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>

                {/* Emergency Contacts */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Emergency Contacts</h3>
                        <button className="btn btn--outline btn--xs" onClick={openEditClientModal}>{Icons.plus} Add Contact</button>
                    </div>
                    <div className="cp-card__body">
                        {!client.emergencyContactName && !client.secondaryEmergencyName ? (
                            <div className="cp-empty-state-card">
                                <div className="cp-empty-state-card__icon">{Icons.users}</div>
                                <p>No emergency contacts on file.</p>
                                <button className="btn btn--outline btn--sm" onClick={openEditClientModal}>Add Contact</button>
                            </div>
                        ) : (
                            <div className="cp-contact-list">
                                {client.emergencyContactName && (
                                    <div className="cp-contact-card">
                                        <div className="cp-contact-card__badge">Primary</div>
                                        <div className="cp-contact-card__name">{client.emergencyContactName}</div>
                                        {client.emergencyContactRelation && (
                                            <div className="cp-contact-card__relation">{client.emergencyContactRelation}</div>
                                        )}
                                        {client.emergencyContactPhone && (
                                            <div className="cp-contact-card__phone">
                                                {client.emergencyContactPhone}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {client.secondaryEmergencyName && (
                                    <div className="cp-contact-card">
                                        <div className="cp-contact-card__badge cp-contact-card__badge--secondary">Secondary</div>
                                        <div className="cp-contact-card__name">{client.secondaryEmergencyName}</div>
                                        {client.secondaryEmergencyRelation && (
                                            <div className="cp-contact-card__relation">{client.secondaryEmergencyRelation}</div>
                                        )}
                                        {client.secondaryEmergencyPhone && (
                                            <div className="cp-contact-card__phone">
                                                {client.secondaryEmergencyPhone}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Notes */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Notes</h3>
                        {!editingNotes ? (
                            <button className="btn btn--ghost btn--xs" onClick={() => setEditingNotes(true)}>{Icons.edit}</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn--outline btn--xs" onClick={() => { setEditingNotes(false); setNotesValue(client.notes || ''); }}>Cancel</button>
                                <button className="btn btn--primary btn--xs" onClick={handleSaveNotes}>Save</button>
                            </div>
                        )}
                    </div>
                    <div className="cp-card__body">
                        {editingNotes ? (
                            <textarea
                                value={notesValue}
                                onChange={(e) => setNotesValue(e.target.value)}
                                rows={4}
                                className="cp-notes-textarea"
                                placeholder="Add notes about this client..."
                            />
                        ) : (
                            <div className="cp-notes-content">
                                {notesValue ? notesValue.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <div key={i} className="cp-notes-line">
                                        <span className="cp-notes-bullet" />
                                        {line.replace(/^[-•]\s*/, '')}
                                    </div>
                                )) : <span className="cp-empty-text">No notes yet.</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* PCA Match Notes */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">PCA Match Notes</h3>
                        {!editingPcaNotes ? (
                            <button className="btn btn--ghost btn--xs" onClick={() => setEditingPcaNotes(true)}>{Icons.edit}</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn--outline btn--xs" onClick={() => { setEditingPcaNotes(false); setPcaNotesValue(client.pcaNotes || ''); }}>Cancel</button>
                                <button className="btn btn--primary btn--xs" onClick={handleSavePcaNotes}>Save</button>
                            </div>
                        )}
                    </div>
                    <div className="cp-card__body">
                        {editingPcaNotes ? (
                            <textarea
                                value={pcaNotesValue}
                                onChange={(e) => setPcaNotesValue(e.target.value)}
                                rows={4}
                                className="cp-notes-textarea"
                                placeholder="Notes about PCA matching preferences..."
                            />
                        ) : (
                            <div className="cp-notes-content">
                                {pcaNotesValue ? pcaNotesValue.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <div key={i} className="cp-notes-line">
                                        <span className="cp-notes-bullet" />
                                        {line.replace(/^[-•]\s*/, '')}
                                    </div>
                                )) : <span className="cp-empty-text">No PCA match notes yet.</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Caregiver Requirements */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Caregiver Requirements</h3>
                        {!editingCaregiverReqs ? (
                            <button className="btn btn--ghost btn--xs" onClick={() => setEditingCaregiverReqs(true)}>{Icons.edit}</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn--outline btn--xs" onClick={() => { setEditingCaregiverReqs(false); setCaregiverReqsValue(client.caregiverRequirements || ''); }}>Cancel</button>
                                <button className="btn btn--primary btn--xs" onClick={handleSaveCaregiverReqs}>Save</button>
                            </div>
                        )}
                    </div>
                    <div className="cp-card__body">
                        {editingCaregiverReqs ? (
                            <textarea
                                value={caregiverReqsValue}
                                onChange={(e) => setCaregiverReqsValue(e.target.value)}
                                rows={4}
                                className="cp-notes-textarea"
                                placeholder="Specific caregiver requirements..."
                            />
                        ) : (
                            <div className="cp-notes-content">
                                {caregiverReqsValue ? caregiverReqsValue.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <div key={i} className="cp-notes-line">
                                        <span className="cp-notes-bullet" />
                                        {line.replace(/^[-•]\s*/, '')}
                                    </div>
                                )) : <span className="cp-empty-text">No caregiver requirements specified.</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Services Required */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Main Services Required</h3>
                        {!editingMainServices ? (
                            <button className="btn btn--ghost btn--xs" onClick={() => setEditingMainServices(true)}>{Icons.edit}</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn--outline btn--xs" onClick={() => { setEditingMainServices(false); setMainServicesValue(client.mainServices || ''); }}>Cancel</button>
                                <button className="btn btn--primary btn--xs" onClick={handleSaveMainServices}>Save</button>
                            </div>
                        )}
                    </div>
                    <div className="cp-card__body">
                        {editingMainServices ? (
                            <textarea
                                value={mainServicesValue}
                                onChange={(e) => setMainServicesValue(e.target.value)}
                                rows={4}
                                className="cp-notes-textarea"
                                placeholder="Main services this client requires..."
                            />
                        ) : (
                            <div className="cp-notes-content">
                                {mainServicesValue ? mainServicesValue.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <div key={i} className="cp-notes-line">
                                        <span className="cp-notes-bullet" />
                                        {line.replace(/^[-•]\s*/, '')}
                                    </div>
                                )) : <span className="cp-empty-text">No main services specified.</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">Quick Stats</h3>
                    </div>
                    <div className="cp-card__body">
                        <div className="cp-stats-grid">
                            <div className="cp-stat">
                                <div className="cp-stat__value">{(client.authorizations || []).length}</div>
                                <div className="cp-stat__label">Authorizations</div>
                            </div>
                            <div className="cp-stat">
                                <div className="cp-stat__value">{(client.careTeam || []).length}</div>
                                <div className="cp-stat__label">Care Team</div>
                            </div>
                            <div className="cp-stat">
                                <div className="cp-stat__value">{totalDocs}</div>
                                <div className="cp-stat__label">Documents</div>
                            </div>
                            <div className="cp-stat">
                                <div className="cp-stat__value">{(client.hospitalVisits || []).length}</div>
                                <div className="cp-stat__label">Visits</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
