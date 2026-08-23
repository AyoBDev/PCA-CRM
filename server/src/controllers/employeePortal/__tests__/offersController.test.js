// Tests for the employee-portal offers controller.
//
// The PWA caregiver is already authenticated, so they act on offers as
// themselves rather than through the public token link. That means these
// endpoints must scope everything to req.employee.id — an authenticated
// caregiver must never be able to see or answer somebody else's offer.

// This controller reads/writes via req.db (set by tenantMiddleware in
// routes/employee.js — see the top-of-file comment in offersController.js),
// not the owner-connection lib/prisma. So the mock plays the role of req.db
// and is passed into mockReqRes below.
const prisma = {
    shiftOffer: { findMany: jest.fn(), findFirst: jest.fn() },
};

jest.mock('../../../services/replacementService', () => ({
    acceptOffer: jest.fn(),
    declineOffer: jest.fn(),
}));

jest.mock('../../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const replacement = require('../../../services/replacementService');
const { getMyOffers, respondToMyOffer } = require('../offersController');

function mockReqRes(overrides = {}) {
    const req = { params: {}, query: {}, body: {}, employee: { id: 5, name: 'Sam Carer' }, db: prisma, ...overrides };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res };
}

beforeEach(() => jest.clearAllMocks());

describe('getMyOffers', () => {
    test('returns only open offers belonging to this caregiver', async () => {
        prisma.shiftOffer.findMany.mockResolvedValue([]);

        const { req, res } = mockReqRes();
        await getMyOffers(req, res);

        const where = prisma.shiftOffer.findMany.mock.calls[0][0].where;
        expect(where.employeeId).toBe(5);
        expect(where.response).toBe('');
        // An offer whose window has closed is not actionable and must not be
        // shown as if it were.
        expect(where.expiresAt).toEqual({ gt: expect.any(Date) });
    });

    test('shapes each offer with the shift details a caregiver needs', async () => {
        prisma.shiftOffer.findMany.mockResolvedValue([{
            id: 21, token: 'tok', expiresAt: new Date('2026-08-03T10:00:00Z'),
            shift: {
                id: 7, shiftDate: new Date('2026-08-03T00:00:00Z'),
                startTime: '09:00', endTime: '13:00', serviceCode: 'PCS',
                client: { clientName: 'Jane Doe', address: '123 Main St', gateCode: '1234', medicaidId: 'MED-9', notes: 'private' },
            },
        }]);

        const { req, res } = mockReqRes();
        await getMyOffers(req, res);

        const [offer] = res.json.mock.calls[0][0];
        expect(offer).toEqual(expect.objectContaining({
            id: 21, clientName: 'Jane Doe', startTime: '09:00', serviceCode: 'PCS',
        }));
        // Same PHI boundary as the public endpoint: a shift offer is not a
        // reason to expose the client's record.
        expect(JSON.stringify(offer)).not.toContain('MED-9');
        expect(JSON.stringify(offer)).not.toContain('private');
    });
});

describe('respondToMyOffer', () => {
    const OFFER = { id: 21, token: 'tok-21', employeeId: 5, response: '' };

    test('accepts an offer that belongs to this caregiver', async () => {
        prisma.shiftOffer.findFirst.mockResolvedValue(OFFER);
        replacement.acceptOffer.mockResolvedValue({ status: 'accepted', offer: OFFER });

        const { req, res } = mockReqRes({ params: { id: '21' }, body: { response: 'accept' } });
        await respondToMyOffer(req, res);

        expect(replacement.acceptOffer).toHaveBeenCalledWith(prisma, 'tok-21');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    });

    test('declines an offer', async () => {
        prisma.shiftOffer.findFirst.mockResolvedValue(OFFER);
        replacement.declineOffer.mockResolvedValue({ status: 'declined', offer: OFFER });

        const { req, res } = mockReqRes({ params: { id: '21' }, body: { response: 'decline' } });
        await respondToMyOffer(req, res);

        expect(replacement.declineOffer).toHaveBeenCalledWith(prisma, 'tok-21');
    });

    test('404s for an offer belonging to a different caregiver', async () => {
        // findFirst is scoped by employeeId, so another caregiver's offer simply
        // is not found — the response must not reveal that it exists.
        prisma.shiftOffer.findFirst.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { id: '99' }, body: { response: 'accept' } });
        await respondToMyOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(replacement.acceptOffer).not.toHaveBeenCalled();
    });

    test('scopes the lookup to the authenticated caregiver', async () => {
        prisma.shiftOffer.findFirst.mockResolvedValue(OFFER);
        replacement.acceptOffer.mockResolvedValue({ status: 'accepted', offer: OFFER });

        const { req, res } = mockReqRes({ params: { id: '21' }, body: { response: 'accept' } });
        await respondToMyOffer(req, res);

        expect(prisma.shiftOffer.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: 21, employeeId: 5 }) }),
        );
    });

    test('rejects an unrecognised response', async () => {
        const { req, res } = mockReqRes({ params: { id: '21' }, body: { response: 'maybe' } });
        await respondToMyOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 409 when the shift was already covered', async () => {
        prisma.shiftOffer.findFirst.mockResolvedValue(OFFER);
        replacement.acceptOffer.mockResolvedValue({ status: 'already_filled' });

        const { req, res } = mockReqRes({ params: { id: '21' }, body: { response: 'accept' } });
        await respondToMyOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});
