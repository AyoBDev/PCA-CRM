// Tests for geocodingService.
//
// The cost model for this feature depends on one invariant: an address is
// geocoded ONCE and cached. Geocoding is per-address, never per-lookup. If
// anything ever calls the provider on the request path, a free integration
// turns into a metered one. Several tests below exist purely to pin that down.

jest.mock('../../lib/prisma', () => ({
    client: { findUnique: jest.fn(), update: jest.fn() },
    employee: { findUnique: jest.fn(), update: jest.fn() },
    $executeRaw: jest.fn(),
}));

const prisma = require('../../lib/prisma');
const geocoding = require('../geocodingService');

const ORIGINAL_ENV = process.env;

function mockMapboxResponse(features) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ features }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, MAPBOX_ACCESS_TOKEN: 'pk.test-token' };
    delete process.env.GEOCODER_PROVIDER;
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
    delete global.fetch;
});

describe('geocodeAddress', () => {
    test('returns lat/lng from a Mapbox result', async () => {
        // Mapbox returns [longitude, latitude] — the reverse of the usual order,
        // which is an easy and silent source of transposed coordinates.
        mockMapboxResponse([{ center: [-115.1398, 36.1699], relevance: 0.99 }]);

        const result = await geocoding.geocodeAddress('123 Main St, Las Vegas, NV 89101');

        expect(result.status).toBe('ok');
        expect(result.lat).toBeCloseTo(36.1699, 4);
        expect(result.lng).toBeCloseTo(-115.1398, 4);
    });

    test('returns not_configured and makes no request when the token is absent', async () => {
        delete process.env.MAPBOX_ACCESS_TOKEN;
        global.fetch = jest.fn();

        const result = await geocoding.geocodeAddress('123 Main St');

        expect(result.status).toBe('not_configured');
        expect(result.lat).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns not_found for an empty result set', async () => {
        mockMapboxResponse([]);

        const result = await geocoding.geocodeAddress('nowhere at all');

        expect(result.status).toBe('not_found');
        expect(result.lat).toBeNull();
    });

    test('returns not_found for a blank address without calling the provider', async () => {
        global.fetch = jest.fn();

        for (const address of ['', '   ', null, undefined]) {
            const result = await geocoding.geocodeAddress(address);
            expect(result.status).toBe('not_found');
        }
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns an error status instead of throwing when the provider fails', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

        // A geocoding failure must never propagate into the caller's request.
        const result = await geocoding.geocodeAddress('123 Main St');

        expect(result.status).toBe('error');
        expect(result.lat).toBeNull();
    });

    test('returns an error status when the network call rejects', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

        const result = await geocoding.geocodeAddress('123 Main St');

        expect(result.status).toBe('error');
    });

    test('sends the access token and URL-encodes the address', async () => {
        mockMapboxResponse([{ center: [-115.1, 36.1], relevance: 0.9 }]);

        await geocoding.geocodeAddress('123 Main St, Las Vegas, NV');

        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain('pk.test-token');
        expect(url).toContain('123%20Main%20St');
        expect(url).not.toContain('123 Main St'); // must not be sent unencoded
    });
});

describe('geocodeEntity', () => {
    const ADDRESS = '123 Main St, Las Vegas, NV 89101';

    test('writes lat/lng for a client', async () => {
        prisma.client.findUnique.mockResolvedValue({ id: 1, address: ADDRESS, geocodedAt: null, geocodeStatus: 'pending' });
        prisma.client.update.mockResolvedValue({});
        mockMapboxResponse([{ center: [-115.1398, 36.1699], relevance: 0.99 }]);

        const result = await geocoding.geocodeEntity('client', 1);

        expect(result.status).toBe('ok');
        expect(prisma.client.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 1 },
            data: expect.objectContaining({
                latitude: expect.closeTo(36.1699, 4),
                longitude: expect.closeTo(-115.1398, 4),
                geocodeStatus: 'ok',
                geocodedAt: expect.any(Date),
            }),
        }));
        // Distance ranking reads these lat/lng columns directly (Haversine);
        // there is no separate geospatial column to write.
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    test('skips the provider when the address has not changed since last geocode', async () => {
        prisma.employee.findUnique.mockResolvedValue({
            id: 7,
            address: ADDRESS,
            latitude: 36.1699,
            longitude: -115.1398,
            geocodedAt: new Date('2026-07-01'),
            geocodeStatus: 'ok',
            geocodeAddressHash: geocoding.hashAddress(ADDRESS),
        });
        global.fetch = jest.fn();

        const result = await geocoding.geocodeEntity('employee', 7);

        // This is the cost invariant: re-geocoding unchanged addresses is the
        // difference between a one-off backfill and a recurring bill.
        expect(result.status).toBe('cached');
        expect(global.fetch).not.toHaveBeenCalled();
        expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    test('re-geocodes when the address has changed', async () => {
        prisma.employee.findUnique.mockResolvedValue({
            id: 7,
            address: '999 New Ave, Reno, NV',
            latitude: 36.1699,
            longitude: -115.1398,
            geocodedAt: new Date('2026-07-01'),
            geocodeStatus: 'ok',
            geocodeAddressHash: geocoding.hashAddress(ADDRESS),
        });
        prisma.employee.update.mockResolvedValue({});
        mockMapboxResponse([{ center: [-119.8138, 39.5296], relevance: 0.98 }]);

        const result = await geocoding.geocodeEntity('employee', 7);

        expect(result.status).toBe('ok');
        expect(global.fetch).toHaveBeenCalled();
    });

    test('force re-geocodes even when the address is unchanged', async () => {
        prisma.client.findUnique.mockResolvedValue({
            id: 1, address: ADDRESS, geocodedAt: new Date(), geocodeStatus: 'ok',
            geocodeAddressHash: geocoding.hashAddress(ADDRESS),
        });
        prisma.client.update.mockResolvedValue({});
        mockMapboxResponse([{ center: [-115.1398, 36.1699], relevance: 0.99 }]);

        const result = await geocoding.geocodeEntity('client', 1, { force: true });

        expect(result.status).toBe('ok');
        expect(global.fetch).toHaveBeenCalled();
    });

    test('records a not_found status without clobbering existing coordinates', async () => {
        prisma.client.findUnique.mockResolvedValue({
            id: 1, address: 'gibberish', latitude: 36.1, longitude: -115.1, geocodeStatus: 'ok',
        });
        prisma.client.update.mockResolvedValue({});
        mockMapboxResponse([]);

        const result = await geocoding.geocodeEntity('client', 1);

        expect(result.status).toBe('not_found');
        const data = prisma.client.update.mock.calls[0][0].data;
        expect(data.geocodeStatus).toBe('not_found');
        // A failed lookup must not erase coordinates that already worked.
        expect(data).not.toHaveProperty('latitude');
        expect(data).not.toHaveProperty('longitude');
    });

    test('returns not_found for an entity with a blank address', async () => {
        prisma.employee.findUnique.mockResolvedValue({ id: 7, address: '' });
        global.fetch = jest.fn();

        const result = await geocoding.geocodeEntity('employee', 7);

        expect(result.status).toBe('not_found');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns missing for an entity that does not exist', async () => {
        prisma.client.findUnique.mockResolvedValue(null);

        const result = await geocoding.geocodeEntity('client', 404);

        expect(result.status).toBe('missing');
        expect(prisma.client.update).not.toHaveBeenCalled();
    });

    test('rejects an unknown entity type', async () => {
        await expect(geocoding.geocodeEntity('invoice', 1)).rejects.toThrow(/entity type/i);
    });

    test('never throws when the provider errors, so callers can fire-and-forget', async () => {
        prisma.client.findUnique.mockResolvedValue({ id: 1, address: ADDRESS });
        prisma.client.update.mockResolvedValue({});
        global.fetch = jest.fn().mockRejectedValue(new Error('boom'));

        await expect(geocoding.geocodeEntity('client', 1)).resolves.toEqual(
            expect.objectContaining({ status: 'error' }),
        );
    });
});

describe('hashAddress', () => {
    test('is stable for equivalent addresses and differs for real changes', () => {
        expect(geocoding.hashAddress('123 Main St')).toBe(geocoding.hashAddress('123 Main St'));
        // Whitespace and casing are not meaningful address changes; treating them
        // as such would re-bill every trivial edit.
        expect(geocoding.hashAddress('123 Main St')).toBe(geocoding.hashAddress('  123 MAIN st  '));
        expect(geocoding.hashAddress('123 Main St')).not.toBe(geocoding.hashAddress('124 Main St'));
    });
});
