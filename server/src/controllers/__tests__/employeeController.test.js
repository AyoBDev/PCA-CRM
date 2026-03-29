jest.mock('../../lib/prisma', () => ({
    employee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));

const prisma = require('../../lib/prisma');
const { listEmployees, createEmployee } = require('../employeeController');

function mockReqRes(overrides = {}) {
    const req = { query: {}, params: {}, body: {}, ...overrides };
    const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
    };
    return { req, res };
}

describe('listEmployees', () => {
    test('returns all employees', async () => {
        prisma.employee.findMany.mockResolvedValue([{ id: 1, name: 'Test' }]);
        const { req, res } = mockReqRes();
        await listEmployees(req, res);
        expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Test' }]);
    });

    test('filters by active status', async () => {
        prisma.employee.findMany.mockResolvedValue([]);
        const { req, res } = mockReqRes({ query: { active: 'true' } });
        await listEmployees(req, res);
        expect(prisma.employee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { active: true } })
        );
    });
});

describe('createEmployee', () => {
    test('requires name', async () => {
        const { req, res } = mockReqRes({ body: {} });
        await createEmployee(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('creates employee with name', async () => {
        prisma.employee.create.mockResolvedValue({ id: 1, name: 'Jane' });
        const { req, res } = mockReqRes({ body: { name: 'Jane' } });
        await createEmployee(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
