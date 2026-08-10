jest.mock('../src/lib/prisma', () => ({
  lead: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  leadContact: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
}));
jest.mock('../src/services/authorizationService', () => ({ enrichClient: (c) => c }));
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

describe('createLeadContact', () => {
  test('400 when non-terminal outcome has no followUpDate', async () => {
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'no_answer', note: 'rang out' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(400);
  });
  test('creates contact for terminal outcome without followUpDate', async () => {
    prisma.leadContact.create.mockResolvedValue({ id: 9, leadId: 5, outcome: 'wrong_number' });
    prisma.lead.update.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'wrong_number', note: 'bad #' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(201);
    expect(prisma.leadContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: 5, outcome: 'wrong_number', createdBy: 'Admin' }) })
    );
  });
  test('writes followUpDate back to the lead when provided', async () => {
    prisma.leadContact.create.mockResolvedValue({ id: 10, leadId: 5 });
    prisma.lead.update.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await controller.createLeadContact(
      { ...reqUser, params: { id: '5' }, body: { outcome: 'no_answer', followUpDate: '2026-08-10' } },
      res, jest.fn()
    );
    expect(res.statusCode).toBe(201);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ followUpDate: expect.any(Date) }) })
    );
  });
});

describe('createLead sets createdBy from the authenticated user', () => {
  test('createdBy is req.user.name', async () => {
    prisma.lead.create.mockResolvedValue({ id: 7, firstName: 'Jane', lastName: 'Doe' });
    const res = mockRes();
    await controller.createLead({ ...reqUser, body: { firstName: 'Jane', lastName: 'Doe' } }, res, jest.fn());
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdBy: 'Admin' }) })
    );
  });
});

describe('deleteLeadContact', () => {
  test('returns ok and does not throw when the contact does not exist', async () => {
    prisma.leadContact.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await controller.deleteLeadContact({ ...reqUser, params: { id: '5', contactId: '999' } }, res, jest.fn());
    expect(res.body.ok).toBe(true);
    expect(prisma.leadContact.delete).not.toHaveBeenCalled();
  });

  test('deletes the contact and reverts lead followUpDate to the most recent remaining contact', async () => {
    prisma.leadContact.findUnique.mockResolvedValue({ id: 10, leadId: 5, followUpDate: new Date('2026-08-10'), outcome: 'no_answer' });
    prisma.leadContact.delete.mockResolvedValue({});
    const remainingDate = new Date('2026-08-05');
    prisma.leadContact.findMany.mockResolvedValue([{ followUpDate: remainingDate }]);
    prisma.lead.update.mockResolvedValue({ id: 5, followUpDate: remainingDate });
    const res = mockRes();
    await controller.deleteLeadContact({ ...reqUser, params: { id: '5', contactId: '10' } }, res, jest.fn());
    expect(prisma.leadContact.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { followUpDate: remainingDate } });
    expect(res.body.ok).toBe(true);
  });

  test('reverts lead followUpDate to null when no contacts remain', async () => {
    prisma.leadContact.findUnique.mockResolvedValue({ id: 10, leadId: 5, followUpDate: new Date('2026-08-10'), outcome: 'no_answer' });
    prisma.leadContact.delete.mockResolvedValue({});
    prisma.leadContact.findMany.mockResolvedValue([]);
    prisma.lead.update.mockResolvedValue({ id: 5, followUpDate: null });
    const res = mockRes();
    await controller.deleteLeadContact({ ...reqUser, params: { id: '5', contactId: '10' } }, res, jest.fn());
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { followUpDate: null } });
    expect(res.body.ok).toBe(true);
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

describe('listLeadContacts', () => {
  test('returns the leadʼs contacts newest-first', async () => {
    const rows = [{ id: 2, leadId: 5 }, { id: 1, leadId: 5 }];
    prisma.leadContact.findMany.mockResolvedValue(rows);
    const res = mockRes();
    await controller.listLeadContacts({ ...reqUser, params: { id: '5' } }, res, jest.fn());
    expect(prisma.leadContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leadId: 5 }, orderBy: { createdAt: 'desc' } })
    );
    expect(res.body).toBe(rows);
  });
});

describe('getLeadReminders', () => {
  test('returns the four reminder buckets', async () => {
    prisma.lead.findMany.mockResolvedValue([]); // getReminders queries leads
    const res = mockRes();
    await controller.getLeadReminders(reqUser, res, jest.fn());
    expect(res.body).toEqual({ due: [], stale_soon: [], new_untouched: [], stuck: [] });
  });
});

describe('getClientLeadContacts', () => {
  test('returns [] when no lead was converted into this client', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await controller.getClientLeadContacts({ ...reqUser, params: { id: '9' } }, res, jest.fn());
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { convertedClientId: 9 } })
    );
    expect(res.body).toEqual([]);
    expect(prisma.leadContact.findMany).not.toHaveBeenCalled();
  });

  test('returns the originating leadʼs contacts when one exists', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 42 });
    const rows = [{ id: 1, leadId: 42 }];
    prisma.leadContact.findMany.mockResolvedValue(rows);
    const res = mockRes();
    await controller.getClientLeadContacts({ ...reqUser, params: { id: '9' } }, res, jest.fn());
    expect(prisma.leadContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leadId: 42 }, orderBy: { createdAt: 'desc' } })
    );
    expect(res.body).toBe(rows);
  });
});
