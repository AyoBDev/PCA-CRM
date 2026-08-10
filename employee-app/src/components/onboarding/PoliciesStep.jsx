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
                return (
                    <div key={req.id} className="onboard-day-row" style={{ marginBottom: 8 }}>
                        <label className="onboard-day-toggle" style={{ minWidth: 0, flex: 1 }}>
                            <input
                                type="checkbox"
                                checked={acked}
                                disabled={acked}
                                onChange={() => { if (!acked) onAck(req.id); }}
                            />
                            <span>{req.label}</span>
                        </label>
                        <span>I have read and agree</span>
                    </div>
                );
            })}
        </div>
    );
}
