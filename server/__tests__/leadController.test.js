jest.mock('../src/lib/prisma', () => ({
  lead: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
}));
jest.mock('../src/services/authorizationService', () => ({ enrichClient: (c) => c }));
jest.mock('../src/services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../src/lib/prisma');
const controller = require('../src/controllers/leadController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const reqUser = { user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 }, db: prisma };

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
  test('moving to an active column clears archivedAt', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 5, status: 'archived', archivedAt: new Date() });
    prisma.lead.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
    const res = mockRes();
    await controller.setLeadStatus({ ...reqUser, params: { id: '5' }, body: { status: 'new' } }, res, jest.fn());
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'new', archivedAt: null }) }));
  });
  test('moving to the archived column sets archivedAt to a Date', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 5, status: 'new', archivedAt: null });
    prisma.lead.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
    const res = mockRes();
    await controller.setLeadStatus({ ...reqUser, params: { id: '5' }, body: { status: 'archived' } }, res, jest.fn());
    const call = prisma.lead.update.mock.calls[0][0];
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe('listLeads', () => {
  test('archived=true excludes converted leads from the where clause', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: { archived: 'true' } }, res, jest.fn());
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: 'converted' } }) }));
  });

  test('view=board returns active (non-archived) leads', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: { view: 'board' } }, res, jest.fn());
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
  });

  test('view=list returns the same active-leads set as board', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: { view: 'list' } }, res, jest.fn());
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
  });

  test('view=dormant returns dormant leads (dormantAt set, not converted)', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: { view: 'dormant' } }, res, jest.fn());
    const call = prisma.lead.findMany.mock.calls[0][0];
    expect(call.where.dormantAt).toEqual({ not: null });
    expect(call.where.status).toEqual({ not: 'converted' });
  });

  test('view=converted returns converted leads ordered by convertedAt desc', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: { view: 'converted' } }, res, jest.fn());
    const call = prisma.lead.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ status: 'converted' });
    expect(call.orderBy).toEqual({ convertedAt: 'desc' });
  });

  test('no view and no archived param defaults to active', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = mockRes();
    await controller.listLeads({ ...reqUser, query: {} }, res, jest.fn());
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
  });
});

describe('reactivateLead', () => {
  test('returns the updated lead and logs a RESTORE audit with metadata.reason=reactivated', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 42, status: 'archived', archivedAt: new Date(), dormantAt: new Date() });
    prisma.lead.update.mockImplementation(async ({ data }) => ({ id: 42, ...data, firstName: 'Jane', lastName: 'Doe' }));
    const audit = require('../src/services/auditService');
    const res = mockRes();
    await controller.reactivateLead({ ...reqUser, params: { id: '42' }, body: { status: 'waiting' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('waiting_insurance');
    expect(res.body.archivedAt).toBeNull();
    expect(res.body.dormantAt).toBeNull();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RESTORE',
      entityType: 'Lead',
      entityId: 42,
      metadata: expect.objectContaining({ reason: 'reactivated', targetColumn: 'waiting' }),
    }));
  });

  test('400 when the column id is invalid', async () => {
    const res = mockRes();
    await controller.reactivateLead({ ...reqUser, params: { id: '42' }, body: { status: 'archived' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  test('400 when the lead is missing', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await controller.reactivateLead({ ...reqUser, params: { id: '99' }, body: { status: 'new' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });
});

describe('getLeadStats', () => {
  test('response includes a dormant count from prisma.lead.count', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(7);
    const res = mockRes();
    await controller.getLeadStats({ ...reqUser, query: {} }, res, jest.fn());
    expect(prisma.lead.count).toHaveBeenCalledWith({ where: { dormantAt: { not: null } } });
    expect(res.body.dormant).toBe(7);
  });
});
