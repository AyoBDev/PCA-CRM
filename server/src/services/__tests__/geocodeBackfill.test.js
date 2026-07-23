// Tests for the geocode backfill runner.
//
// This runs on every Railway deploy (idempotent — geocodeEntity skips
// unchanged addresses), so it must be quiet on the normal case and LOUD on the
// two that mean the deploy is broken:
//   - no geocoder configured
//   - it tried to geocode real addresses and every one failed (bad token,
//     rate limit, or PostGIS missing)
// A fresh install with nobody on the roster yet is not a failure.

jest.mock('../../lib/prisma', () => ({
    client: { findMany: jest.fn(() => []) },
    employee: { findMany: jest.fn(() => []) },
}));

jest.mock('../geocodingService', () => ({ geocodeEntity: jest.fn() }));
jest.mock('../geocoding/providers/mapbox', () => ({ name: 'mapbox', isConfigured: jest.fn() }));

const prisma = require('../../lib/prisma');
const { geocodeEntity } = require('../geocodingService');
const mapbox = require('../geocoding/providers/mapbox');
const { runBackfill } = require('../geocodeBackfill');

beforeEach(() => {
    jest.clearAllMocks();
    mapbox.isConfigured.mockReturnValue(true);
    prisma.client.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
});

describe('runBackfill', () => {
    test('aborts when no geocoder is configured', async () => {
        mapbox.isConfigured.mockReturnValue(false);

        const result = await runBackfill({ delayMs: 0 });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('not_configured');
        // Never reach the database if there is no geocoder to use.
        expect(geocodeEntity).not.toHaveBeenCalled();
    });

    test('exits cleanly when there is nothing addressable yet', async () => {
        // Fresh install: no clients or employees with addresses. A normal
        // first-deploy state, not an error.
        const result = await runBackfill({ delayMs: 0 });

        expect(result.ok).toBe(true);
        expect(result.reason).toBe('nothing_to_backfill');
        expect(result.attempted).toBe(0);
    });

    test('geocodes clients and employees that have addresses', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        prisma.employee.findMany.mockResolvedValue([{ id: 7 }]);
        geocodeEntity.mockResolvedValue({ status: 'ok' });

        const result = await runBackfill({ delayMs: 0 });

        expect(geocodeEntity).toHaveBeenCalledWith('client', 1);
        expect(geocodeEntity).toHaveBeenCalledWith('client', 2);
        expect(geocodeEntity).toHaveBeenCalledWith('employee', 7);
        expect(result.ok).toBe(true);
        expect(result.succeeded).toBe(3);
    });

    test('counts a cached result as a success, not a failure', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }]);
        geocodeEntity.mockResolvedValue({ status: 'cached' });

        const result = await runBackfill({ delayMs: 0 });

        // On the second and later deploys everything is cached — that is the
        // healthy steady state, and must not read as total failure.
        expect(result.ok).toBe(true);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
    });

    test('FAILS when it attempted addresses and every one failed', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        geocodeEntity.mockResolvedValue({ status: 'error' });

        const result = await runBackfill({ delayMs: 0 });

        // Every geocode failing means a bad token, a rate-limit block, or
        // PostGIS missing — the deploy should not be considered healthy.
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('all_failed');
        expect(result.attempted).toBe(2);
        expect(result.succeeded).toBe(0);
    });

    test('succeeds when at least one geocode works', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        geocodeEntity
            .mockResolvedValueOnce({ status: 'ok' })
            .mockResolvedValueOnce({ status: 'error' });

        const result = await runBackfill({ delayMs: 0 });

        // Partial failure (one bad address among many) is expected and fine;
        // only a total wipeout signals a broken configuration.
        expect(result.ok).toBe(true);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(1);
    });

    test('treats not_found as a real attempt that did not succeed', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }]);
        geocodeEntity.mockResolvedValue({ status: 'not_found' });

        const result = await runBackfill({ delayMs: 0 });

        // The provider was reached but could not place the address. That is an
        // attempt; if it is the ONLY outcome, the run failed.
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('all_failed');
    });

    test('does not let one thrown error abort the whole run', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        geocodeEntity
            .mockRejectedValueOnce(new Error('transient network blip'))
            .mockResolvedValueOnce({ status: 'ok' });

        const result = await runBackfill({ delayMs: 0 });

        // One address should never take the deploy down; keep going and let the
        // successful one prove the pipeline works.
        expect(result.ok).toBe(true);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(1);
    });

    test('back-compat: still accepts a bare log function', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }]);
        geocodeEntity.mockResolvedValue({ status: 'ok' });
        const log = jest.fn();

        // Older call shape runBackfill(logFn) must keep working.
        const result = await runBackfill(log);

        expect(result.ok).toBe(true);
        expect(log).toHaveBeenCalled();
    });

    test('throttles between geocodes to stay under the provider rate limit', async () => {
        prisma.client.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
        geocodeEntity.mockResolvedValue({ status: 'ok' });

        const start = Date.now();
        await runBackfill({ delayMs: 20 });
        const elapsed = Date.now() - start;

        // 3 targets => 2 inter-request pauses of 20ms. Guards against the pause
        // being dropped, which is what would let a large run hit Mapbox's
        // 600/min limit and start returning 429s.
        expect(elapsed).toBeGreaterThanOrEqual(35);
    });

    test('only fetches records that actually have an address', async () => {
        await runBackfill({ delayMs: 0 });

        expect(prisma.client.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ address: expect.anything() }) }),
        );
        expect(prisma.employee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ address: expect.anything() }) }),
        );
    });
});
