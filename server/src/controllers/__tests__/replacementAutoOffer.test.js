// Tests for the flag-gated auto-offer endpoint and the worker's respect for it.
//
// Auto-offering messages caregivers without a human in the loop, so the gate
// has to hold in both places that can start or continue a chain: the endpoint
// that kicks it off, and the worker that escalates when a window closes.

// Two different DB-access shapes are exercised in this file:
//  - the controller (startAutoOffer) reads/writes via req.db, set by
//    tenantMiddleware — the tenantDb mock plays that role.
//  - the worker (handleOfferExpiry) resolves the job's agency on the OWNER
//    connection (lib/prisma) first, then does everything else via a
//    tenantClient() it builds itself — see replacementWorker.js. So
//    lib/tenantPrisma.tenantClient is mocked to hand back the same tenantDb,
//    keeping both paths' mocks (rankCandidates, offerToCandidate, etc.)
//    observing calls against the one object.
const tenantDb = {
    shift: { findUnique: jest.fn() },
    shiftOffer: { findMany: jest.fn(() => []) },
    shiftCallout: { findFirst: jest.fn(), findUnique: jest.fn() },
};

jest.mock('../../lib/prisma', () => ({
    shiftOffer: { findUnique: jest.fn() },
}));

jest.mock('../../lib/tenantPrisma', () => ({
    tenantClient: jest.fn(),
}));

jest.mock('../../services/replacementService', () => ({
    offerToCandidate: jest.fn(),
    expireOffer: jest.fn(),
    resolveCallout: jest.fn(),
}));

jest.mock('../../services/candidateRankingService', () => ({ rankCandidates: jest.fn() }));
jest.mock('../../services/replacementSettings', () => ({ getReplacementSettings: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const ownerPrisma = require('../../lib/prisma');
const { tenantClient } = require('../../lib/tenantPrisma');
const replacement = require('../../services/replacementService');
const ranking = require('../../services/candidateRankingService');
const settings = require('../../services/replacementSettings');
const controller = require('../replacementController');
const { handleOfferExpiry } = require('../../workers/replacementWorker');

const AGENCY_ID = 42;

const SHIFT = {
    id: 7, clientId: 1, employeeId: 3, serviceCode: 'PCS',
    shiftDate: new Date('2026-08-03T00:00:00Z'),
    startTime: '09:00', endTime: '13:00', status: 'pending_replacement',
};

function mockReqRes(overrides = {}) {
    const req = { params: { id: '7' }, query: {}, body: {}, user: { id: 2, name: 'Admin', role: 'admin' }, db: tenantDb, ...overrides };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res, next: jest.fn() };
}

beforeEach(() => {
    jest.clearAllMocks();
    tenantClient.mockReturnValue(tenantDb);
    ownerPrisma.shiftOffer.findUnique.mockResolvedValue({ id: 21, agencyId: AGENCY_ID });
    tenantDb.shift.findUnique.mockResolvedValue(SHIFT);
    tenantDb.shiftCallout.findFirst.mockResolvedValue({ id: 11, resolution: 'open' });
    tenantDb.shiftCallout.findUnique.mockResolvedValue({ id: 11, resolution: 'open' });
    ranking.rankCandidates.mockResolvedValue({
        status: 'ok',
        eligible: [{ employeeId: 5, rank: 1, scoreBreakdown: {} }, { employeeId: 6, rank: 2, scoreBreakdown: {} }],
        ineligible: [],
    });
    replacement.offerToCandidate.mockResolvedValue({ delivered: true, offer: { id: 21 } });
    settings.getReplacementSettings.mockResolvedValue({ autoOfferEnabled: true, responseWindowMinutes: 10 });
});

describe('POST /shifts/:id/auto-offer', () => {
    test('refuses with 403 when the flag is off', async () => {
        settings.getReplacementSettings.mockResolvedValue({ autoOfferEnabled: false, responseWindowMinutes: 10 });

        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });

    test('offers the top candidate when the flag is on', async () => {
        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        expect(replacement.offerToCandidate).toHaveBeenCalledWith(
            tenantDb, 7, 5, expect.objectContaining({ responseWindowMinutes: 10 }),
        );
    });

    test('offers only ONE candidate — the rest follow on expiry', async () => {
        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        // Sequential, not broadcast: offering everyone at once would invite the
        // double-fill race the whole design avoids.
        expect(replacement.offerToCandidate).toHaveBeenCalledTimes(1);
    });

    test('uses the configured response window', async () => {
        settings.getReplacementSettings.mockResolvedValue({ autoOfferEnabled: true, responseWindowMinutes: 25 });

        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        expect(replacement.offerToCandidate).toHaveBeenCalledWith(
            tenantDb, 7, 5, expect.objectContaining({ responseWindowMinutes: 25 }),
        );
    });

    test('reports no coverage when nobody is eligible', async () => {
        ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [], ineligible: [] });

        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ noCoverage: true }));
    });

    test('404s for a missing shift', async () => {
        tenantDb.shift.findUnique.mockResolvedValue(null);

        const { req, res, next } = mockReqRes();
        await controller.startAutoOffer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('worker escalation respects the flag', () => {
    beforeEach(() => {
        replacement.expireOffer.mockResolvedValue({ expired: true });
    });

    test('does not escalate to the next candidate when the flag is off', async () => {
        settings.getReplacementSettings.mockResolvedValue({ autoOfferEnabled: false, responseWindowMinutes: 10 });

        await handleOfferExpiry({ offerId: 21, shiftId: 7, calloutId: 11 });

        // The offer still expires — that is bookkeeping, not messaging — but a
        // disabled flag must stop the chain from continuing on its own.
        expect(replacement.expireOffer).toHaveBeenCalledWith(tenantDb, 21);
        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });

    test('escalates when the flag is on', async () => {
        await handleOfferExpiry({ offerId: 21, shiftId: 7, calloutId: 11 });

        expect(replacement.offerToCandidate).toHaveBeenCalled();
    });
});
