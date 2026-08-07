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

module.exports = { buildLiveSandataMap, resolveShiftSandataId };
