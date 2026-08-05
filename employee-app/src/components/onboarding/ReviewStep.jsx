const STATUS_LABELS = {
    required: 'Required',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
};

// Mirrors server isOnboardingComplete() in server/src/services/requirementService.js exactly:
// optional items never gate; a policy is satisfied only when approved; a
// document/certification is satisfied when submitted OR approved.
function isRequirementSatisfied(r) {
    if (r.kind === 'policy') return r.status === 'approved';
    return r.status === 'submitted' || r.status === 'approved';
}

// Whether a requirement blocks submission. Optional items never do — the
// employee can upload them later from their Profile.
function blocksSubmit(r) {
    return !r.optional && !isRequirementSatisfied(r);
}

export default function ReviewStep({ requirements = [], personal, emergency, onSubmit }) {
    const complete = !requirements.some(blocksSubmit);

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Review & Submit</h2>

            <h3 className="onboard-section-label">Personal Information</h3>
            <p className="onboard-hint">
                {personal?.address || 'No address provided'}
                {personal?.dob ? ` · DOB ${personal.dob}` : ''}
            </p>

            <h3 className="onboard-section-label">Emergency Contact</h3>
            <p className="onboard-hint">
                {emergency?.emergencyContactName || 'No emergency contact provided'}
                {emergency?.emergencyContactPhone ? ` · ${emergency.emergencyContactPhone}` : ''}
            </p>

            <h3 className="onboard-section-label">Requirements</h3>
            <div className="onboard-chip-list">
                {requirements.map(req => {
                    const satisfied = isRequirementSatisfied(req);
                    return (
                        <span
                            key={req.id}
                            className={`onboard-chip onboard-chip--${req.status}`}
                            title={req.label}
                        >
                            {req.label}: {STATUS_LABELS[req.status] || req.status}
                            {req.optional && !satisfied && ' (optional)'}
                            {blocksSubmit(req) && ' ⚠'}
                        </span>
                    );
                })}
            </div>
            {requirements.some(r => r.optional && !isRequirementSatisfied(r)) && (
                <p className="onboard-hint">Optional items can be completed later from your profile.</p>
            )}

            {!complete && (
                <p className="onboard-error">Please complete all required items before submitting.</p>
            )}

            <div className="onboard-actions">
                <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={!complete}>
                    Submit
                </button>
            </div>
        </div>
    );
}
