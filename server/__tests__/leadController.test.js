jest.mock('../src/lib/prisma', () => ({
  lead: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
}));
jest.mock('../src/services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../src/lib/prisma');
const controller = require('../src/controllers/leadController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const reqUser = { user: { id: 1, name: 'Admin', role: 'admin' } };

beforeEach(() => jest.clearAllMocks());

describe('createLead', () => {
  test('400 when firstName and lastName are both empty', async () => {
    const res = mockRes();
    await controller.createLead({ ...reqUser, body: { firstName: '', lastName: '' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });
  test('creates and returns 201', async () => {
    prisma.lead.create.mockResolvedValue({ id: 5, firstName: 'Jane', lastName: 'Doe' });
    const res = mockRes();
    await controller.createLead({ ...reqUser, body: { firstName: 'Jane', lastName: 'Doe' } }, res, jest.fn());
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(5);
  });
});

describe('setLeadStatus', () => {
  test('coerces a column id to its primary status', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 5, status: 'new' });
    prisma.lead.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
    const res = mockRes();
    await controller.setLeadStatus({ ...reqUser, params: { id: '5' }, body: { status: 'waiting' } }, res, jest.fn());
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'waiting_insurance' }) }));
  });
  test('accepts a full workflow status as-is', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 5, status: 'new' });
    prisma.lead.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
    const res = mockRes();
    await controller.setLeadStatus({ ...reqUser, params: { id: '5' }, body: { status: 'pending_start' } }, res, jest.fn());
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'pending_start' }) }));
  });
});
