import Icons from '../../components/common/Icons';
import { AUTH_COLORS, DEFAULT_AUTH_COLOR, SERVICE_CODE_NAMES, getAuthSortKey } from '../../utils/constants';

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
    authGroups,
    formatDate,
    unitsToHours,
    openEditClientModal,
    totalDocs,
}) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-summary-grid">
                {/* Programs and Authorizations Overview */}
                <div className="cp-card cp-card--elevated">
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            <span className="cp-card__dot cp-card__dot--green" />
                            Programs and Authorizations Overview
                        </h3>
                    </div>
                    <div className="cp-card__body">
                        {Object.keys(authGroups).length === 0 ? (
                            <div className="cp-empty-state-card">
                                <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                                <p>No authorizations on file.</p>
                            </div>
                        ) : (
                            <div className="cp-auth-overview-list">
                                <div className="cp-auth-overview-list__header">
                                    <span>Service Name</span>
                                    <span>Code</span>
                                    <span>Auth #</span>
                                    <span>Start Date</span>
                                    <span>End Date</span>
                                </div>
                                {Object.entries(authGroups).sort(([a], [b]) => getAuthSortKey(a) - getAuthSortKey(b)).flatMap(([code, auths]) =>
                                    auths.filter(a => !a.archivedAt && (a.manualStatus || 'active') === 'active').map(a => {
                                        const colors = AUTH_COLORS[code] || DEFAULT_AUTH_COLOR;
                                        return (
                                            <div key={a.id} className="cp-auth-overview-row">
                                                <span className="cp-auth-overview-row__cell">{a.serviceName || SERVICE_CODE_NAMES[code] || a.serviceCategory || code}</span>
                                                <span className="cp-auth-overview-row__cell cp-auth-overview-row__code" style={{ color: colors.accent }}>{a.serviceCode || code}</span>
                                                <span className="cp-auth-overview-row__cell" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{a.authorizationNumber || '—'}</span>
                                                <span className="cp-auth-overview-row__cell">{formatDate(a.authorizationStartDate) || '—'}</span>
                                                <span className="cp-auth-overview-row__cell">{formatDate(a.authorizationEndDate) || '—'}</span>
                                            </div>
                                        );
                                    })
                                )}
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
