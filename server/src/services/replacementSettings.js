// Feature flag and tuning for the replacement workflow.
//
// Reuses the existing WorkflowTrigger row (type 'shift_replacement') rather
// than inventing a new flag mechanism — it already has `enabled`, a numeric
// field, and admin UI on the workflow-triggers page.
//
//   enabled       -> auto-offering on/off
//   thresholdDays -> responseWindowMinutes (the field is generic; only its
//                    name is day-flavoured, which is why it is mapped here
//                    rather than read directly by callers)
//
// FAILS CLOSED. A missing row, an unusable value, or a database error all
// yield autoOfferEnabled: false. Failing open would mean a query error starts
// messaging caregivers on the agency's behalf — the expensive direction of a
// wrong guess.

const prisma = require('../lib/prisma');

const TRIGGER_TYPE = 'shift_replacement';
const DEFAULT_RESPONSE_WINDOW_MINUTES = 10;
const CACHE_TTL_MS = 30_000;

let cache = null;
let cachedAt = 0;

/**
 * @returns {Promise<{autoOfferEnabled: boolean, responseWindowMinutes: number}>}
 */
async function getReplacementSettings() {
    if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

    let row = null;
    try {
        row = await prisma.workflowTrigger.findFirst({ where: { type: TRIGGER_TYPE } });
    } catch {
        // Deliberately swallowed: the safe answer is the disabled default, and
        // the offer loop must not crash because a settings read failed.
        row = null;
    }

    const window = Number(row?.thresholdDays);
    cache = {
        autoOfferEnabled: !!row?.enabled,
        responseWindowMinutes: Number.isFinite(window) && window > 0
            ? window
            : DEFAULT_RESPONSE_WINDOW_MINUTES,
    };
    cachedAt = Date.now();
    return cache;
}

/** Clear the cache so an admin toggle takes effect without a restart. */
function invalidate() {
    cache = null;
    cachedAt = 0;
}

/** Test seam. */
function _resetCache() {
    invalidate();
}

module.exports = {
    getReplacementSettings,
    invalidate,
    _resetCache,
    TRIGGER_TYPE,
    DEFAULT_RESPONSE_WINDOW_MINUTES,
};
