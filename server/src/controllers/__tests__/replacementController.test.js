// Tests for the replacement controller.
//
// Two things matter here beyond routing: the public token endpoints must never
// leak more about a client than a caregiver needs to decide on a shift, and
// every mutation must be audited (CLAUDE.md requires it for the History page).

// The controller reads/writes authenticated routes via req.db (set by
// tenantMiddleware), matching the established pattern (see
// clientController.test.js): the mock plays the role of req.db, passed into
// mockReqRes below.
//
// The two public token endpoints (getOffer / respondToOffer) are different —
// they resolve the offer's agencyId on the OWNER connection (lib/prisma) via
// a stub lookup, then call enterTokenTenant, which is the thing that actually
// assigns req.db before running the rest of the handler. So those two need
// the owner-connection mock (aliased below as ownerPrisma) plus a mocked
// enterTokenTenant that plays its real role: set req.db and invoke the fn.
const prisma = {
    shift: { findUnique: jest.fn() },
    shiftOffer: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    shiftCallout: { findFirst: jest.fn() },
    client: { findUnique: jest.fn() },
};

jest.mock('../../lib/prisma', () => ({
    shiftOffer: { findUnique: jest.fn() },
}));

jest.mock('../../lib/tokenTenant', () => ({
    enterTokenTenant: jest.fn(),
}));

jest.mock('../../services/replacementService', () => ({
    recordCallout: jest.fn(),
    offerToCandidate: jest.fn(),
    acceptOffer: jest.fn(),
    declineOffer: jest.fn(),
    resolveCallout: jest.fn(),
}));

jest.mock('../../services/candidateRankingService', () => ({ rankCandidates: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const ownerPrisma = require('../../lib/prisma');
const { enterTokenTenant } = require('../../lib/tokenTenant');
const replacement = require('../../services/replacementService');
const ranking = require('../../services/candidateRankingService');
const audit = require('../../services/auditService');
const controller = require('../replacementController');

function mockReqRes(overrides = {}) {
    const req = {
        params: {}, query: {}, body: {},
        user: { id: 2, name: 'Admin', role: 'admin' },
        db: prisma,
        ...overrides,
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    jest.clearAllMocks();
    prisma.shift.findUnique.mockReset();
    prisma.shiftOffer.findMany.mockReset();
    prisma.shiftOffer.findUnique.mockReset();
    prisma.shiftOffer.findFirst.mockReset();
    prisma.shiftCallout.findFirst.mockReset();
    prisma.client.findUnique.mockReset();
    ownerPrisma.shiftOffer.findUnique.mockReset();
    // Default: token resolves to some agency, and entering that tenant just
    // sets req.db to the tenant mock and runs the handler — mirrors the real
    // enterTokenTenant's contract without needing a real tenantClient.
    ownerPrisma.shiftOffer.findUnique.mockResolvedValue({ agencyId: 99 });
    enterTokenTenant.mockImplementation((req, res, agencyId, fn) => {
        req.db = prisma;
        return fn();
    });
});

describe('POST /shifts/:id/callout', () => {
    test('records the callout and returns ranked candidates', async () => {
        replacement.recordCallout.mockResolvedValue({
            callout: { id: 11 },
            candidates: [{ employeeId: 5, rank: 1 }],
            noCoverage: false,
        });

        const { req, res, next } = mockReqRes({ params: { id: '7' }, body: { reason: 'sick' } });
        await controller.recordCallout(req, res, next);

        expect(replacement.recordCallout).toHaveBeenCalledWith(prisma, 7, expect.objectContaining({
            reason: 'sick', reportedById: 2,
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ noCoverage: false }));
    });

    test('audits the callout', async () => {
        replacement.recordCallout.mockResolvedValue({ callout: { id: 11 }, candidates: [], noCoverage: true });

        const { req, res, next } = mockReqRes({ params: { id: '7' }, body: {} });
        await controller.recordCallout(req, res, next);

        expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'CREATE', entityType: 'ShiftCallout', entityId: 11,
        }));
    });

    test('surfaces a rejected callout as a 400 rather than a 500', async () => {
        replacement.recordCallout.mockRejectedValue(new Error('Shift 7 is already pending replacement'));

        const { req, res, next } = mockReqRes({ params: { id: '7' }, body: {} });
        await controller.recordCallout(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('GET /shifts/:id/replacement-candidates', () => {
    test('ranks in strict mode for an existing shift', async () => {
        prisma.shift.findUnique.mockResolvedValue({
            id: 7, clientId: 1, employeeId: 3, serviceCode: 'PCS',
            shiftDate: new Date('2026-08-03T00:00:00Z'), startTime: '09:00', endTime: '13:00',
        });
        ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [], ineligible: [] });

        const { req, res, next } = mockReqRes({ params: { id: '7' } });
        await controller.getReplacementCandidates(req, res, next);

        expect(ranking.rankCandidates).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ clientId: 1, excludeEmployeeId: 3 }),
            expect.objectContaining({ mode: 'strict' }),
        );
    });

    test('404s for a missing shift', async () => {
        prisma.shift.findUnique.mockResolvedValue(null);

        const { req, res, next } = mockReqRes({ params: { id: '404' } });
        await controller.getReplacementCandidates(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('GET /employees/nearby', () => {
    test('ranks in soft mode so unavailable employees stay selectable', async () => {
        ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [], ineligible: [] });

        const { req, res, next } = mockReqRes({
            query: { clientId: '1', serviceCode: 'PCS', date: '2026-08-03', startTime: '09:00', endTime: '13:00' },
        });
        await controller.getNearbyEmployees(req, res, next);

        expect(ranking.rankCandidates).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ clientId: '1', date: '2026-08-03' }),
            expect.objectContaining({ mode: 'soft' }),
        );
    });

    test('returns insufficient_input rather than guessing on partial input', async () => {
        ranking.rankCandidates.mockResolvedValue({ status: 'insufficient_input', eligible: [], ineligible: [] });

        const { req, res, next } = mockReqRes({ query: { clientId: '1' } });
        await controller.getNearbyEmployees(req, res, next);

        // The form falls back to its plain unranked list on this status; a 200
        // with an explicit status keeps that a normal path, not an error.
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'insufficient_input' }));
        expect(res.status).not.toHaveBeenCalledWith(500);
    });
});

describe('GET /shift-offers/:token (public)', () => {
    test('returns only what a caregiver needs to decide', async () => {
        ownerPrisma.shiftOffer.findUnique.mockResolvedValue({ agencyId: 99 });
        prisma.shiftOffer.findUnique.mockResolvedValue({
            id: 21, token: 'tok', response: '', expiresAt: new Date(Date.now() + 60_000),
            employee: { id: 5, name: 'Sam' },
            shift: {
                id: 7, startTime: '09:00', endTime: '13:00', serviceCode: 'PCS',
                shiftDate: new Date('2026-08-03T00:00:00Z'),
                client: {
                    id: 1, clientName: 'Jane Doe', address: '123 Main St',
                    medicaidId: 'MED-999', dob: new Date('1950-01-01'),
                    notes: 'confidential care notes', phone: '555-0100',
                },
            },
        });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' } });
        await controller.getOffer(req, res, next);

        const payload = res.json.mock.calls[0][0];
        expect(payload.client.clientName).toBe('Jane Doe');
        // This endpoint is unauthenticated — anyone holding the token can read
        // it, so it must not expose PHI beyond what the decision requires.
        expect(payload.client).not.toHaveProperty('medicaidId');
        expect(payload.client).not.toHaveProperty('dob');
        expect(payload.client).not.toHaveProperty('notes');
    });

    test('404s for an unknown token', async () => {
        ownerPrisma.shiftOffer.findUnique.mockResolvedValue(null);

        const { req, res, next } = mockReqRes({ params: { token: 'nope' } });
        await controller.getOffer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('reports an already-answered offer without exposing shift details', async () => {
        ownerPrisma.shiftOffer.findUnique.mockResolvedValue({ agencyId: 99 });
        prisma.shiftOffer.findUnique.mockResolvedValue({
            id: 21, token: 'tok', response: 'expired', expiresAt: new Date(Date.now() - 1000),
            employee: { id: 5, name: 'Sam' },
            shift: { id: 7, client: { clientName: 'Jane Doe' }, startTime: '09:00', endTime: '13:00', shiftDate: new Date() },
        });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' } });
        await controller.getOffer(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
    });
});

describe('POST /shifts/:id/offers/:offerId/record-response (phone callouts)', () => {
    // Most callouts and replacements are handled by phone. The office needs to
    // record what was said so the compliance trail matches reality, rather than
    // reassigning the shift by hand and leaving the offer showing "awaiting".
    beforeEach(() => {
        prisma.shiftOffer.findFirst.mockResolvedValue({ id: 21, token: 'tok-21', shiftId: 7, employeeId: 5, response: '' });
    });

    test('records a phoned-in acceptance against the existing offer', async () => {
        replacement.acceptOffer.mockResolvedValue({ status: 'accepted', offer: { id: 21, shiftId: 7 } });

        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '21' }, body: { response: 'accept', note: 'called at 9:05, said yes' } });
        await controller.recordOfferResponse(req, res, next);

        expect(replacement.acceptOffer).toHaveBeenCalledWith(prisma, 'tok-21');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    });

    test('records a phoned-in decline', async () => {
        replacement.declineOffer.mockResolvedValue({ status: 'declined', offer: { id: 21, shiftId: 7 } });

        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '21' }, body: { response: 'decline' } });
        await controller.recordOfferResponse(req, res, next);

        expect(replacement.declineOffer).toHaveBeenCalledWith(prisma, 'tok-21');
    });

    test('attributes the response to the admin who took the call, not the caregiver', async () => {
        replacement.acceptOffer.mockResolvedValue({ status: 'accepted', offer: { id: 21, shiftId: 7 } });

        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '21' }, body: { response: 'accept', note: 'phoned in' } });
        await controller.recordOfferResponse(req, res, next);

        expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
            userId: 2,
            entityType: 'ShiftOffer',
            metadata: expect.objectContaining({ via: 'phone', note: 'phoned in' }),
        }));
    });

    test('404s for an offer that does not belong to this shift', async () => {
        prisma.shiftOffer.findFirst.mockResolvedValue(null);

        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '99' }, body: { response: 'accept' } });
        await controller.recordOfferResponse(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('rejects an unrecognised response', async () => {
        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '21' }, body: { response: 'maybe' } });
        await controller.recordOfferResponse(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 409 when the shift was filled while the call was happening', async () => {
        replacement.acceptOffer.mockResolvedValue({ status: 'already_filled' });

        const { req, res, next } = mockReqRes({ params: { id: '7', offerId: '21' }, body: { response: 'accept' } });
        await controller.recordOfferResponse(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe('POST /shifts/:id/offers with channel phone', () => {
    test('logs an offer made by phone without attempting delivery', async () => {
        replacement.offerToCandidate.mockResolvedValue({ offer: { id: 22 }, delivered: true, channels: ['phone'] });

        const { req, res, next } = mockReqRes({ params: { id: '7' }, body: { employeeId: 5, channel: 'phone' } });
        await controller.createOffer(req, res, next);

        expect(replacement.offerToCandidate).toHaveBeenCalledWith(
            prisma, 7, 5, expect.objectContaining({ channel: 'phone' }),
        );
    });
});

describe('POST /shift-offers/:token/respond (public)', () => {
    test('accepts an offer', async () => {
        replacement.acceptOffer.mockResolvedValue({ status: 'accepted', employeeId: 5, offer: { id: 21, shiftId: 7 } });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' }, body: { response: 'accept' } });
        await controller.respondToOffer(req, res, next);

        expect(replacement.acceptOffer).toHaveBeenCalledWith(prisma, 'tok');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    });

    test('declines an offer', async () => {
        replacement.declineOffer.mockResolvedValue({ status: 'declined', offer: { id: 21, shiftId: 7 } });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' }, body: { response: 'decline' } });
        await controller.respondToOffer(req, res, next);

        expect(replacement.declineOffer).toHaveBeenCalledWith(prisma, 'tok');
    });

    test('rejects an unrecognised response', async () => {
        const { req, res, next } = mockReqRes({ params: { token: 'tok' }, body: { response: 'maybe' } });
        await controller.respondToOffer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(replacement.acceptOffer).not.toHaveBeenCalled();
    });

    test('returns 409 when the shift was already filled', async () => {
        replacement.acceptOffer.mockResolvedValue({ status: 'already_filled' });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' }, body: { response: 'accept' } });
        await controller.respondToOffer(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('audits a public acceptance with userId 0', async () => {
        replacement.acceptOffer.mockResolvedValue({
            status: 'accepted', employeeId: 5, offer: { id: 21, shiftId: 7, employee: { name: 'Sam' } },
        });

        const { req, res, next } = mockReqRes({ params: { token: 'tok' }, body: { response: 'accept' }, user: undefined });
        await controller.respondToOffer(req, res, next);

        // Public endpoints have no req.user; CLAUDE.md specifies userId 0 with
        // the entity name as userName.
        expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
            userId: 0, entityType: 'ShiftOffer',
        }));
    });
});
