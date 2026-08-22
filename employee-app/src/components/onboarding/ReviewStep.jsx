const STATUS_LABELS = {
    required: 'Required',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
};

const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

// Step indices (mirror OnboardingPage STEPS) so "Edit" links jump to the right screen.
const STEP = { password: 0, personal: 1, emergency: 2, schedule: 3 };

// Mirrors server isOnboardingComplete(): optional items never gate; a policy is
// satisfied only when approved; a document/certification when submitted OR approved.
function isRequirementSatisfied(r) {
    if (r.kind === 'policy') return r.status === 'approved';
    return r.status === 'submitted' || r.status === 'approved';
}
function blocksSubmit(r) {
    return !r.optional && !isRequirementSatisfied(r);
}

function EditLink({ onClick }) {
    return <button type="button" className="onboard-review__edit" onClick={onClick}>Edit</button>;
}

export default function ReviewStep({ requirements = [], personal = {}, emergency = {}, availability = {}, hasPassword = true, onSubmit, onEditStep }) {
    const complete = !requirements.some(blocksSubmit);
    const days = availability.weeklySchedule || {};
    const workingDays = Object.keys(days).filter(d => days[d] && days[d].available);

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Review &amp; Submit</h2>
            <p className="onboard-hint">Please review everything below before submitting.</p>

            {/* Password guard — password isn't stored until submit, so after a reload it
                may be empty; give a one-click way back to set it. */}
            {!hasPassword && (
                <div className="onboard-review__warn">
                    You need to set your password before submitting.
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => onEditStep?.(STEP.password)}>
                        Set password
                    </button>
                </div>
            )}

            <section className="onboard-review__section">
                <div className="onboard-review__head">
                    <h3 className="onboard-section-label">Personal Information</h3>
                    <EditLink onClick={() => onEditStep?.(STEP.personal)} />
                </div>
                <dl className="onboard-review__grid">
                    <dt>Address</dt><dd>{personal.address || '—'}</dd>
                    <dt>Date of Birth</dt><dd>{personal.dob || '—'}</dd>
                    <dt>Gender</dt><dd>{personal.gender || '—'}</dd>
                    <dt>Preferred Language</dt><dd>{personal.preferredLanguage || '—'}</dd>
                </dl>
            </section>

            <section className="onboard-review__section">
                <div className="onboard-review__head">
                    <h3 className="onboard-section-label">Emergency Contact</h3>
                    <EditLink onClick={() => onEditStep?.(STEP.emergency)} />
                </div>
                <dl className="onboard-review__grid">
                    <dt>Name</dt><dd>{emergency.emergencyContactName || '—'}</dd>
                    <dt>Relationship</dt><dd>{emergency.emergencyContactRelationship || '—'}</dd>
                    <dt>Phone</dt><dd>{emergency.emergencyContactPhone || '—'}</dd>
                    <dt>Email</dt><dd>{emergency.emergencyContactEmail || '—'}</dd>
                </dl>
            </section>

            <section className="onboard-review__section">
                <div className="onboard-review__head">
                    <h3 className="onboard-section-label">Availability</h3>
                    <EditLink onClick={() => onEditStep?.(STEP.schedule)} />
                </div>
                <dl className="onboard-review__grid">
                    <dt>Available from</dt><dd>{availability.availableFrom || '—'}</dd>
                    <dt>Working days</dt>
                    <dd>{workingDays.length ? workingDays.map(d => DAY_LABELS[d] || d).join(', ') : '—'}</dd>
                    <dt>Max hours / week</dt><dd>{availability.maxHoursPerWeek ?? '—'}</dd>
                    <dt>Transportation</dt><dd>{availability.transportation || '—'}</dd>
                </dl>
            </section>

            <section className="onboard-review__section">
                <h3 className="onboard-section-label">Requirements</h3>
                <div className="onboard-chip-list">
                    {requirements.length === 0 && <span className="onboard-hint">No requirements assigned.</span>}
                    {requirements.map(req => {
                        const satisfied = isRequirementSatisfied(req);
                        return (
                            <span key={req.id} className={`onboard-chip onboard-chip--${req.status}`} title={req.label}>
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
            </section>

            {!complete && (
                <p className="onboard-error">Please complete all required items before submitting.</p>
            )}

            <div className="onboard-actions">
                <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={!complete || !hasPassword}>
                    Submit
                </button>
            </div>
        </div>
    );
}
