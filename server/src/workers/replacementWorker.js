// Offer-expiry worker — advances the replacement loop when a response window
// closes with no answer.
//
// Must be safe to run twice on the same job: BullMQ retries on failure, and a
// duplicate escalation could put the same shift in front of two caregivers at
// once. Every early-return below is a guard against that.

const prisma = require('../lib/prisma');
const queue = require('../lib/queue');
const replacement = require('../services/replacementService');
const ranking = require('../services/candidateRankingService');
const settings = require('../services/replacementSettings');

function toDateStr(value) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Expire an unanswered offer and offer the shift to the next candidate.
 * Resolves quietly on any condition that means the loop should stop.
 */
async function handleOfferExpiry({ offerId, shiftId, calloutId }) {
    // Guarded on response:'' inside expireOffer — if the caregiver answered
    // just before the timer fired, this returns false and we stop, leaving
    // their response intact.
    const { expired } = await replacement.expireOffer(offerId);
    if (!expired) return;

    // Expiring the offer above is bookkeeping and always happens. Continuing
    // the chain is messaging, so it is gated: a flag switched off mid-chain
    // must stop further offers going out, not just prevent new chains.
    const { autoOfferEnabled, responseWindowMinutes } = await settings.getReplacementSettings();
    if (!autoOfferEnabled) return;

    const shift = await prisma.shift.findUnique({ where: { id: Number(shiftId) } });
    if (!shift) return;
    if (shift.status !== 'pending_replacement') return; // already covered

    if (calloutId) {
        const callout = await prisma.shiftCallout.findUnique({ where: { id: Number(calloutId) } });
        if (!callout || callout.resolution !== 'open') return;
    }

    // Re-rank rather than reusing the ordering from callout time: availability
    // moves while a window is open, and someone free ten minutes ago may be
    // booked now.
    const ranked = await ranking.rankCandidates({
        clientId: shift.clientId,
        serviceCode: shift.serviceCode,
        date: toDateStr(shift.shiftDate),
        startTime: shift.startTime,
        endTime: shift.endTime,
        excludeEmployeeId: shift.employeeId ?? undefined,
    }, { mode: 'strict' });

    const alreadyOffered = new Set(
        (await prisma.shiftOffer.findMany({
            where: { shiftId: shift.id },
            select: { employeeId: true },
        })).map(o => o.employeeId),
    );

    const remaining = (ranked.eligible || []).filter(c => !alreadyOffered.has(c.employeeId));

    for (const candidate of remaining) {
        const result = await replacement.offerToCandidate(shift.id, candidate.employeeId, {
            calloutId,
            rank: candidate.rank,
            scoreBreakdown: candidate.scoreBreakdown || {},
            responseWindowMinutes,
        });
        // A candidate who went inactive or could not be reached must not
        // consume the escalation — keep going until someone is actually asked.
        if (result.delivered) return;
    }

    if (calloutId) {
        await replacement.resolveCallout(calloutId, 'no_coverage');
    }
}

/**
 * Start the BullMQ worker. No-op when Redis is not configured, so local dev and
 * tests run without it.
 */
function startWorker() {
    if (!queue.isEnabled()) {
        console.log('[replacementWorker] REDIS_URL not set — offer expiry timers are disabled');
        return null;
    }

    const { Worker } = require('bullmq');
    // Same connection config as the queue — an ioredis instance from the URL
    // string, not { url }, which ioredis would ignore.
    const worker = new Worker(
        queue.QUEUE_NAME,
        async (job) => {
            if (job.name === 'offer-expiry') return handleOfferExpiry(job.data);
            return undefined;
        },
        { connection: queue.createConnection() },
    );

    worker.on('failed', (job, err) => {
        console.error(`[replacementWorker] job ${job?.id} failed:`, err.message);
    });

    return worker;
}

module.exports = { handleOfferExpiry, startWorker };
