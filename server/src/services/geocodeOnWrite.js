// Geocode a client or employee when its address is set or changed on save.
//
// Fire-and-forget, like audit.logAction: the caller does not await it, and a
// geocoding failure must never fail the save that triggered it. Without this,
// coordinates only ever come from the deploy-time backfill, so anyone added
// between deploys shows no distance until the next one.

const { geocodeEntity } = require('./geocodingService');

function norm(addr) {
    return String(addr || '').trim();
}

/**
 * @param {'client'|'employee'} type
 * @param {number} id
 * @param {{oldAddress?: string, newAddress?: string}} change
 */
function geocodeOnWrite(type, id, { oldAddress, newAddress } = {}) {
    // newAddress undefined means the address field was not part of this write.
    if (newAddress === undefined) return;

    const next = norm(newAddress);
    if (!next) return;                    // nothing to place; keep any old coords
    if (next === norm(oldAddress)) return; // unchanged — skip the needless call

    // Call now, but detach the promise and swallow errors so nothing can bubble
    // into the request that triggered the save.
    try {
        Promise.resolve(geocodeEntity(type, id))
            .catch(err => console.error(`[geocode-on-write] ${type} ${id} failed:`, err.message));
    } catch (err) {
        // Guards the synchronous-throw case (e.g. geocodeEntity rejecting before
        // returning a promise); still must never reach the caller.
        console.error(`[geocode-on-write] ${type} ${id} failed:`, err.message);
    }
}

module.exports = { geocodeOnWrite };
