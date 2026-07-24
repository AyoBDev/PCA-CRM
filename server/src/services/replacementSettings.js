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
//
// Two agencies can independently enable/disable auto-offering and tune their
// own response window, so the cache is keyed per-agency (mirrors
// serviceRegistry's per-agency cache) rather than a single module-level value.

const TRIGGER_TYPE = 'shift_replacement';
const DEFAULT_RESPONSE_WINDOW_MINUTES = 10;
const CACHE_TTL_MS = 30_000;

const cacheByAgency = new Map(); // agencyId -> { value, cachedAt }

/**
 * @param {object} db tenant-scoped Prisma client (req.db / getTenantDb() / a per-agency tenantClient)
 * @param {number} [agencyId] cache key; omit only when the caller has no stable
 *   identity for `db` (falls back to a single shared cache slot — acceptable
 *   for tests, but every real caller should pass its agencyId).
 * @returns {Promise<{autoOfferEnabled: boolean, responseWindowMinutes: number}>}
 */
async function getReplacementSettings(db, agencyId) {
    const key = agencyId ?? '__default__';
    const cached = cacheByAgency.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.value;

    let row = null;
    try {
        row = await db.workflowTrigger.findFirst({ where: { type: TRIGGER_TYPE } });
    } catch {
        // Deliberately swallowed: the safe answer is the disabled default, and
        // the offer loop must not crash because a settings read failed.
        row = null;
    }

    const window = Number(row?.thresholdDays);
    const value = {
        autoOfferEnabled: !!row?.enabled,
        responseWindowMinutes: Number.isFinite(window) && window > 0
            ? window
            : DEFAULT_RESPONSE_WINDOW_MINUTES,
    };
    cacheByAgency.set(key, { value, cachedAt: Date.now() });
    return value;
}

/** Clear the cache so an admin toggle takes effect without a restart. */
function invalidate(agencyId) {
    if (agencyId === undefined) {
        cacheByAgency.clear();
    } else {
        cacheByAgency.delete(agencyId);
        cacheByAgency.delete('__default__');
    }
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
