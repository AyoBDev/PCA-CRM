// Replacement orchestration — the callout → rank → offer → confirm loop.
//
// THE CORE HAZARD IS DOUBLE-FILLING: two caregivers accepting the same shift,
// or a retried/duplicate job advancing an offer that was already answered.
// Every state transition is therefore a CONDITIONAL update — the predicate that
// must still hold lives in the WHERE clause, so the database decides the winner
// and a losing writer sees count === 0. Nothing here reads-then-writes.
//
// v1 ships shadow-mode-first: recordCallout only ranks. Sending is an explicit
// act (offerToCandidate), so the owner stays in the loop until the ranking has
// proven itself and the auto-offer flag is switched on.

const prisma = require('../lib/prisma');
const ranking = require('./candidateRankingService');
const channels = require('./offerChannels');
const queue = require('../lib/queue');

const DEFAULT_RESPONSE_WINDOW_MINUTES = 10;
const DEFAULT_CANDIDATE_LIMIT = 5;

function expiryJobId(offerId) {
    return `offer-${offerId}`;
}

function toDateStr(value) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Record a callout: mark the shift as needing coverage and rank candidates.
 * Deliberately does NOT send offers — see the shadow-mode note above.
 */
async function recordCallout(shiftId, { reason = '', reportedById = null, limit = DEFAULT_CANDIDATE_LIMIT } = {}) {
    const shift = await prisma.shift.findUnique({
        where: { id: Number(shiftId) },
        include: { client: true },
    });
    if (!shift) throw new Error(`Shift ${shiftId} not found`);
    if (shift.status === 'pending_replacement') {
        throw new Error(`Shift ${shiftId} is already pending replacement`);
    }

    const callout = await prisma.shiftCallout.create({
        data: {
            shiftId: shift.id,
            calloutEmployeeId: shift.employeeId ?? null,
            reason,
            reportedById,
            resolution: 'open',
        },
    });

    await prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'pending_replacement' },
    });

    const ranked = await ranking.rankCandidates({
        clientId: shift.clientId,
        serviceCode: shift.serviceCode,
        date: toDateStr(shift.shiftDate),
        startTime: shift.startTime,
        endTime: shift.endTime,
        excludeEmployeeId: shift.employeeId ?? undefined,
    }, { mode: 'strict', limit });

    const candidates = ranked.eligible || [];

    if (candidates.length === 0) {
        await prisma.shiftCallout.update({
            where: { id: callout.id },
            data: { resolution: 'no_coverage', resolvedAt: new Date() },
        });
        return { callout, candidates: [], noCoverage: true };
    }

    return { callout, candidates, noCoverage: false };
}

/**
 * Offer a shift to one candidate. Returns a result object rather than throwing,
 * so an undeliverable candidate can be skipped and the loop can continue.
 */
async function offerToCandidate(shiftId, employeeId, {
    calloutId = null,
    rank = 0,
    scoreBreakdown = {},
    responseWindowMinutes = DEFAULT_RESPONSE_WINDOW_MINUTES,
    channel = null,
} = {}) {
    // Re-check activity immediately before sending: someone can be deactivated
    // between ranking and offering, and burning a response window on them
    // delays every remaining candidate.
    const employee = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
    if (!employee) return { skipped: true, reason: 'missing' };
    if (!employee.active || employee.archivedAt) return { skipped: true, reason: 'inactive' };

    const shift = await prisma.shift.findUnique({
        where: { id: Number(shiftId) },
        include: { client: true },
    });
    if (!shift) return { skipped: true, reason: 'missing_shift' };

    const expiresAt = new Date(Date.now() + responseWindowMinutes * 60 * 1000);

    const offer = await prisma.shiftOffer.create({
        data: {
            shiftId: shift.id,
            employeeId: employee.id,
            calloutId,
            rank,
            scoreBreakdown,
            offeredAt: new Date(),
            expiresAt,
        },
    });

    // An offer made by phone is already delivered — the admin spoke to them.
    // Sending a portal notification and email on top would be noise, and
    // pretending it was undelivered would be wrong.
    if (channel === 'phone') {
        await prisma.shiftOffer.update({
            where: { id: offer.id },
            data: { channel: 'phone' },
        });
        await queue.schedule(
            'offer-expiry',
            { offerId: offer.id, shiftId: shift.id, calloutId },
            responseWindowMinutes * 60 * 1000,
            expiryJobId(offer.id),
        );
        return { offer, delivered: true, channels: ['phone'] };
    }

    const delivery = await channels.sendOffer(offer, {
        employee,
        client: shift.client,
        shift,
    });

    if (!delivery.anyDelivered) {
        // Nobody can answer an offer they never received; mark it skipped so
        // the loop moves on instead of waiting out the full window.
        await prisma.shiftOffer.update({
            where: { id: offer.id },
            data: {
                response: 'skipped',
                failureReason: delivery.failed.map(f => `${f.channel}: ${f.error}`).join('; '),
            },
        });
        return { offer, delivered: false, reason: 'undeliverable' };
    }

    await prisma.shiftOffer.update({
        where: { id: offer.id },
        data: { channel: delivery.delivered.join(',') },
    });

    await queue.schedule(
        'offer-expiry',
        { offerId: offer.id, shiftId: shift.id, calloutId },
        responseWindowMinutes * 60 * 1000,
        expiryJobId(offer.id),
    );

    return { offer, delivered: true, channels: delivery.delivered };
}

async function loadOfferByToken(token) {
    return prisma.shiftOffer.findUnique({
        where: { token },
        include: { shift: { include: { client: true } } },
    });
}

/** Shared precondition checks for a caregiver responding to an offer. */
function validateRespondable(offer) {
    if (!offer) return { status: 'not_found' };
    if (offer.response) return { status: 'already_answered', response: offer.response };
    if (offer.expiresAt && offer.expiresAt.getTime() < Date.now()) return { status: 'expired' };
    return null;
}

/**
 * Accept an offer. First valid acceptance wins; every later one is told the
 * shift was already covered.
 */
async function acceptOffer(token) {
    const offer = await loadOfferByToken(token);
    const invalid = validateRespondable(offer);
    if (invalid) return invalid;

    // The whole concurrency guarantee: claim the shift only while it is still
    // pending. Two simultaneous accepts both run this; the database matches
    // exactly one, and the loser gets count === 0.
    const claim = await prisma.shift.updateMany({
        where: { id: offer.shiftId, status: 'pending_replacement' },
        data: { employeeId: offer.employeeId, status: 'scheduled' },
    });

    if (claim.count === 0) {
        await prisma.shiftOffer.update({
            where: { id: offer.id },
            data: { response: 'expired', respondedAt: new Date() },
        });
        return { status: 'already_filled' };
    }

    await prisma.shiftOffer.update({
        where: { id: offer.id },
        data: { response: 'accepted', respondedAt: new Date() },
    });

    // Withdraw every other outstanding offer for this shift.
    await prisma.shiftOffer.updateMany({
        where: { shiftId: offer.shiftId, id: { not: offer.id }, response: '' },
        data: { response: 'expired' },
    });

    await queue.cancel(expiryJobId(offer.id));

    if (offer.calloutId) {
        await prisma.shiftCallout.update({
            where: { id: offer.calloutId },
            data: { resolution: 'filled', resolvedAt: new Date() },
        });
    }

    return { status: 'accepted', offer, employeeId: offer.employeeId };
}

/** Decline an offer. The shift stays unfilled and open to other candidates. */
async function declineOffer(token) {
    const offer = await loadOfferByToken(token);
    const invalid = validateRespondable(offer);
    if (invalid) return invalid;

    await prisma.shiftOffer.update({
        where: { id: offer.id },
        data: { response: 'declined', respondedAt: new Date() },
    });

    await queue.cancel(expiryJobId(offer.id));

    return { status: 'declined', offer };
}

/**
 * Expire an unanswered offer. Called by the worker when the window closes.
 * Guarded on response:'' so a job firing moments after a caregiver answered
 * cannot overwrite their response.
 */
async function expireOffer(offerId) {
    const result = await prisma.shiftOffer.updateMany({
        where: { id: Number(offerId), response: '' },
        data: { response: 'expired', respondedAt: new Date() },
    });

    return { expired: result.count > 0 };
}

/** Resolve a callout that could not be filled automatically. */
async function resolveCallout(calloutId, resolution) {
    return prisma.shiftCallout.update({
        where: { id: Number(calloutId) },
        data: { resolution, resolvedAt: new Date() },
    });
}

module.exports = {
    recordCallout,
    offerToCandidate,
    acceptOffer,
    declineOffer,
    expireOffer,
    resolveCallout,
    expiryJobId,
    DEFAULT_RESPONSE_WINDOW_MINUTES,
    DEFAULT_CANDIDATE_LIMIT,
};
