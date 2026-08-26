export default function PoliciesStep({ requirements = [], onAck }) {
    const policies = requirements.filter(r => r.kind === 'policy');

    if (policies.length === 0) {
        return (
            <div className="onboard-step">
                <h2 className="onboard-step-title">Policies</h2>
                <p className="onboard-hint">No policies to acknowledge.</p>
            </div>
        );
    }

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Policies</h2>
            <p className="onboard-hint">Review each policy and confirm you agree.</p>
            {policies.map(req => {
                const acked = req.status === 'approved';
                // Locked only once the ADMIN has approved the ack (reviewStatus). A rejected
                // ack must stay re-checkable even though `status` is still 'approved' from
                // the employee's original ack, so the employee can re-acknowledge it.
                const locked = req.reviewStatus === 'approved';
                const checked = locked ? acked : (acked && req.reviewStatus !== 'rejected');
                return (
                    <div key={req.id} className="onboard-day-row" style={{ marginBottom: 8, flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <label className="onboard-day-toggle" style={{ minWidth: 0, flex: 1 }}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={locked}
                                    onChange={() => { if (!locked) onAck(req.id); }}
                                />
                                <span>{req.label}</span>
                            </label>
                            <span>I have read and agree</span>
                        </div>
                        {req.rejectionReason && (
                            <p className="onboard-error">{req.rejectionReason}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
