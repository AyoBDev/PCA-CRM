jest.mock('../../lib/prisma', () => ({
  documentType: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  certType: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  policyDocument: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../../lib/prisma');
const audit = require('../../services/auditService');
const catalog = require('../catalogController');

function mockReqRes(params, body) {
  const req = { params, body, user: { id: 11, name: 'Admin', role: 'admin' } };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}
beforeEach(() => jest.clearAllMocks());

describe('updateCertType', () => {
  test('updates editable fields and audit-logs', async () => {
    prisma.certType.update.mockResolvedValue({ id: 1, label: 'CPR', renewalYears: 3 });
    const { req, res } = mockReqRes({ id: '1' }, { label: 'CPR', renewalYears: 3, requiresExpiry: true });
    await catalog.updateCertType(req, res);
    expect(prisma.certType.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ label: 'CPR', renewalYears: 3, requiresExpiry: true }),
    });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'CertType' }));
    expect(res.json).toHaveBeenCalled();
  });

  test('strips non-allowlisted fields (active/key/id) before update', async () => {
    prisma.certType.update.mockResolvedValue({ id: 1, label: 'CPR' });
    const { req, res } = mockReqRes({ id: '1' }, { label: 'CPR', active: false, key: 'hacked', id: 999, renewalYears: 3 });
    await catalog.updateCertType(req, res);
    const data = prisma.certType.update.mock.calls[0][0].data;
    expect(data).toHaveProperty('label', 'CPR');
    expect(data).toHaveProperty('renewalYears', 3);
    expect(data).not.toHaveProperty('active');
    expect(data).not.toHaveProperty('key');
    expect(data).not.toHaveProperty('id');
  });
});

describe('setDocumentActive', () => {
  test('deactivate logs ARCHIVE and does not touch requirements', async () => {
    prisma.documentType.update.mockResolvedValue({ id: 2, label: 'W-4', active: false });
    const { req, res } = mockReqRes({ id: '2' }, { active: false });
    await catalog.setDocumentActive(req, res);
    expect(prisma.documentType.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { active: false } });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'ARCHIVE', entityType: 'DocumentType' }));
  });
  test('reactivate logs RESTORE', async () => {
    prisma.documentType.update.mockResolvedValue({ id: 2, label: 'W-4', active: true });
    const { req, res } = mockReqRes({ id: '2' }, { active: true });
    await catalog.setDocumentActive(req, res);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESTORE' }));
  });
});

describe('createCertType (allowlist)', () => {
  test('allows key + editable fields but strips a non-creatable field (id)', async () => {
    prisma.certType.create.mockResolvedValue({ id: 5, key: 'first-aid', label: 'First Aid', renewalYears: 2 });
    const { req, res } = mockReqRes({}, {
      key: 'first-aid', label: 'First Aid', renewalYears: 2, requiresExpiry: true, sortOrder: 3,
      id: 999, notAField: 'nope',
    });
    await catalog.createCertType(req, res);
    const data = prisma.certType.create.mock.calls[0][0].data;
    expect(data).toEqual({ key: 'first-aid', label: 'First Aid', renewalYears: 2, requiresExpiry: true, sortOrder: 3 });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('notAField');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('reorderCertTypes', () => {
  test('writes sortOrder by array position in one transaction', async () => {
    prisma.certType.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
    const { req, res } = mockReqRes({}, { ids: [30, 10, 20] });
    await catalog.reorderCertTypes(req, res);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.certType.update).toHaveBeenCalledWith({ where: { id: 30 }, data: { sortOrder: 0 } });
    expect(prisma.certType.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { sortOrder: 1 } });
    expect(prisma.certType.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { sortOrder: 2 } });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
