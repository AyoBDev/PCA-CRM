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

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

// One row in the requirement review list: label, current reviewStatus badge, and
// Approve/Reject controls. Reject reveals a required reason textarea before it
// will let the admin confirm.
function RequirementRow({ row, onDecide, busyId }) {
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');
    const busy = busyId === row.id;

    const confirmReject = () => {
        if (!reason.trim()) return;
        onDecide(row, 'rejected', reason.trim());
        setRejecting(false);
        setReason('');
    };

    return (
        <div className="orm-row">
            <div className="orm-row__main">
                <div className="orm-row__label">
                    {row.label}
                    {row.optional && <span className="orm-chip__opt">(optional)</span>}
                    {row.fileName && <span className="orm-row__file">{row.fileName}</span>}
                </div>
                <span className={`orm-chip orm-chip--${row.reviewStatus}`}>{STATUS_LABELS[row.reviewStatus] || row.reviewStatus}</span>
            </div>

            {row.reviewStatus === 'rejected' && row.rejectionReason && (
                <div className="orm-row__reason">Reason: {row.rejectionReason}</div>
            )}

            {!rejecting ? (
                <div className="orm-row__actions">
                    <button
                        className="btn btn--success btn--sm"
                        onClick={() => onDecide(row, 'approved')}
                        disabled={busy}
                    >
                        {Icons.checkCircle} Approve
                    </button>
                    <button
                        className="btn btn--danger btn--sm"
                        onClick={() => setRejecting(true)}
                        disabled={busy}
                    >
                        {Icons.alertCircle} Reject
                    </button>
                </div>
            ) : (
                <div className="orm-row__reject-form">
                    <textarea
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        autoFocus
                        placeholder="Reason for rejection (shown to the employee)…"
                    />
                    <div className="orm-row__actions">
                        <button className="btn btn--outline btn--sm" onClick={() => { setRejecting(false); setReason(''); }} disabled={busy}>
                            Cancel
                        </button>
                        <button className="btn btn--danger btn--sm" onClick={confirmReject} disabled={busy || !reason.trim()}>
                            Confirm Reject
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Modal shown when an admin clicks "Review" on a submitted employee. Lets the
// admin approve/reject each requirement individually, then finalize the review
// once every required item has a decision.
export default function OnboardingReviewModal({ employeeId, onClose, onResolved }) {
    const [data, setData] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null); // row currently saving a decision
    const [bulkBusy, setBulkBusy] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        let alive = true;
        api.getOnboardingReviewDetail(employeeId)
            .then((d) => {
                if (!alive) return;
                setData(d);
                setRows(d.requirements || []);
            })
            .catch(() => { if (alive) showToast('Could not load employee', 'error'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [employeeId, showToast]);

    async function decide(row, decision, reason) {
        setBusyId(row.id);
        try {
            await api.reviewRequirementItem(employeeId, row.id, decision, reason);
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reviewStatus: decision, rejectionReason: reason || '' } : r)));
        } catch (e) {
            showToast(e.message || 'Could not save decision', 'error');
        } finally {
            setBusyId(null);
        }
    }

    async function approveAllRemaining() {
        const pending = rows.filter((r) => !r.optional && r.reviewStatus === 'pending');
        if (pending.length === 0) return;
        setBulkBusy(true);
        try {
            await Promise.all(pending.map((r) => api.reviewRequirementItem(employeeId, r.id, 'approved')));
            const decidedIds = new Set(pending.map((r) => r.id));
            setRows((prev) => prev.map((r) => (decidedIds.has(r.id) ? { ...r, reviewStatus: 'approved' } : r)));
        } catch (e) {
            showToast(e.message || 'Could not approve remaining items', 'error');
        } finally {
            setBulkBusy(false);
        }
    }

    async function finishReview() {
        setFinishing(true);
        try {
            const { outcome } = await api.finalizeOnboarding(employeeId);
            showToast(outcome === 'approved' ? 'Approved & activated' : 'Sent back for changes', 'success');
            onResolved?.(employeeId);
            onClose();
        } catch (e) {
            showToast(e.message || 'Could not finish review', 'error');
        } finally {
            setFinishing(false);
        }
    }

    const emp = data?.employee;
    const av = data?.availability;
    const workingDays = av && av.weeklySchedule
        ? Object.keys(av.weeklySchedule).filter(d => av.weeklySchedule[d] && av.weeklySchedule[d].available)
        : [];

    const requiredRows = rows.filter((r) => !r.optional);
    const remainingRequired = requiredRows.filter((r) => r.reviewStatus === 'pending');
    const canFinish = requiredRows.length > 0 && remainingRequired.length === 0;
    const busy = busyId != null || bulkBusy || finishing;

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">{loading ? 'Loading…' : `Review — ${emp?.name}`}</h2>
            {!loading && emp && (
                <p className="modal__desc">Approve or reject each requirement, then finish the review.</p>
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
                        <div className="orm-row-list">
                            {rows.length === 0 && <span className="det-row__value">None assigned.</span>}
                            {rows.map((row) => (
                                <RequirementRow key={row.id} row={row} onDecide={decide} busyId={busyId} />
                            ))}
                        </div>
                    </DetSection>
                </div>
            )}

            {!loading && emp && (
                <div className="orm-actions">
                    <button
                        className="btn btn--outline"
                        onClick={approveAllRemaining}
                        disabled={busy || remainingRequired.length === 0}
                    >
                        Approve all remaining
                    </button>
                    <button
                        className="btn btn--success"
                        onClick={finishReview}
                        disabled={busy || !canFinish}
                    >
                        {Icons.checkCircle} Finish Review
                    </button>
                </div>
            )}
        </Modal>
    );
}
