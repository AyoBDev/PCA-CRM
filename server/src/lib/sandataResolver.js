/**
 * Shared resolution of the LIVE Sandata Client ID for a shift.
 *
 * The Sandata Client ID has no single column of truth: it lives on
 * `Authorization.sandataClientId` (the source of truth, shown on the Client
 * Profile) and is also copied — as free text — onto each `Shift` row at
 * creation. Those copies can drift. Any surface that shows a shift's Sandata
 * ID (the shared schedule view, the one-time cleanup script) must resolve it
 * live from the authorization, keyed by client + service code, and only fall
 * back to the shift's stored value when no matching authorization carries an ID.
 *
 * These helpers are pure so the controller and the cleanup script share exactly
 * one implementation and cannot drift.
 */

/**
 * Build a `clientId|serviceCode` -> live Sandata Client ID lookup from a list of
 * authorizations. Only authorizations with a non-empty `sandataClientId` are
 * considered; an active authorization always wins over an inactive one for the
 * same key.
 *
 * @param {Array<{clientId:number, serviceCode:string, sandataClientId?:string, manualStatus?:string}>} auths
 * @returns {Object<string, string>} map of `${clientId}|${serviceCode}` -> id
 */
function buildLiveSandataMap(auths) {
    const byKey = {};
    for (const a of auths || []) {
        const sid = (a.sandataClientId || '').trim();
        if (!sid) continue;
        const key = `${a.clientId}|${a.serviceCode}`;
        const isActive = (a.manualStatus || 'active') === 'active';
        const existing = byKey[key];
        if (!existing || (isActive && !existing.active)) {
            byKey[key] = { value: sid, active: isActive };
        }
    }
    // Flatten to plain string values.
    const out = {};
    for (const key of Object.keys(byKey)) out[key] = byKey[key].value;
    return out;
}

/**
 * Resolve the live Sandata Client ID for one shift, falling back to the shift's
 * stored value when no matching authorization carries an ID.
 *
 * @param {{clientId:number, serviceCode:string, sandataClientId?:string}} shift
 * @param {Object<string,string>} liveMap from buildLiveSandataMap
 * @returns {string} the id the shift SHOULD show
 */
function resolveShiftSandataId(shift, liveMap) {
    const live = liveMap[`${shift.clientId}|${shift.serviceCode}`];
    return live != null ? live : (shift.sandataClientId || '');
}

/**
 * Build a map of `sandataClientId value` -> Set of clientIds that own it, from a
 * list of authorizations. Used to tell whether a value stored on one client's
 * shift actually belongs to a DIFFERENT client (the dangerous cross-contamination
 * case) versus a same-client typo/format difference.
 *
 * @param {Array<{clientId:number, sandataClientId?:string}>} auths
 * @returns {Map<string, Set<number>>}
 */
function buildSandataOwnerMap(auths) {
    const owners = new Map();
    for (const a of auths || []) {
        const sid = (a.sandataClientId || '').trim();
        if (!sid) continue;
        if (!owners.has(sid)) owners.set(sid, new Set());
        owners.get(sid).add(a.clientId);
    }
    return owners;
}

// Drift categories used by the one-time cleanup's `--only` filter.
const DRIFT_CATEGORIES = ['blank_fill_in', 'cross_client', 'value_review'];

/**
 * Classify a single drifted shift into one of DRIFT_CATEGORIES.
 *   - blank_fill_in: the shift has no stored id (auth supplies one) — benign.
 *   - cross_client:  the shift's non-blank id provably belongs to a DIFFERENT
 *                    client's authorization — the wrong-client-ID bug class.
 *   - value_review:  the shift has a different non-blank id not owned by another
 *                    client (typo, leading zero, per-code tangle) — needs review.
 *
 * @param {{clientId:number, storedValue:string}} shift  storedValue already trimmed
 * @param {Map<string,Set<number>>} ownerMap from buildSandataOwnerMap
 * @returns {'blank_fill_in'|'cross_client'|'value_review'}
 */
function classifyDrift(shift, ownerMap) {
    const stored = (shift.storedValue || '').trim();
    if (stored === '') return 'blank_fill_in';
    const owners = ownerMap.get(stored);
    if (owners) {
        for (const cid of owners) {
            if (cid !== shift.clientId) return 'cross_client';
        }
    }
    return 'value_review';
}

/**
 * Collapse per-shift drift records into one decision row per
 * clientId|serviceCode|oldValue|newValue group. See the owner-review plan.
 */
function groupDrift(changes) {
    const byKey = new Map();
    for (const c of changes || []) {
        const key = `${c.clientId}|${c.serviceCode}|${c.oldValue}|${c.newValue}`;
        let g = byKey.get(key);
        if (!g) {
            g = {
                groupKey: key,
                clientId: c.clientId,
                clientName: c.clientName,
                serviceCode: c.serviceCode,
                oldValue: c.oldValue,
                newValue: c.newValue,
                category: c.category,
                shiftCount: 0,
                firstDate: '',
                lastDate: '',
                shiftIds: [],
            };
            byKey.set(key, g);
        }
        g.shiftCount++;
        g.shiftIds.push(c.shiftId);
        const d = c.shiftDate || '';
        if (d) {
            if (!g.firstDate || d < g.firstDate) g.firstDate = d;
            if (!g.lastDate || d > g.lastDate) g.lastDate = d;
        }
    }
    return [...byKey.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName) || a.serviceCode.localeCompare(b.serviceCode));
}

module.exports = {
    buildLiveSandataMap,
    resolveShiftSandataId,
    buildSandataOwnerMap,
    classifyDrift,
    groupDrift,
    DRIFT_CATEGORIES,
};
