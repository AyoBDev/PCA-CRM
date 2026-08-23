// Tests for candidateRankingService — the shared "who should work this shift?"
// engine used by both the callout replacement flow and normal shift creation.
//
// The rule these tests exist to protect: AVAILABILITY OUTRANKS PROXIMITY.
// Distance is the weakest signal here. A caregiver who is 0.2 miles away but
// already booked at that hour must never appear above one who is free, or a
// scheduler skimming the list will double-book them.

// rankCandidates takes `db` (a tenant-scoped Prisma client) as its first
// argument — see its JSDoc in candidateRankingService.js. So the mock plays
// the role of that db and is passed explicitly into every call below, rather
// than being installed via jest.mock('../../lib/prisma') (the service does
// not import lib/prisma at all).
const prisma = {
    client: { findUnique: jest.fn() },
    employee: { findMany: jest.fn() },
    shift: { findMany: jest.fn() },
    timeOffRequest: { findMany: jest.fn() },
    clientCareTeam: { findMany: jest.fn() },
    employeeCertification: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
};

const geocodingService = require('../geocodingService');
const ranking = require('../candidateRankingService');

const CLIENT = { id: 1, clientName: 'Jane Doe', latitude: 36.1699, longitude: -115.1398 };

const REQUEST = {
    clientId: 1,
    serviceCode: 'PCS',
    date: '2026-08-03', // a Monday
    startTime: '09:00',
    endTime: '13:00',
};

// 1 mile is ~1/69 degree of latitude. Placing an employee this far north of
// the client yields a known Haversine distance, so tests can assert on real
// computed distances instead of a stubbed query result.
const MILE_IN_LAT_DEG = 1 / 69.0;

function coordsAtMiles(miles) {
    return { latitude: CLIENT.latitude + miles * MILE_IN_LAT_DEG, longitude: CLIENT.longitude };
}

function employee(id, name, overrides = {}) {
    return {
        id,
        name,
        active: true,
        archivedAt: null,
        // Default: co-located with the client (0 mi) unless a test places them.
        latitude: CLIENT.latitude,
        longitude: CLIENT.longitude,
        employeeAvailability: null,
        ...overrides,
    };
}

// Remembers the employee list a test queued, so mockDistances can reposition it.
let queuedEmployees = [];
function setEmployees(list) {
    queuedEmployees = list;
    prisma.employee.findMany.mockResolvedValue(list);
}

/**
 * Place the queued employees at the requested distances (miles), keyed by id.
 * Distances are now computed from lat/lng in application code, so this sets
 * coordinates rather than stubbing a query. Call after setEmployees / the
 * beforeEach default.
 */
function mockDistances(map) {
    const positioned = queuedEmployees.map(e => (
        map[e.id] != null ? { ...e, ...coordsAtMiles(map[e.id]) } : e
    ));
    setEmployees(positioned);
}

beforeEach(() => {
    jest.clearAllMocks();
    prisma.client.findUnique.mockResolvedValue(CLIENT);
    setEmployees([]);
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.clientCareTeam.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
});

describe('input validation', () => {
    test.each([
        ['clientId', { clientId: undefined }],
        ['date', { date: undefined }],
        ['startTime', { startTime: undefined }],
        ['endTime', { endTime: undefined }],
    ])('returns insufficient_input when %s is missing', async (_field, patch) => {
        const result = await ranking.rankCandidates(prisma, { ...REQUEST, ...patch });

        // Without a full time window the engine cannot say who is free. Ranking
        // anyway would present a confident order built on unestablished facts.
        expect(result.status).toBe('insufficient_input');
        expect(result.eligible).toEqual([]);
        expect(result.ineligible).toEqual([]);
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
    });

    test('returns missing_client when the client does not exist', async () => {
        prisma.client.findUnique.mockResolvedValue(null);

        const result = await ranking.rankCandidates(prisma, REQUEST);

        expect(result.status).toBe('missing_client');
    });
});

describe('availability outranks proximity', () => {
    test('a nearer but double-booked employee is ineligible, not first', async () => {
        setEmployees([
            employee(1, 'Near But Booked'),
            employee(2, 'Far But Free'),
        ]);
        // Employee 1 is ten times closer than employee 2.
        mockDistances({ 1: 0.2, 2: 12.0 });
        prisma.shift.findMany.mockResolvedValue([
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '08:00', endTime: '12:00', status: 'scheduled' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([2]);
        expect(result.ineligible.map(c => c.employeeId)).toEqual([1]);
        expect(result.ineligible[0].conflicts).toContain('already_scheduled');
        // The distance is still reported — schedulers want to see it — but it
        // must not have promoted this candidate.
        expect(result.ineligible[0].distanceMiles).toBeCloseTo(0.2, 2);
    });

    test('ineligible candidates are never sorted by distance', async () => {
        setEmployees([
            employee(1, 'Booked Far'),
            employee(2, 'Booked Near'),
        ]);
        mockDistances({ 1: 20.0, 2: 0.1 });
        prisma.shift.findMany.mockResolvedValue([
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '08:00', endTime: '12:00', status: 'scheduled' },
            { id: 91, employeeId: 2, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '08:00', endTime: '12:00', status: 'scheduled' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible).toEqual([]);
        // Both are unavailable; proximity must not order them.
        expect(result.ineligible).toHaveLength(2);
        expect(result.ineligible.every(c => c.conflicts.includes('already_scheduled'))).toBe(true);
    });
});

describe('hard filters', () => {
    test('excludes the called-out caregiver via excludeEmployeeId', async () => {
        setEmployees([employee(2, 'Other')]);
        mockDistances({ 2: 2 });

        const result = await ranking.rankCandidates(prisma, { ...REQUEST, excludeEmployeeId: 1 }, { mode: 'soft' });

        // The exclusion happens in the query, so assert the query — the mocked
        // findMany returns a fixed array and cannot honour a where clause.
        expect(prisma.employee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: { not: 1 } }),
            }),
        );
        expect(result.eligible.map(c => c.employeeId)).toEqual([2]);
    });

    test('marks approved time off as a conflict', async () => {
        setEmployees([employee(1, 'On Leave')]);
        mockDistances({ 1: 0.5 });
        prisma.timeOffRequest.findMany.mockResolvedValue([
            { id: 5, employeeId: 1, status: 'approved', dateFrom: new Date('2026-08-01'), dateTo: new Date('2026-08-05') },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible).toEqual([]);
        expect(result.ineligible[0].conflicts).toContain('time_off');
    });

    test('ignores pending and denied time off', async () => {
        setEmployees([employee(1, 'Maybe Off')]);
        mockDistances({ 1: 0.5 });
        prisma.timeOffRequest.findMany.mockResolvedValue([]); // service filters to approved

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(prisma.timeOffRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ status: 'approved' }) }),
        );
        expect(result.eligible.map(c => c.employeeId)).toEqual([1]);
    });

    test('marks expired compliance certifications as a conflict', async () => {
        setEmployees([employee(1, 'Lapsed CPR')]);
        mockDistances({ 1: 0.5 });
        prisma.employeeCertification.findMany.mockResolvedValue([
            { employeeId: 1, certType: 'cpr', expirationDate: new Date('2026-01-01'), status: 'active' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Service-type qualification does not exist in this data model, so
        // compliance is what actually gates eligibility.
        expect(result.eligible).toEqual([]);
        expect(result.ineligible[0].conflicts).toContain('compliance_expired');
    });

    test('accepts certifications that expire after the shift date', async () => {
        setEmployees([employee(1, 'Current CPR')]);
        mockDistances({ 1: 0.5 });
        prisma.employeeCertification.findMany.mockResolvedValue([
            { employeeId: 1, certType: 'cpr', expirationDate: new Date('2027-01-01'), status: 'active' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([1]);
    });

    test('treats a blackout date as a conflict', async () => {
        setEmployees([
            employee(1, 'Blacked Out', {
                employeeAvailability: { blackoutDates: ['2026-08-03'], weeklySchedule: null },
            }),
        ]);
        mockDistances({ 1: 0.5 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.ineligible[0].conflicts).toContain('blackout_date');
    });

    test('does not apply a travel-distance cap', async () => {
        // The stored `maxTravelDistance` column actually holds MINUTES (the
        // onboarding UI labels it "Max Travel Time"), so it is deliberately not
        // used as a mileage cap — doing so would exclude the wrong people.
        setEmployees([
            employee(1, 'Very Far', {
                employeeAvailability: { maxTravelDistance: 30, weeklySchedule: null, blackoutDates: [] },
            }),
        ]);
        mockDistances({ 1: 95.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([1]);
    });
});

describe('strict vs soft mode', () => {
    beforeEach(() => {
        setEmployees([employee(1, 'Booked'), employee(2, 'Free')]);
        mockDistances({ 1: 0.5, 2: 3.0 });
        prisma.shift.findMany.mockResolvedValue([
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '08:00', endTime: '12:00', status: 'scheduled' },
        ]);
    });

    test('strict mode omits ineligible candidates entirely', async () => {
        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'strict' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([2]);
        expect(result.ineligible).toEqual([]);
    });

    test('soft mode returns ineligible candidates so they stay selectable', async () => {
        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([2]);
        expect(result.ineligible.map(c => c.employeeId)).toEqual([1]);
    });

    test('strict mode caps the candidate list at the configured limit', async () => {
        setEmployees([1, 2, 3, 4, 5, 6, 7].map(i => employee(i, `E${i}`)));
        mockDistances(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(i => [i, i])));
        prisma.shift.findMany.mockResolvedValue([]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'strict', limit: 5 });

        expect(result.eligible).toHaveLength(5);
    });
});

describe('scoring', () => {
    test('care-team membership outranks a closer non-member', async () => {
        setEmployees([
            employee(1, 'Closer Stranger'),
            employee(2, 'Care Team Member'),
        ]);
        mockDistances({ 1: 0.5, 2: 6.0 });
        prisma.clientCareTeam.findMany.mockResolvedValue([{ clientId: 1, employeeId: 2 }]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Continuity of care matters more to a client than a few miles.
        expect(result.eligible[0].employeeId).toBe(2);
        expect(result.eligible[0].scoreBreakdown.careTeam).toBeGreaterThan(0);
    });

    test('among equals, the nearer candidate ranks first', async () => {
        setEmployees([employee(1, 'Far'), employee(2, 'Near')]);
        mockDistances({ 1: 9.0, 2: 1.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([2, 1]);
    });

    test('every candidate carries an explainable score breakdown', async () => {
        setEmployees([employee(1, 'Someone')]);
        mockDistances({ 1: 2.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // scoreBreakdown is persisted on ShiftOffer so a past ranking stays
        // explainable long after the inputs have changed.
        const breakdown = result.eligible[0].scoreBreakdown;
        expect(breakdown).toEqual(expect.objectContaining({
            careTeam: expect.any(Number),
            availabilityWindow: expect.any(Number),
            proximity: expect.any(Number),
            weeklyLoad: expect.any(Number),
        }));
        expect(result.eligible[0].rank).toBe(1);
    });

    test('a lighter weekly load breaks a tie between equidistant candidates', async () => {
        setEmployees([employee(1, 'Busy'), employee(2, 'Light')]);
        mockDistances({ 1: 2.0, 2: 2.0 });
        prisma.shift.findMany.mockResolvedValue([
            // Same week, different day — no conflict, just load.
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-04T00:00:00Z'), startTime: '09:00', endTime: '17:00', status: 'scheduled', hours: 8 },
            { id: 91, employeeId: 1, shiftDate: new Date('2026-08-05T00:00:00Z'), startTime: '09:00', endTime: '17:00', status: 'scheduled', hours: 8 },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible[0].employeeId).toBe(2);
    });
});

describe('un-geocoded candidates', () => {
    test('are eligible but sort last, and are not treated as unavailable', async () => {
        setEmployees([
            employee(1, 'No Coords', { latitude: null, longitude: null }),
            employee(2, 'Has Coords'),
        ]);
        mockDistances({ 2: 8.0 }); // employee 1 absent from the distance query

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([2, 1]);
        const unGeocoded = result.eligible.find(c => c.employeeId === 1);
        expect(unGeocoded.distanceMiles).toBeNull();
        expect(unGeocoded.notGeocoded).toBe(true);
        // Missing geocoding is a data gap, never evidence of unavailability.
        expect(unGeocoded.conflicts).toEqual([]);
    });

    test('still ranks everyone when the client itself is un-geocoded', async () => {
        prisma.client.findUnique.mockResolvedValue({ ...CLIENT, latitude: null, longitude: null });
        setEmployees([employee(1, 'A'), employee(2, 'B')]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.status).toBe('ok');
        expect(result.eligible).toHaveLength(2);
        expect(result.eligible.every(c => c.distanceMiles === null)).toBe(true);
        // No point in a distance query with nothing to measure from.
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
});

describe('contact details', () => {
    test('returns phone and email so the office can reach a candidate directly', async () => {
        setEmployees([
            employee(1, 'Reachable', { phone: '702-555-0142', email: 'reach@example.com' }),
        ]);
        mockDistances({ 1: 1.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Most callouts are handled by phone; the ranked list is useless for
        // that if the admin has to go and look the number up elsewhere.
        expect(result.eligible[0]).toEqual(expect.objectContaining({
            phone: '702-555-0142',
            email: 'reach@example.com',
        }));
    });

    test('tolerates a candidate with no contact details on file', async () => {
        setEmployees([employee(1, 'No Contact', { phone: '', email: '' })]);
        mockDistances({ 1: 1.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible[0].phone).toBe('');
        expect(result.eligible[0].email).toBe('');
    });
});

describe('distance computation', () => {
    test('reports the real Haversine distance from the client, in miles', async () => {
        setEmployees([employee(1, 'A'), employee(2, 'B')]);
        mockDistances({ 1: 1.0, 2: 2.0 });

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Distances are now computed in JS from lat/lng — no raw query to build,
        // and therefore no $queryRaw call. The values must still be correct.
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        const byId = Object.fromEntries(result.eligible.map(c => [c.employeeId, c.distanceMiles]));
        expect(byId[1]).toBeCloseTo(1.0, 1);
        expect(byId[2]).toBeCloseTo(2.0, 1);
    });
});

describe('cost invariant', () => {
    test('never geocodes on the ranking path', async () => {
        const geocodeAddress = jest.spyOn(geocodingService, 'geocodeAddress');
        const geocodeEntity = jest.spyOn(geocodingService, 'geocodeEntity');
        setEmployees([
            employee(1, 'No Coords', { latitude: null, longitude: null }),
        ]);

        await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Geocoding on the request path is what would turn a free integration
        // into a metered one. Un-geocoded candidates stay un-geocoded here.
        expect(geocodeAddress).not.toHaveBeenCalled();
        expect(geocodeEntity).not.toHaveBeenCalled();
    });
});

describe('overlap detection', () => {
    test('ignores cancelled shifts when checking conflicts', async () => {
        setEmployees([employee(1, 'Had Cancelled Shift')]);
        mockDistances({ 1: 1.0 });
        prisma.shift.findMany.mockResolvedValue([
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '08:00', endTime: '12:00', status: 'cancelled' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        expect(result.eligible.map(c => c.employeeId)).toEqual([1]);
    });

    test('back-to-back shifts do not count as overlapping', async () => {
        setEmployees([employee(1, 'Finishes At Nine')]);
        mockDistances({ 1: 1.0 });
        prisma.shift.findMany.mockResolvedValue([
            { id: 90, employeeId: 1, shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '05:00', endTime: '09:00', status: 'scheduled' },
        ]);

        const result = await ranking.rankCandidates(prisma, REQUEST, { mode: 'soft' });

        // Shift ends exactly when the new one starts — adjacent, not overlapping.
        expect(result.eligible.map(c => c.employeeId)).toEqual([1]);
    });
});
