// Geocoding service — turns free-text addresses into cached coordinates.
//
// COST INVARIANT: an address is geocoded ONCE and cached on the row
// (latitude/longitude/geocodedAt/geocodeAddressHash). It is re-geocoded only
// when the address string itself meaningfully changes. Proximity ranking reads
// the cached columns and makes ZERO provider calls.
//
// This is the only thing keeping the integration inside the free tier. Never
// call this service from a request-path ranking query, and never have
// candidateRankingService call it. An employee with no coordinates is treated
// as un-geocoded, never geocoded on demand.
//
// Every function here resolves rather than throws (except on programmer error,
// e.g. an unknown entity type), so callers can fire-and-forget the way
// audit.logAction is used elsewhere in the codebase.

const crypto = require('crypto');
const { getTenantDb } = require('../lib/tenantContext');

const PROVIDERS = {
    mapbox: require('./geocoding/providers/mapbox'),
};

// Resolved lazily (not at require time) so each call reads whichever tenant
// client is active for the request/job currently running — geocodeOnWrite's
// fire-and-forget call is issued synchronously inside the request's
// runWithTenant() context, and AsyncLocalStorage follows that promise chain
// even though the caller never awaits it.
const ENTITIES = {
    client: { delegate: () => getTenantDb().client },
    employee: { delegate: () => getTenantDb().employee },
};

function getProvider() {
    const name = process.env.GEOCODER_PROVIDER || 'mapbox';
    const provider = PROVIDERS[name];
    if (!provider) throw new Error(`Unknown geocoder provider: ${name}`);
    return provider;
}

/**
 * Stable fingerprint of an address, used to decide whether a re-geocode is
 * warranted. Normalises case and whitespace so that cosmetic edits — the most
 * common kind — do not trigger a paid lookup.
 */
function hashAddress(address) {
    const normalized = String(address || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    return crypto.createHash('sha1').update(normalized).digest('hex');
}

/**
 * Geocode a raw address string. Never throws.
 * @returns {Promise<{lat: number|null, lng: number|null, status: string}>}
 *   status: 'ok' | 'not_found' | 'not_configured' | 'error'
 */
async function geocodeAddress(address) {
    if (!address || !String(address).trim()) {
        return { lat: null, lng: null, status: 'not_found' };
    }

    const provider = getProvider();
    if (!provider.isConfigured()) {
        // Local dev and tests run without a token; this must be a quiet no-op
        // rather than an error, so nothing depends on the provider being set up.
        return { lat: null, lng: null, status: 'not_configured' };
    }

    try {
        return await provider.geocode(String(address).trim());
    } catch (err) {
        return { lat: null, lng: null, status: 'error', detail: err.message };
    }
}

/**
 * Geocode a client or employee and cache the result on the row. Never throws.
 *
 * @param {'client'|'employee'} type
 * @param {number} id
 * @param {{force?: boolean}} [options] force skips the unchanged-address check
 * @returns {Promise<{status: string, lat?: number, lng?: number}>}
 *   status: 'ok' | 'cached' | 'not_found' | 'not_configured' | 'error' | 'missing'
 */
async function geocodeEntity(type, id, options = {}) {
    const entity = ENTITIES[type];
    if (!entity) throw new Error(`Unknown entity type for geocoding: ${type}`);

    const delegate = entity.delegate();
    const row = await delegate.findUnique({ where: { id } });
    if (!row) return { status: 'missing' };

    if (!row.address || !String(row.address).trim()) {
        return { status: 'not_found' };
    }

    const hash = hashAddress(row.address);
    const unchanged = row.geocodeAddressHash === hash
        && row.latitude != null
        && row.longitude != null;

    if (unchanged && !options.force) {
        return { status: 'cached', lat: row.latitude, lng: row.longitude };
    }

    const result = await geocodeAddress(row.address);

    if (result.status !== 'ok') {
        // Record the outcome, but leave any previously-good coordinates intact —
        // a failed lookup is not evidence that the old point was wrong.
        await delegate.update({
            where: { id },
            data: { geocodeStatus: result.status, geocodedAt: new Date() },
        });
        return { status: result.status };
    }

    await delegate.update({
        where: { id },
        data: {
            latitude: result.lat,
            longitude: result.lng,
            geocodeStatus: 'ok',
            geocodedAt: new Date(),
            geocodeAddressHash: hash,
        },
    });

    // Distance ranking reads these lat/lng columns directly (Haversine), so
    // there is no separate geospatial column to maintain.
    return { status: 'ok', lat: result.lat, lng: result.lng };
}

module.exports = { geocodeAddress, geocodeEntity, hashAddress };
