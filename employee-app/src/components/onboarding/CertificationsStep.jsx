import { useState, useRef } from 'react';

const STATUS_LABELS = {
    required: 'Required',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
};

export default function CertificationsStep({ requirements = [], onUpload }) {
    const certs = requirements.filter(r => r.kind === 'certification');
    const [expiryByReqId, setExpiryByReqId] = useState({});
    const inputRefs = useRef({});

    function handleFileChange(reqId, e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const expirationDate = expiryByReqId[reqId] || undefined;
        onUpload(reqId, file, expirationDate);
    }

    function triggerReplace(reqId) {
        if (inputRefs.current[reqId]) inputRefs.current[reqId].click();
    }

    if (certs.length === 0) {
        return (
            <div className="onboard-step">
                <h2 className="onboard-step-title">Certifications</h2>
                <p className="onboard-hint">No certifications required.</p>
            </div>
        );
    }

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Certifications</h2>
            <p className="onboard-hint">Upload a photo or PDF for each required certification.</p>
            {certs.map(req => {
                const done = req.status === 'submitted' || req.status === 'approved';
                return (
                    <div key={req.id} className="form-group">
                        <label>
                            {req.label}
                            {req.status && (
                                <span className={`onboard-chip onboard-chip--${req.status}`} style={{ marginLeft: 8 }}>
                                    {STATUS_LABELS[req.status] || req.status}
                                </span>
                            )}
                        </label>
                        {done ? (
                            <div className="onboard-upload-done">
                                <span className="onboard-upload-done__check">✓</span>
                                <span>{req.fileName ? `Uploaded: ${req.fileName}` : 'Uploaded'}</span>
                                <button type="button" className="btn btn--ghost btn--xs" onClick={() => triggerReplace(req.id)}>Replace</button>
                                <input
                                    ref={el => (inputRefs.current[req.id] = el)}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    capture="environment"
                                    hidden
                                    onChange={e => handleFileChange(req.id, e)}
                                />
                            </div>
                        ) : (
                            <>
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    capture="environment"
                                    onChange={e => handleFileChange(req.id, e)}
                                />
                                {req.requiresExpiry && (
                                    <input
                                        type="date"
                                        placeholder="Expiration date"
                                        style={{ marginTop: 8 }}
                                        value={expiryByReqId[req.id] || ''}
                                        onChange={e => setExpiryByReqId(prev => ({ ...prev, [req.id]: e.target.value }))}
                                    />
                                )}
                            </>
                        )}
                        {req.rejectionReason && (
                            <p className="onboard-error">{req.rejectionReason}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
