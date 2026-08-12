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

const { normalizeName } = require('../services/payrollService');

function clientNameOf(row) {
    return (row.client && row.client.clientName) || row.clientName || '';
}

// active-wins setter into a `{ value, active }` staging object
function setPreferActive(staging, key, value, isActive) {
    if (!key || !value) return;
    const existing = staging[key];
    if (!existing || (isActive && !existing.active)) {
        staging[key] = { value, active: isActive };
    }
}

function flatten(staging) {
    const out = {};
    for (const k of Object.keys(staging)) out[k] = staging[k].value;
    return out;
}

/**
 * Build the live lookup bundle from a client's authorizations. Both account
 * number and Sandata id are indexed; active auth wins over inactive per key.
 */
function buildLiveSandataMap(auths) {
    const accByCS = {}, accByNS = {};
    const sidByCA = {}, sidByCS = {}, sidByNS = {};
    for (const a of auths || []) {
        const isActive = (a.manualStatus || 'active') === 'active';
        const acct = (a.accountNumber || '').trim();
        const sid = (a.sandataClientId || '').trim();
        const nkey = normalizeName(clientNameOf(a));
        // account maps
        setPreferActive(accByCS, `${a.clientId}|${a.serviceCode}`, acct, isActive);
        setPreferActive(accByNS, `${nkey}|${a.serviceCode}`, acct, isActive);
        // sandata maps
        setPreferActive(sidByCA, `${a.clientId}|${acct}`, sid, isActive);
        setPreferActive(sidByCS, `${a.clientId}|${a.serviceCode}`, sid, isActive);
        setPreferActive(sidByNS, `${nkey}|${a.serviceCode}`, sid, isActive);
    }
    return {
        accountByClientService: flatten(accByCS),
        accountByNameService: flatten(accByNS),
        sandataByClientAccount: flatten(sidByCA),
        sandataByClientService: flatten(sidByCS),
        sandataByNameService: flatten(sidByNS),
    };
}

/** Derive the account number for a shift from the authorization (never the stored copy). */
function resolveShiftAccountNumber(shift, maps) {
    const cs = maps.accountByClientService[`${shift.clientId}|${shift.serviceCode}`];
    if (cs != null) return cs;
    const ns = maps.accountByNameService[`${normalizeName(clientNameOf(shift))}|${shift.serviceCode}`];
    if (ns != null) return ns;
    return '';
}

/** Derive the Sandata id, keyed primarily off the already-derived account number. */
function resolveShiftSandataId(shift, derivedAccount, maps) {
    if (derivedAccount) {
        const ca = maps.sandataByClientAccount[`${shift.clientId}|${derivedAccount}`];
        if (ca != null) return ca;
    }
    const cs = maps.sandataByClientService[`${shift.clientId}|${shift.serviceCode}`];
    if (cs != null) return cs;
    const ns = maps.sandataByNameService[`${normalizeName(clientNameOf(shift))}|${shift.serviceCode}`];
    if (ns != null) return ns;
    return '';
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
    resolveShiftAccountNumber,
    resolveShiftSandataId,
    buildSandataOwnerMap,
    classifyDrift,
    groupDrift,
    DRIFT_CATEGORIES,
};
