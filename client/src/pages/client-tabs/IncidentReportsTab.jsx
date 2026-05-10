import Icons from '../../components/common/Icons';

export default function IncidentReportsTab({
    client,
    openIncidentModal,
    handleResolveIncident,
    setConfirmDelete,
    formatDate,
}) {
    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Incident Reporting</h3>
                    <button className="btn btn--primary btn--sm" onClick={() => openIncidentModal()}>{Icons.plus} Report Incident</button>
                </div>
                <div className="cp-card__body">
                    {(!client.incidents || client.incidents.length === 0) ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.checkCircle}</div>
                            <p>No incidents reported.</p>
                        </div>
                    ) : (
                        <div className="cp-incident-list">
                            {client.incidents.map(inc => (
                                <div key={inc.id} className={`cp-incident-entry ${inc.status === 'open' ? 'cp-incident-entry--open' : 'cp-incident-entry--resolved'}`}>
                                    <div className="cp-incident-entry__icon">
                                        {inc.status === 'open' ? Icons.alertCircle : Icons.checkCircle}
                                    </div>
                                    <div className="cp-incident-entry__content">
                                        <div className="cp-incident-entry__top">
                                            <div className="cp-incident-entry__title">{inc.description || 'Incident'}</div>
                                            <span className={`ts-badge ts-badge--${inc.status === 'resolved' ? 'submitted' : 'draft'}`}>
                                                {inc.status === 'resolved' ? 'RESOLVED' : 'OPEN'}
                                            </span>
                                        </div>
                                        <div className="cp-incident-entry__meta">
                                            {formatDate(inc.incidentDate)}
                                            {inc.severity && <> &bull; <span style={{ textTransform: 'capitalize' }}>{inc.severity}</span></>}
                                            {inc.reportedBy && <> &bull; Reported by {inc.reportedBy}</>}
                                        </div>
                                        {inc.notes && (
                                            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{inc.notes}</div>
                                        )}
                                    </div>
                                    <div className="cp-incident-entry__actions">
                                        {inc.status === 'open' && (
                                            <button className="btn btn--success btn--xs" title="Resolve" onClick={() => handleResolveIncident(inc)}>{Icons.checkCircle} Resolve</button>
                                        )}
                                        <button className="btn btn--ghost btn--icon" title="Edit" onClick={() => openIncidentModal(inc)}>{Icons.edit}</button>
                                        <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'incident', item: inc })}>{Icons.trash}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
