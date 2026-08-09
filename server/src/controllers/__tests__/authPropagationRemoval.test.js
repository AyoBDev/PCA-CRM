/**
 * Regression tests for Task 5: auth→shift propagation removal.
 *
 * Both `updateAccountNumber` and `updateSandataClientId` must update the
 * authorization record and NEVER call `prisma.shift.updateMany`.
 */

jest.mock('../../lib/prisma', () => ({
    authorization: {
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
    },
    shift: {
        updateMany: jest.fn(),
    },
}));

jest.mock('../../services/auditService', () => ({
    logAction: jest.fn(),
    diffFields: jest.fn(() => []),
}));

// enrichAuthorization is imported from authorizationService inside the controller.
// Provide a minimal mock so the controller doesn't hit the real service.
jest.mock('../../services/authorizationService', () => ({
    enrichAuthorization: jest.fn((auth) => auth),
    enrichClient: jest.fn((c) => c),
    filterAuthsByWeek: jest.fn(() => []),
}));

// serviceRegistry is required by the controller at module load time.
jest.mock('../../services/serviceRegistry', () => ({
    getServiceMap: jest.fn(async () => ({})),
    getServiceMapSync: jest.fn(() => ({})),
    invalidate: jest.fn(),
    deriveTimesheetSection: jest.fn(() => 'PAS'),
    sectionEnforcesLimit: jest.fn(() => true),
}));

const prisma = require('../../lib/prisma');
const { updateAccountNumber, updateSandataClientId } = require('../authorizationController');

// A plausible authorization object returned by prisma.authorization.update.
// Must include all fields read by enrichAuthorization to avoid undefined-access errors.
const MOCK_AUTH = {
    id: 5,
    clientId: 1,
    serviceCode: 'PCS',
    serviceName: 'Personal Care Services',
    serviceCategory: 'PCS',
    authorizationNumber: 'AUTH-001',
    authorizedUnits: 80,
    authorizationStartDate: new Date('2026-01-01'),
    authorizationEndDate: new Date('2026-12-31'),
    notes: '',
    archivedAt: null,
    accountNumber: '71040',
    sandataClientId: '955054',
    manualStatus: 'active',
    authorization_documents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

function mockReqRes({ params = {}, body = {} } = {}) {
    const req = {
        params,
        body,
        user: { id: 1, name: 'Admin', role: 'admin' },
    };
    const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
    };
    return { req, res };
}

describe('auth→shift propagation removal (Task 5 regression)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('updateAccountNumber updates the authorization and does NOT call shift.updateMany', async () => {
        prisma.authorization.update.mockResolvedValue({ ...MOCK_AUTH, accountNumber: '71040' });

        const { req, res } = mockReqRes({
            params: { id: '5' },
            body: { accountNumber: '71040' },
        });

        await updateAccountNumber(req, res);

        // authorization.update must be called with the new account number
        expect(prisma.authorization.update).toHaveBeenCalledTimes(1);
        const callArg = prisma.authorization.update.mock.calls[0][0];
        expect(callArg.where).toEqual({ id: 5 });
        expect(callArg.data.accountNumber).toBe('71040');

        // shift.updateMany must NOT be called (propagation was removed)
        expect(prisma.shift.updateMany).not.toHaveBeenCalled();

        // Response must be sent
        expect(res.json).toHaveBeenCalledTimes(1);
    });

    test('updateSandataClientId updates the authorization and does NOT call shift.updateMany', async () => {
        prisma.authorization.update.mockResolvedValue({ ...MOCK_AUTH, sandataClientId: '955054' });

        const { req, res } = mockReqRes({
            params: { id: '5' },
            body: { sandataClientId: '955054' },
        });

        await updateSandataClientId(req, res);

        // authorization.update must be called with the new sandata client id
        expect(prisma.authorization.update).toHaveBeenCalledTimes(1);
        const callArg = prisma.authorization.update.mock.calls[0][0];
        expect(callArg.where).toEqual({ id: 5 });
        expect(callArg.data.sandataClientId).toBe('955054');

        // shift.updateMany must NOT be called (propagation was removed)
        expect(prisma.shift.updateMany).not.toHaveBeenCalled();

        // Response must be sent
        expect(res.json).toHaveBeenCalledTimes(1);
    });
});
