// Single source of truth for "which authorization is current".
//
// The authorization's START/END dates are the source of truth for whether it is
// in effect on a given day. `manualStatus` is a MANUAL OVERRIDE only: an auth
// that an admin has flipped to `inactive` is never current, regardless of dates
// (e.g. client transferred / passed away). Archived auths are never current.
//
// Consequence for renewals: a scheduled (future-dated) renewal leaves the
// current auth active until the new start date; date filtering — not an eager
// status flip — governs which one is current. Route ALL "is this the current
// auth?" checks through here so no consumer reads raw `manualStatus` without the
// date window and accidentally counts a not-yet-effective renewal.

// Normalize a Date/string to that calendar day at UTC midnight, so a same-day
// boundary (start === today or end === today) counts as in-effect. Matches the
// day-level logic in the server's `filterAuthsByWeek`.
function dayMs(d) {
    if (!d) return null;
    const x = d instanceof Date ? d : new Date(d);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/**
 * Is `auth` in effect on `onDate` (default: now)?
 * True when it is not archived, not manually inactivated, and `onDate` falls
 * within [startDate, endDate] (null bounds are open-ended).
 */
export function isAuthEffectiveOn(auth, onDate = new Date()) {
    if (!auth) return false;
    if (auth.archivedAt) return false;
    if ((auth.manualStatus || 'active') !== 'active') return false;
    const day = dayMs(onDate);
    const start = dayMs(auth.authorizationStartDate);
    const end = dayMs(auth.authorizationEndDate);
    if (start !== null && start > day) return false; // not yet effective
    if (end !== null && end < day) return false;      // already ended
    return true;
}

/**
 * From a list of a client's authorizations, return only those in effect on
 * `onDate`. This is the canonical "current authorizations" set.
 */
export function currentAuthorizations(auths, onDate = new Date()) {
    return (auths || []).filter(a => isAuthEffectiveOn(a, onDate));
}

/**
 * Pick the single current authorization for a given serviceCode (first match in
 * the provided order). Returns undefined when none is in effect on `onDate`.
 */
export function currentAuthForCode(auths, serviceCode, onDate = new Date()) {
    return (auths || []).find(a => a.serviceCode === serviceCode && isAuthEffectiveOn(a, onDate));
}
