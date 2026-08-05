import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import * as api from '../../api';
import { useToast } from '../../hooks/useToast';
import Icons from '../common/Icons';

/* Card-style section, mirrors LeadDetailModal's det-section. */
function DetSection({ title, children }) {
    return (
        <div className="det-section">
            <div className="det-section__title">{title}</div>
            <div className="det-section__body">{children}</div>
        </div>
    );
}

function Row({ label, value }) {
    return (
        <div className="det-row">
            <span className="det-row__label">{label}</span>
            <span className="det-row__value">{value || '—'}</span>
        </div>
    );
}

const STATUS_LABELS = { required: 'Required', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

// Modal shown when an admin clicks "Review" on a submitted employee. Presents the
// employee's onboarding detail and lets the admin Accept, Reject, or Request Change.
export default function OnboardingReviewModal({ employeeId, onClose, onResolved }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState(null); // 'reject' | 'request' | null
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        let alive = true;
        api.getOnboardingReviewDetail(employeeId)
            .then((d) => { if (alive) setData(d); })
            .catch(() => { if (alive) showToast('Could not load employee', 'error'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [employeeId, showToast]);

    async function doAccept() {
        setBusy(true);
        try {
            await api.approveOnboarding(employeeId);
            showToast('Employee approved and activated', 'success');
            onResolved?.(employeeId);
            onClose();
        } catch (e) { showToast(e.message || 'Approve failed', 'error'); }
        finally { setBusy(false); }
    }

    async function doDecision() {
        setBusy(true);
        try {
            if (mode === 'reject') await api.rejectOnboarding(employeeId, note);
            else await api.requestOnboardingChange(employeeId, note);
            showToast(mode === 'reject' ? 'Sent back — employee notified' : 'Change requested — employee notified', 'success');
            onResolved?.(employeeId);
            onClose();
        } catch (e) { showToast(e.message || 'Action failed', 'error'); }
        finally { setBusy(false); }
    }

    const emp = data?.employee;
    const av = data?.availability;
    const workingDays = av && av.weeklySchedule
        ? Object.keys(av.weeklySchedule).filter(d => av.weeklySchedule[d] && av.weeklySchedule[d].available)
        : [];

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{loading ? 'Loading…' : `Review — ${emp?.name}`}</h2>
            {!loading && emp && (
                <p className="modal__desc">Review this new hire's onboarding, then accept, request changes, or reject.</p>
            )}

            {loading ? (
                <p className="lead-reminders__loading">Loading…</p>
            ) : !emp ? (
                <p className="onboard-error">Employee not found.</p>
            ) : (
                <div className="onboard-review-modal">
                    <DetSection title="Personal Information">
                        <Row label="Email" value={emp.email} />
                        <Row label="Phone" value={emp.phone} />
                        <Row label="Address" value={emp.address} />
                        <Row label="Date of Birth" value={emp.dob} />
                        <Row label="Gender" value={emp.gender} />
                        <Row label="Preferred Language" value={emp.preferredLanguage} />
                    </DetSection>

                    <DetSection title="Emergency Contact">
                        <Row label="Name" value={emp.emergencyContactName} />
                        <Row label="Relationship" value={emp.emergencyContactRelationship} />
                        <Row label="Phone" value={emp.emergencyContactPhone} />
                        <Row label="Email" value={emp.emergencyContactEmail} />
                    </DetSection>

                    <DetSection title="Availability">
                        <Row label="Available from" value={av?.availableFrom ? new Date(av.availableFrom).toLocaleDateString() : '—'} />
                        <Row label="Working days" value={workingDays.length ? workingDays.map(d => DAY_LABELS[d] || d).join(', ') : '—'} />
                        <Row label="Max hours / week" value={av?.maxHoursPerWeek} />
                        <Row label="Transportation" value={av?.transportation} />
                    </DetSection>

                    <DetSection title="Requirements">
                        <div className="onboard-chip-list">
                            {(data.requirements || []).length === 0 && <span className="det-row__value">None assigned.</span>}
                            {(data.requirements || []).map(r => (
                                <span key={r.id} className={`onboard-chip onboard-chip--${r.status}`} title={r.label}>
                                    {r.label}: {STATUS_LABELS[r.status] || r.status}{r.optional ? ' (optional)' : ''}
                                </span>
                            ))}
                        </div>
                    </DetSection>

                    {mode && (
                        <div className="form-group">
                            <label>{mode === 'reject' ? 'Reason for rejection' : 'What needs to change?'} (shown to the employee)</label>
                            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} autoFocus placeholder="Add a note the employee will see when they return to onboarding…" />
                        </div>
                    )}
                </div>
            )}

            {!loading && emp && (
                <div className="tsv2-review-actions">
                    {!mode ? (
                        <>
                            <button className="btn--reject" onClick={() => setMode('reject')} disabled={busy}>
                                <span className="tsv2-btn-icon">{Icons.alertCircle}</span> Reject
                            </button>
                            <button className="btn--sendback" onClick={() => setMode('request')} disabled={busy}>
                                <span className="tsv2-btn-icon">{Icons.rotateCcw}</span> Request Change
                            </button>
                            <button className="btn btn--success" onClick={doAccept} disabled={busy}>
                                <span className="tsv2-btn-icon">{Icons.checkCircle}</span> Accept
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn btn--outline" onClick={() => { setMode(null); setNote(''); }} disabled={busy}>Back</button>
                            <button
                                className={mode === 'reject' ? 'btn--reject' : 'btn--sendback'}
                                onClick={doDecision}
                                disabled={busy || !note.trim()}
                            >
                                {mode === 'reject' ? 'Confirm Reject' : 'Send Change Request'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
