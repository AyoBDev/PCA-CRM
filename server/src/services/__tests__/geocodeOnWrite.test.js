// Tests for the geocode-on-write helper.
//
// Without this, a client or employee only gets coordinates when the deploy-time
// backfill runs — so someone added between deploys shows no distance until the
// next deploy. The helper geocodes on save instead, fire-and-forget (like
// audit.logAction), so a saved address is placed within moments.

jest.mock('../geocodingService', () => ({ geocodeEntity: jest.fn(() => Promise.resolve({ status: 'ok' })) }));

const { geocodeEntity } = require('../geocodingService');
const { geocodeOnWrite } = require('../geocodeOnWrite');

beforeEach(() => jest.clearAllMocks());

describe('geocodeOnWrite', () => {
    test('geocodes when an address changed', () => {
        geocodeOnWrite('employee', 5, { oldAddress: '', newAddress: '123 Main St' });

        expect(geocodeEntity).toHaveBeenCalledWith('employee', 5);
    });

    test('geocodes on first set from nothing', () => {
        geocodeOnWrite('client', 9, { oldAddress: null, newAddress: '1 A St' });

        expect(geocodeEntity).toHaveBeenCalledWith('client', 9);
    });

    test('does NOT geocode when the address is unchanged', () => {
        geocodeOnWrite('employee', 5, { oldAddress: '123 Main St', newAddress: '123 Main St' });

        // The geocode service would skip it anyway via the hash, but not firing
        // at all avoids a needless call on every unrelated field edit.
        expect(geocodeEntity).not.toHaveBeenCalled();
    });

    test('ignores whitespace-only differences', () => {
        geocodeOnWrite('employee', 5, { oldAddress: '123 Main St', newAddress: '  123 Main St  ' });

        expect(geocodeEntity).not.toHaveBeenCalled();
    });

    test('does not geocode when the new address is blank', () => {
        geocodeOnWrite('employee', 5, { oldAddress: '123 Main St', newAddress: '' });

        // Clearing an address has nothing to geocode; leave the old coords be.
        expect(geocodeEntity).not.toHaveBeenCalled();
    });

    test('does not geocode when newAddress is undefined (field not in the update)', () => {
        geocodeOnWrite('employee', 5, { oldAddress: '123 Main St', newAddress: undefined });

        expect(geocodeEntity).not.toHaveBeenCalled();
    });

    test('never throws, even if geocodeEntity rejects', () => {
        geocodeEntity.mockRejectedValue(new Error('mapbox down'));

        // Fire-and-forget: a geocode failure must never fail the save that
        // triggered it. This must not throw synchronously.
        expect(() => geocodeOnWrite('client', 1, { oldAddress: '', newAddress: 'x' })).not.toThrow();
    });
});
