jest.mock('../../lib/prisma', () => ({
    employee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../services/onboardingService', () => ({
    createOnboardingToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
    sendOnboardingEmail: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../lib/prisma');
const { listEmployees, createEmployee } = require('../employeeController');

function mockReqRes(overrides = {}) {
    const req = { query: {}, params: {}, body: {}, user: { id: 1, name: 'Admin', role: 'admin' }, ...overrides };
    const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
}

describe('listEmployees', () => {
    test('returns all employees', async () => {
        prisma.employee.findMany.mockResolvedValue([{ id: 1, name: 'Test' }]);
        const { req, res, next } = mockReqRes();
        await listEmployees(req, res, next);
        expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Test' }]);
    });

    test('filters by active status', async () => {
        prisma.employee.findMany.mockResolvedValue([]);
        const { req, res, next } = mockReqRes({ query: { active: 'true' } });
        await listEmployees(req, res, next);
        expect(prisma.employee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ active: true }) })
        );
    });
});

describe('createEmployee', () => {
    test('requires name', async () => {
        const { req, res, next } = mockReqRes({ body: {} });
        await createEmployee(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('creates employee with name', async () => {
        prisma.employee.create.mockResolvedValue({ id: 1, name: 'Jane', email: '' });
        prisma.employee.update.mockResolvedValue({ id: 1, name: 'Jane', email: '', onboardingStatus: 'active' });
        const { req, res, next } = mockReqRes({ body: { name: 'Jane' } });
        await createEmployee(req, res, next);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
