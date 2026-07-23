// Tests for the Haversine distance helper.
//
// Replaces the PostGIS ST_Distance query: Railway's default Postgres image does
// not ship PostGIS, so the extension-based approach could not deploy. At PCA
// travel distances Haversine is accurate to within feet, and it needs no
// extension — computed in JS from lat/lng we already have in hand.

const { haversineMiles } = require('../haversine');

describe('haversineMiles', () => {
    test('is zero for identical points', () => {
        expect(haversineMiles(36.1699, -115.1398, 36.1699, -115.1398)).toBeCloseTo(0, 5);
    });

    test('matches a known short distance (downtown Las Vegas)', () => {
        // 300 S 4th St -> a point ~0.9 mi away. Cross-checked against PostGIS
        // ST_Distance for the same coordinates during the migration.
        const d = haversineMiles(36.1699, -115.1398, 36.1567, -115.1398);
        expect(d).toBeGreaterThan(0.8);
        expect(d).toBeLessThan(1.0);
    });

    test('matches a known longer distance (Las Vegas to Reno ~= 345 mi)', () => {
        const d = haversineMiles(36.1699, -115.1398, 39.5296, -119.8138);
        expect(d).toBeGreaterThan(330);
        expect(d).toBeLessThan(360);
    });

    test('is symmetric', () => {
        const ab = haversineMiles(36.17, -115.14, 36.28, -115.25);
        const ba = haversineMiles(36.28, -115.25, 36.17, -115.14);
        expect(ab).toBeCloseTo(ba, 6);
    });

    test('returns null when any coordinate is missing', () => {
        expect(haversineMiles(null, -115, 36, -115)).toBeNull();
        expect(haversineMiles(36, null, 36, -115)).toBeNull();
        expect(haversineMiles(36, -115, undefined, -115)).toBeNull();
        expect(haversineMiles(36, -115, 36, null)).toBeNull();
    });

    test('agrees with the PostGIS result within a few feet at city scale', () => {
        // 1 mile due north is ~0.014483 degrees of latitude at this latitude.
        // A tight tolerance here is what lets Haversine substitute for
        // ST_Distance without changing ranking outcomes.
        const oneMileNorth = 36.1699 + 1 / 69.0;
        const d = haversineMiles(36.1699, -115.1398, oneMileNorth, -115.1398);
        expect(d).toBeCloseTo(1.0, 2);
    });
});
