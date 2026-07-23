// BullMQ queue wrapper for replacement-offer timers.
//
// Redis is OPTIONAL. Production connects a Railway Redis service (REDIS_URL is
// auto-injected, same as the storage bucket); local dev, CI and Jest run
// without it. When REDIS_URL is absent this module degrades to a disabled
// no-op so nothing has to install Redis to run the app or the tests.
//
// Every function resolves rather than throws — Redis being unreachable must not
// fail the callout request that triggered the scheduling. A degraded queue
// returns falsy so callers can tell that nothing was actually scheduled,
// instead of assuming an offer will expire on its own.

const QUEUE_NAME = 'shift-replacement';

let queue = null;
let initialized = false;

function getQueue() {
    if (initialized) return queue;
    initialized = true;

    if (!process.env.REDIS_URL) {
        queue = null;
        return queue;
    }

    try {
        const { Queue } = require('bullmq');
        queue = new Queue(QUEUE_NAME, {
            connection: { url: process.env.REDIS_URL },
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 5000,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        });
    } catch (err) {
        console.error('[queue] failed to initialise BullMQ:', err.message);
        queue = null;
    }

    return queue;
}

function isEnabled() {
    return getQueue() !== null;
}

/**
 * Schedule a delayed job.
 *
 * @param {string} jobName
 * @param {object} data
 * @param {number} delayMs
 * @param {string} [jobId] stable id — BullMQ dedupes on it, so a retried
 *   trigger cannot double-schedule (and therefore cannot double-expire) an offer
 * @returns {Promise<object|null>} null when the queue is disabled or the
 *   enqueue failed, so callers can detect that nothing was scheduled
 */
async function schedule(jobName, data, delayMs, jobId) {
    const q = getQueue();
    if (!q) return null;

    try {
        return await q.add(jobName, data, {
            delay: delayMs,
            ...(jobId ? { jobId } : {}),
        });
    } catch (err) {
        console.error(`[queue] failed to schedule ${jobName}:`, err.message);
        return null;
    }
}

/**
 * Cancel a pending job — used when an offer is answered before it expires.
 * @returns {Promise<boolean>} false when the queue is disabled or the job has
 *   already run/been removed.
 */
async function cancel(jobId) {
    const q = getQueue();
    if (!q) return false;

    try {
        const job = await q.getJob(jobId);
        if (!job) return false;
        await job.remove();
        return true;
    } catch (err) {
        console.error(`[queue] failed to cancel ${jobId}:`, err.message);
        return false;
    }
}

/** Test seam — clears the memoised queue so REDIS_URL changes take effect. */
function _reset() {
    queue = null;
    initialized = false;
}

module.exports = { QUEUE_NAME, isEnabled, schedule, cancel, getQueue, _reset };
