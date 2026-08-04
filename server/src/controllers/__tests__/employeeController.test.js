jest.mock('../../lib/prisma', () => {
    const employee = {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };
    return {
        employee,
        // createEmployee wraps its create in a transaction; the mock tx just
        // proxies to the same jest.fn()s so existing per-test mockResolvedValue
        // calls on prisma.employee.create continue to work unchanged.
        $transaction: jest.fn((cb) => cb({ employee })),
    };
});
jest.mock('../../services/requirementService', () => ({ assignRequirements: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../services/onboardingService', () => ({
    createOnboardingToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
    sendOnboardingEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/geocodeOnWrite', () => ({ geocodeOnWrite: jest.fn() }));

const prisma = require('../../lib/prisma');
const { geocodeOnWrite } = require('../../services/geocodeOnWrite');
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

    test('persists the address given at creation', async () => {
        prisma.employee.create.mockResolvedValue({ id: 1, name: 'Jane', email: '', address: '123 Main St' });
        const { req, res, next } = mockReqRes({ body: { name: 'Jane', address: '123 Main St' } });

        await createEmployee(req, res, next);

        // Address was previously dropped on create — the field was not even
        // destructured — so a new employee could never be geocoded.
        expect(prisma.employee.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ address: '123 Main St' }) }),
        );
    });

    test('geocodes a new employee that has an address', async () => {
        prisma.employee.create.mockResolvedValue({ id: 7, name: 'Jane', email: '', address: '123 Main St' });
        const { req, res, next } = mockReqRes({ body: { name: 'Jane', address: '123 Main St' } });

        await createEmployee(req, res, next);

        // The whole point: a distance should appear without a follow-up edit.
        expect(geocodeOnWrite).toHaveBeenCalledWith('employee', 7, { oldAddress: '', newAddress: '123 Main St' });
    });

    test('does not geocode a new employee with no address', async () => {
        prisma.employee.create.mockResolvedValue({ id: 8, name: 'NoAddr', email: '', address: '' });
        const { req, res, next } = mockReqRes({ body: { name: 'NoAddr' } });

        await createEmployee(req, res, next);

        expect(geocodeOnWrite).toHaveBeenCalledWith('employee', 8, { oldAddress: '', newAddress: '' });
        // geocodeOnWrite itself no-ops on a blank address; asserted in its own suite.
    });
});
