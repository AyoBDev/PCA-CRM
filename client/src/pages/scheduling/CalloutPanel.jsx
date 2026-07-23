import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Modal from '../../components/common/Modal';
import { useToast } from '../../hooks/useToast';
import { hhmm12 } from '../../utils/time';
import { formatDate } from '../../utils/dates';

/**
 * Records a caregiver calling out of a shift, then shows the ranked
 * replacement candidates with a one-click Offer per row.
 *
 * v1 is shadow-mode-first: recording a callout only RANKS. Nothing is sent
 * until the owner picks someone, so the ranking can be judged against real
 * callouts before any automation is switched on. Each row shows why it ranked
 * where it did, which is what makes that judgement possible.
 */
export default function CalloutPanel({ shift, employees, onClose, onShiftChanged, undoState }) {
    const { showToast } = useToast();

    const [stage, setStage] = useState('record'); // 'record' | 'candidates'
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [callout, setCallout] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [offers, setOffers] = useState([]);
    const [offeringId, setOfferingId] = useState(null);

    const employeeName = shift?.employee?.name || shift?.displayEmployeeName || 'Unassigned';

    const loadOffers = useCallback(async () => {
        if (!shift?.id) return;
        try {
            setOffers(await api.listShiftOffers(shift.id));
        } catch {
            /* offer history is supplementary — never block the panel on it */
        }
    }, [shift?.id]);

    // A shift already pending replacement re-opens straight into the candidate
    // list rather than asking the user to record a callout twice.
    useEffect(() => {
        if (shift?.status !== 'pending_replacement') return;
        setStage('candidates');
        (async () => {
            try {
                const ranked = await api.getReplacementCandidates(shift.id);
                setCandidates(ranked.eligible || []);
                if (ranked.callout) setCallout(ranked.callout);
            } catch (err) {
                showToast(err.message || 'Could not load candidates', 'error');
            }
        })();
        loadOffers();
    }, [shift?.id, shift?.status, loadOffers, showToast]);

    const handleRecordCallout = async () => {
        setSaving(true);
        try {
            const result = await api.recordCallout(shift.id, { reason });
            setCallout(result.callout);
            setCandidates(result.candidates || []);
            setStage('candidates');
            onShiftChanged?.({ ...shift, status: 'pending_replacement' });

            showToast(
                result.noCoverage
                    ? 'Callout recorded — no eligible replacements found'
                    : `Callout recorded — ${result.candidates.length} candidate${result.candidates.length === 1 ? '' : 's'} found`,
                result.noCoverage ? 'error' : 'success',
            );

            const calloutId = result.callout.id;
            undoState?.pushAction(
                'Record callout',
                async () => {
                    // Reverse both halves: the shift returns to scheduled AND the
                    // callout is cancelled, or the DB keeps an orphaned open callout.
                    await api.resolveCallout(calloutId, 'cancelled');
                    const restored = await api.updateShift(shift.id, { status: 'scheduled' });
                    onShiftChanged?.(restored);
                    onClose();
                },
                async () => {
                    const redone = await api.recordCallout(shift.id, { reason });
                    setCallout(redone.callout);
                    setCandidates(redone.candidates || []);
                    onShiftChanged?.({ ...shift, status: 'pending_replacement' });
                },
            );
        } catch (err) {
            showToast(err.message || 'Could not record callout', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleOffer = async (candidate) => {
        setOfferingId(candidate.employeeId);
        try {
            const result = await api.createShiftOffer(shift.id, {
                employeeId: candidate.employeeId,
                calloutId: callout?.id ?? null,
                rank: candidate.rank,
                scoreBreakdown: candidate.scoreBreakdown || {},
            });
            showToast(`Offer sent to ${candidate.employeeName}`, 'success');
            await loadOffers();

            const offerId = result.offer?.id;
            undoState?.pushAction(
                `Offer shift to ${candidate.employeeName}`,
                async () => {
                    // Withdrawing an offer is a resolve-to-cancelled on the offer's
                    // own row; there is no un-send, so the record is closed rather
                    // than deleted — it stays in the compliance trail.
                    if (offerId) await api.resolveCallout(callout?.id ?? offerId, 'cancelled');
                    await loadOffers();
                },
                async () => {
                    await api.createShiftOffer(shift.id, {
                        employeeId: candidate.employeeId,
                        calloutId: callout?.id ?? null,
                        rank: candidate.rank,
                        scoreBreakdown: candidate.scoreBreakdown || {},
                    });
                    await loadOffers();
                },
            );
        } catch (err) {
            showToast(err.message || 'Could not send offer', 'error');
        } finally {
            setOfferingId(null);
        }
    };

    // Records an answer the office took by phone. The caregiver never touches
    // the app — the admin who spoke to them logs what was said, so the offer
    // trail matches reality instead of sitting at "awaiting reply" forever.
    const handleRecordPhoneResponse = async (offer, response) => {
        setOfferingId(offer.employeeId);
        try {
            await api.recordOfferResponse(shift.id, offer.id, response, `Recorded by phone`);
            showToast(response === 'accept' ? 'Shift covered' : 'Decline recorded', 'success');
            await loadOffers();
            if (response === 'accept') {
                onShiftChanged?.();
                onClose();
            }
        } catch (err) {
            showToast(err.message || 'Could not record response', 'error');
            await loadOffers();
        } finally {
            setOfferingId(null);
        }
    };

    // Offer a shift to someone the office already phoned — logs it without
    // sending a portal notification and email they do not need.
    const handleLogPhoneOffer = async (candidate) => {
        setOfferingId(candidate.employeeId);
        try {
            await api.createShiftOffer(shift.id, {
                employeeId: candidate.employeeId,
                calloutId: callout?.id ?? null,
                rank: candidate.rank,
                scoreBreakdown: candidate.scoreBreakdown || {},
                channel: 'phone',
            });
            showToast(`Logged call to ${candidate.employeeName}`, 'success');
            await loadOffers();
        } catch (err) {
            showToast(err.message || 'Could not log call', 'error');
        } finally {
            setOfferingId(null);
        }
    };

    const offeredIds = new Set(offers.map(o => o.employeeId));

    return (
        <Modal onClose={onClose} wide>
            <h3 className="modal__title">
                {stage === 'record' ? 'Record callout' : 'Find a replacement'}
            </h3>
            <p className="modal__desc">
                {shift?.client?.clientName} · {formatDate(shift?.shiftDate)} · {hhmm12(shift?.startTime)}–{hhmm12(shift?.endTime)}
                {stage === 'record' && <> · currently {employeeName}</>}
            </p>

            {stage === 'record' && (
                <>
                    <div className="form-group">
                        <label htmlFor="calloutReason">Reason <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>(optional)</span></label>
                        <input
                            id="calloutReason"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Sick, car trouble, family emergency…"
                            autoComplete="off"
                        />
                    </div>
                    <div className="modal__actions">
                        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn--primary" onClick={handleRecordCallout} disabled={saving}>
                            {saving ? 'Recording…' : 'Record callout & find cover'}
                        </button>
                    </div>
                </>
            )}

            {stage === 'candidates' && (
                <>
                    {/* Why cover is needed. The reason used to be write-only —
                        captured on the callout and never shown to the person
                        acting on it. */}
                    {callout && (callout.reason || callout.calloutEmployee) && (
                        <div style={{
                            padding: '10px 14px', marginBottom: 12, borderRadius: 'var(--radius)',
                            background: 'hsl(var(--warning-bg))',
                            borderLeft: '3px solid hsl(var(--warning))',
                            fontSize: 13,
                        }}>
                            <strong>{callout.calloutEmployee?.name || employeeName}</strong>
                            {' called out'}
                            {callout.reason ? <> — {callout.reason}</> : null}
                            {callout.calloutEmployee?.phone && (
                                <a href={`tel:${callout.calloutEmployee.phone}`} style={{ marginLeft: 8, color: 'hsl(var(--primary))' }}>
                                    {callout.calloutEmployee.phone}
                                </a>
                            )}
                        </div>
                    )}

                    {candidates.length === 0 ? (
                        <div style={{
                            padding: 20, textAlign: 'center', borderRadius: 'var(--radius)',
                            background: 'hsl(var(--danger-bg))', color: 'hsl(var(--danger))',
                            fontSize: 13, fontWeight: 500,
                        }}>
                            No eligible replacements found. This shift needs manual coverage.
                        </div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table data-table--compact">
                                <thead>
                                    <tr>
                                        <th scope="col">#</th>
                                        <th scope="col">Caregiver</th>
                                        <th scope="col">Contact</th>
                                        <th scope="col">Distance</th>
                                        <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {candidates.map(c => {
                                        const alreadyOffered = offeredIds.has(c.employeeId);
                                        return (
                                            <tr key={c.employeeId}>
                                                <td style={{ color: 'hsl(var(--muted-foreground))' }}>{c.rank}</td>
                                                <td style={{ fontWeight: 500 }}>
                                                    {c.employeeName}
                                                    {c.onCareTeam && (
                                                        <span style={{
                                                            marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                                                            fontSize: 10, fontWeight: 600,
                                                            background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))',
                                                        }}>Care team</span>
                                                    )}
                                                </td>
                                                {/* Click-to-call and click-to-email: most replacements are
                                                    arranged by phone, and looking the number up elsewhere
                                                    is the slow part of that. */}
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {c.phone
                                                        ? <a href={`tel:${c.phone}`} style={{ color: 'hsl(var(--primary))', fontSize: 12 }}>{c.phone}</a>
                                                        : <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>no phone</span>}
                                                    {c.email && (
                                                        <>
                                                            <br />
                                                            <a href={`mailto:${c.email}`} style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>{c.email}</a>
                                                        </>
                                                    )}
                                                </td>
                                                <td style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                    {c.distanceMiles == null ? '—' : `${c.distanceMiles.toFixed(1)} mi`}
                                                </td>
                                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {alreadyOffered ? (
                                                        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Offered</span>
                                                    ) : (
                                                        <div style={{ display: 'inline-flex', gap: 4 }}>
                                                            <button
                                                                type="button"
                                                                className="btn btn--sm btn--primary"
                                                                onClick={() => handleOffer(c)}
                                                                disabled={offeringId === c.employeeId}
                                                            >
                                                                {offeringId === c.employeeId ? 'Sending…' : 'Offer'}
                                                            </button>
                                                            {/* For when the office rings round instead of
                                                                sending: logs the offer with no notification. */}
                                                            <button
                                                                type="button"
                                                                className="btn btn--sm btn--outline"
                                                                onClick={() => handleLogPhoneOffer(c)}
                                                                disabled={offeringId === c.employeeId}
                                                                title="Log that you phoned this caregiver, without sending a notification"
                                                            >
                                                                Log call
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {offers.length > 0 && (
                        <OfferHistory
                            offers={offers}
                            employees={employees}
                            respondingId={offeringId}
                            onRecordResponse={handleRecordPhoneResponse}
                        />
                    )}

                    <div className="modal__actions">
                        <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
                    </div>
                </>
            )}
        </Modal>
    );
}

const RESPONSE_STYLES = {
    accepted: { label: 'Accepted', color: 'hsl(var(--success))', bg: 'hsl(var(--success-bg))' },
    declined: { label: 'Declined', color: 'hsl(var(--danger))', bg: 'hsl(var(--danger-bg))' },
    expired:  { label: 'Expired',  color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted))' },
    skipped:  { label: 'Not sent', color: 'hsl(var(--warning))', bg: 'hsl(var(--warning-bg))' },
};

/** The compliance trail: who was offered this shift, in what order, and when. */
function OfferHistory({ offers, employees, onRecordResponse, respondingId }) {
    const nameById = new Map((employees || []).map(e => [e.id, e.name]));

    return (
        <div style={{ marginTop: 16 }}>
            <h4 style={{
                margin: '0 0 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))',
            }}>
                Offer history
            </h4>
            <div className="table-scroll">
                <table className="data-table data-table--compact">
                    <thead>
                        <tr>
                            <th scope="col">Caregiver</th>
                            <th scope="col">Sent</th>
                            <th scope="col">Via</th>
                            <th scope="col">Response</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offers.map(o => {
                            const style = RESPONSE_STYLES[o.response] || { label: 'Awaiting reply', color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)' };
                            return (
                                <tr key={o.id}>
                                    <td style={{ fontWeight: 500 }}>{o.employee?.name || nameById.get(o.employeeId) || `#${o.employeeId}`}</td>
                                    <td style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {o.offeredAt ? new Date(o.offeredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td style={{ color: 'hsl(var(--muted-foreground))' }}>{o.channel || '—'}</td>
                                    {/* An unanswered offer shows the two buttons in place of a
                                        status badge — the office can record what they were told
                                        on the phone without a separate column for it. */}
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {!o.response && onRecordResponse ? (
                                            <div style={{ display: 'inline-flex', gap: 4 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn--sm btn--primary"
                                                    disabled={respondingId === o.employeeId}
                                                    onClick={() => onRecordResponse(o, 'accept')}
                                                    title="Record that this caregiver accepted, e.g. by phone"
                                                >
                                                    Accepted
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn--sm btn--outline"
                                                    disabled={respondingId === o.employeeId}
                                                    onClick={() => onRecordResponse(o, 'decline')}
                                                    title="Record that this caregiver declined, e.g. by phone"
                                                >
                                                    Declined
                                                </button>
                                            </div>
                                        ) : (
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                background: style.bg, color: style.color,
                                            }}>{style.label}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
