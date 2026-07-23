// One-shot geocode backfill, run as a step in the deploy start command:
//   … migrate deploy → seed → seed-services → backfill-geocodes → start server
//
// Idempotent: geocodeEntity skips addresses whose hash is unchanged, so the
// first deploy geocodes the roster and every later one geocodes nothing.
//
// Exit codes drive the deploy:
//   0  — geocoded, all cached, nothing to backfill yet, OR no geocoder
//         configured (deploying without proximity is a valid choice, so it
//         warns but does not block the app from starting)
//   1  — every address failed despite a configured geocoder (a broken deploy:
//         bad token, rate-limit, or PostGIS missing)
//
// Only the genuinely-broken case (exit 1) should halt the start command. A
// missing token must not take the whole app down — you might be deploying
// before setting proximity up.
//
// Run manually: cd server && node prisma/backfill-geocodes.js

const { runBackfill } = require('../src/services/geocodeBackfill');
const prisma = require('../src/lib/prisma');

const REASONS = {
    not_configured:
        'MAPBOX_ACCESS_TOKEN is not set. Add it (or set GEOCODER_PROVIDER) and redeploy — '
        + 'proximity ranking cannot work without a geocoder.',
    all_failed:
        'Every address failed to geocode. Likely a bad/expired MAPBOX_ACCESS_TOKEN, a rate-limit '
        + 'block, or the PostGIS extension not being enabled. Check the token and the migration log.',
};

async function main() {
    // GEOCODE_BACKFILL_DELAY_MS lets an operator slow it further if needed;
    // the default already keeps under Mapbox's 600/min limit.
    const delayMs = process.env.GEOCODE_BACKFILL_DELAY_MS
        ? Number(process.env.GEOCODE_BACKFILL_DELAY_MS)
        : undefined;
    const result = await runBackfill(delayMs != null ? { delayMs } : {});

    if (!result.ok) {
        // 'not_configured' is a warning, not a blocker: deploying without a
        // geocoder is a legitimate choice. Only 'all_failed' — a configured
        // geocoder that placed nothing — halts the deploy.
        const blocking = result.reason === 'all_failed';
        const level = blocking ? console.error : console.warn;

        level(`\n[geocode-backfill] ${blocking ? 'FAILED' : 'SKIPPED'} (${result.reason}).`);
        level(REASONS[result.reason] || 'Unknown outcome.');
        if (result.attempted) {
            level(`Attempted ${result.attempted}, succeeded ${result.succeeded}, failed ${result.failed}.`);
        }

        if (blocking) process.exitCode = 1;
        return;
    }

    console.log(`[geocode-backfill] done (${result.reason}): ${result.succeeded} geocoded/cached, ${result.failed} failed.`);
}

main()
    .catch((err) => {
        console.error('[geocode-backfill] unexpected error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
