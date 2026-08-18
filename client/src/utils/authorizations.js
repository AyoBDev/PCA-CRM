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
 * Has this authorization's end date passed as of `onDate`? (date-only, UTC).
 * Independent of manualStatus — an auth can be `manualStatus: 'active'` yet be
 * date-expired (nothing auto-flips the status when the end date passes).
 */
export function isAuthExpired(auth, onDate = new Date()) {
    if (!auth || !auth.authorizationEndDate) return false;
    return dayMs(auth.authorizationEndDate) < dayMs(onDate);
}

/**
 * "Active" for authorization LEDGER lists (master sheet, Programs tab): not
 * archived, not manually inactive, and not date-expired. A future-dated renewal
 * still counts as active (it has a job to do); a past-end-date auth drops to
 * history. Use this so an expired auth disappears from "Active" once its end
 * date passes and the renewal takes over.
 */
export function isAuthListedActive(auth, onDate = new Date()) {
    if (!auth) return false;
    if (auth.archivedAt) return false;
    if ((auth.manualStatus || 'active') !== 'active') return false;
    if (isAuthExpired(auth, onDate)) return false;
    return true;
}

/**
 * Pick the single current authorization for a given serviceCode (first match in
 * the provided order). Returns undefined when none is in effect on `onDate`.
 */
export function currentAuthForCode(auths, serviceCode, onDate = new Date()) {
    return (auths || []).find(a => a.serviceCode === serviceCode && isAuthEffectiveOn(a, onDate));
}

/**
 * Advisory coverage check for a new/edited authorization against the client's
 * other same-code authorizations. Detects a GAP (this auth starts more than one
 * day after the previous one ends → uncovered days) or an OVERLAP (this auth
 * starts on/before the previous one ends → two effective at once). Never changes
 * data — the caller surfaces it as a warning so staff can fix the dates.
 *
 * @param {object} draft         the auth being saved: { serviceCode, authorizationStartDate }
 * @param {Array}  siblingAuths  the client's other authorizations
 * @param {object} [opts]
 * @param {number} [opts.excludeId]      auth id being edited (skip self-compare)
 * @param {number} [opts.excludeRenewedFromId]  renewed-from id (its end date is being moved by the renewal)
 * @returns {{ kind: 'gap'|'overlap', gapDays?: number, priorEndDate: string } | null}
 */
export function coverageIssue(draft, siblingAuths, opts = {}) {
    const startStr = draft && draft.authorizationStartDate;
    const code = draft && draft.serviceCode;
    if (!startStr || !code) return null;
    const startMs = new Date(startStr + 'T00:00:00').getTime();
    const { excludeId, excludeRenewedFromId } = opts;
    const prior = (siblingAuths || [])
        .filter(a => a && a.serviceCode === code)
        .filter(a => a.id !== excludeId && a.id !== excludeRenewedFromId)
        .filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt)
        .filter(a => a.authorizationEndDate)
        .map(a => ({
            endMs: new Date(a.authorizationEndDate).getTime(),
            startMs: a.authorizationStartDate ? new Date(a.authorizationStartDate).getTime() : -Infinity,
            endDate: a.authorizationEndDate,
        }))
        .filter(a => a.startMs <= startMs) // a prior/current auth, not a later future one
        .sort((a, b) => b.endMs - a.endMs)[0];
    if (!prior) return null;
    const oneDay = 24 * 60 * 60 * 1000;
    const priorEndDate = new Date(prior.endDate).toISOString().slice(0, 10);
    const gapDays = Math.round((startMs - prior.endMs) / oneDay) - 1;
    if (gapDays > 0) return { kind: 'gap', gapDays, priorEndDate };
    if (startMs <= prior.endMs) return { kind: 'overlap', priorEndDate };
    return null;
}
