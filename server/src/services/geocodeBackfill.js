// Geocode backfill runner.
//
// Runs on every deploy as an idempotent step: geocodeEntity skips any address
// whose hash is unchanged, so the first deploy geocodes the roster and every
// later one re-checks and geocodes nothing (zero API calls). Safe to leave in
// the start command permanently.
//
// It reports failure loudly in the two cases that mean the deploy is actually
// broken, so the start command can halt before serving a half-working app:
//   - no geocoder configured        -> reason 'not_configured'
//   - tried real addresses, ALL failed -> reason 'all_failed'
// A fresh install with nobody on the roster is NOT a failure — you cannot
// backfill data that does not exist yet.

const prisma = require('../lib/prisma');
const { geocodeEntity } = require('./geocodingService');

function getProvider() {
    const name = process.env.GEOCODER_PROVIDER || 'mapbox';
    // Only mapbox ships today; kept as a lookup so a second provider slots in.
    return require(`./geocoding/providers/${name}`);
}

// A geocode "succeeded" if the record now has coordinates. 'cached' counts —
// it means a previous run already placed it, which is the healthy steady state.
const SUCCESS_STATUSES = new Set(['ok', 'cached']);

/**
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ok: boolean, reason: string, attempted: number, succeeded: number, failed: number}>}
 */
async function runBackfill(log = console.log) {
    const provider = getProvider();
    if (!provider.isConfigured()) {
        return {
            ok: false,
            reason: 'not_configured',
            attempted: 0, succeeded: 0, failed: 0,
        };
    }

    // Only records that actually have an address to place.
    const addressFilter = { address: { not: '' } };
    const [clients, employees] = await Promise.all([
        prisma.client.findMany({ where: addressFilter, select: { id: true } }),
        prisma.employee.findMany({ where: addressFilter, select: { id: true } }),
    ]);

    const targets = [
        ...clients.map(c => ['client', c.id]),
        ...employees.map(e => ['employee', e.id]),
    ];

    if (targets.length === 0) {
        log('[geocode-backfill] nothing addressable yet — skipping');
        return { ok: true, reason: 'nothing_to_backfill', attempted: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const [type, id] of targets) {
        try {
            const result = await geocodeEntity(type, id);
            if (SUCCESS_STATUSES.has(result.status)) succeeded++;
            else failed++;
        } catch (err) {
            // One address must never take the whole deploy down. Record it as a
            // failure and keep going; a later success still proves the pipeline.
            log(`[geocode-backfill] ${type} ${id} threw: ${err.message}`);
            failed++;
        }
    }

    log(`[geocode-backfill] ${succeeded} geocoded/cached, ${failed} failed, of ${targets.length}`);

    // Every single attempt failing means a broken configuration — a bad token,
    // a rate-limit block, or PostGIS missing — not just a few unplaceable
    // addresses. Surface it so the deploy can halt.
    if (succeeded === 0) {
        return { ok: false, reason: 'all_failed', attempted: targets.length, succeeded, failed };
    }

    return { ok: true, reason: 'ok', attempted: targets.length, succeeded, failed };
}

module.exports = { runBackfill, SUCCESS_STATUSES };
