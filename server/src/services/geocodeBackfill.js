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
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const { geocodeEntity } = require('./geocodingService');

function getProvider() {
    const name = process.env.GEOCODER_PROVIDER || 'mapbox';
    // Only mapbox ships today; kept as a lookup so a second provider slots in.
    return require(`./geocoding/providers/${name}`);
}

// A geocode "succeeded" if the record now has coordinates. 'cached' counts —
// it means a previous run already placed it, which is the healthy steady state.
const SUCCESS_STATUSES = new Set(['ok', 'cached']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} [options]
 * @param {(msg: string) => void} [options.log]
 * @param {number} [options.delayMs] pause between geocodes. Mapbox allows
 *   600 requests/minute; the default 150ms (~400/min) stays comfortably under
 *   that, so a large first-run backfill does not get rate-limited (429).
 * @returns {Promise<{ok: boolean, reason: string, attempted: number, succeeded: number, failed: number}>}
 */
// Runs the backfill for a single tenant's `db`. Callers must invoke this from
// inside runWithTenant({ agencyId, db }, ...) since geocodeEntity (via
// geocodingService) reads the tenant DB via getTenantDb().
async function runBackfillForAgency(db, { log, delayMs }) {
    // Only records that actually have an address to place.
    const addressFilter = { address: { not: '' } };
    const [clients, employees] = await Promise.all([
        db.client.findMany({ where: addressFilter, select: { id: true } }),
        db.employee.findMany({ where: addressFilter, select: { id: true } }),
    ]);

    const targets = [
        ...clients.map(c => ['client', c.id]),
        ...employees.map(e => ['employee', e.id]),
    ];

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
        const [type, id] = targets[i];
        try {
            const result = await geocodeEntity(type, id);
            if (SUCCESS_STATUSES.has(result.status)) succeeded++;
            else failed++;
        } catch (err) {
            // One address must never take the whole run down. Record it as a
            // failure and keep going; a later success still proves the pipeline.
            log(`[geocode-backfill] ${type} ${id} threw: ${err.message}`);
            failed++;
        }
        // Throttle between real geocodes to stay under Mapbox's rate limit.
        // 'cached' results make no API call, but a flat delay is simpler and the
        // cost (a few seconds over a whole roster) is negligible.
        if (delayMs > 0 && i < targets.length - 1) await sleep(delayMs);
    }

    return { attempted: targets.length, succeeded, failed };
}

/**
 * Runs the backfill across every agency (enumerated on the owner connection),
 * each inside its own tenant context — a geocode cache hit/miss for one
 * agency's address must never touch another agency's rows.
 */
async function runBackfill(options = {}) {
    // Back-compat: runBackfill(logFn) still works.
    const opts = typeof options === 'function' ? { log: options } : options;
    const log = opts.log || console.log;
    const delayMs = opts.delayMs != null ? opts.delayMs : 150;

    const provider = getProvider();
    if (!provider.isConfigured()) {
        return {
            ok: false,
            reason: 'not_configured',
            attempted: 0, succeeded: 0, failed: 0,
        };
    }

    const agencies = await prisma.agency.findMany({ where: { status: 'active' } });

    let attempted = 0;
    let succeeded = 0;
    let failed = 0;

    for (const agency of agencies) {
        const db = tenantClient(agency.id);
        const result = await runWithTenant({ agencyId: agency.id, db }, () =>
            runBackfillForAgency(db, { log, delayMs })
        );
        attempted += result.attempted;
        succeeded += result.succeeded;
        failed += result.failed;
    }

    if (attempted === 0) {
        log('[geocode-backfill] nothing addressable yet — skipping');
        return { ok: true, reason: 'nothing_to_backfill', attempted: 0, succeeded: 0, failed: 0 };
    }

    log(`[geocode-backfill] ${succeeded} geocoded/cached, ${failed} failed, of ${attempted}`);

    // Every single attempt failing means a broken configuration — a bad token,
    // a rate-limit block, or PostGIS missing — not just a few unplaceable
    // addresses. Surface it so the deploy can halt.
    if (succeeded === 0) {
        return { ok: false, reason: 'all_failed', attempted, succeeded, failed };
    }

    return { ok: true, reason: 'ok', attempted, succeeded, failed };
}

module.exports = { runBackfill, SUCCESS_STATUSES };
