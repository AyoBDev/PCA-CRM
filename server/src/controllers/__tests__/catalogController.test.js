jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../lib/tenantPrisma', () => ({ tenantTransaction: jest.fn() }));

const audit = require('../../services/auditService');
const { tenantTransaction } = require('../../lib/tenantPrisma');
const catalog = require('../catalogController');

function mockDb() {
  return {
    documentType: { update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    certType: { update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    policyDocument: { update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  };
}

function mockReqRes(params, body, db) {
  const req = { params, body, user: { id: 11, name: 'Admin', role: 'admin', agencyId: 1 }, db };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}
beforeEach(() => jest.clearAllMocks());

describe('updateCertType', () => {
  test('updates editable fields and audit-logs', async () => {
    const db = mockDb();
    db.certType.update.mockResolvedValue({ id: 1, label: 'CPR', renewalYears: 3 });
    const { req, res } = mockReqRes({ id: '1' }, { label: 'CPR', renewalYears: 3, requiresExpiry: true }, db);
    await catalog.updateCertType(req, res);
    expect(db.certType.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ label: 'CPR', renewalYears: 3, requiresExpiry: true }),
    });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'CertType' }));
    expect(res.json).toHaveBeenCalled();
  });

  test('strips non-allowlisted fields (active/key/id) before update', async () => {
    const db = mockDb();
    db.certType.update.mockResolvedValue({ id: 1, label: 'CPR' });
    const { req, res } = mockReqRes({ id: '1' }, { label: 'CPR', active: false, key: 'hacked', id: 999, renewalYears: 3 }, db);
    await catalog.updateCertType(req, res);
    const data = db.certType.update.mock.calls[0][0].data;
    expect(data).toHaveProperty('label', 'CPR');
    expect(data).toHaveProperty('renewalYears', 3);
    expect(data).not.toHaveProperty('active');
    expect(data).not.toHaveProperty('key');
    expect(data).not.toHaveProperty('id');
  });
});

describe('setDocumentActive', () => {
  test('deactivate logs ARCHIVE and does not touch requirements', async () => {
    const db = mockDb();
    db.documentType.update.mockResolvedValue({ id: 2, label: 'W-4', active: false });
    const { req, res } = mockReqRes({ id: '2' }, { active: false }, db);
    await catalog.setDocumentActive(req, res);
    expect(db.documentType.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { active: false } });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'ARCHIVE', entityType: 'DocumentType' }));
  });
  test('reactivate logs RESTORE', async () => {
    const db = mockDb();
    db.documentType.update.mockResolvedValue({ id: 2, label: 'W-4', active: true });
    const { req, res } = mockReqRes({ id: '2' }, { active: true }, db);
    await catalog.setDocumentActive(req, res);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESTORE' }));
  });
});

describe('createCertType (allowlist)', () => {
  test('allows key + editable fields but strips a non-creatable field (id)', async () => {
    const db = mockDb();
    db.certType.create.mockResolvedValue({ id: 5, key: 'first-aid', label: 'First Aid', renewalYears: 2 });
    const { req, res } = mockReqRes({}, {
      key: 'first-aid', label: 'First Aid', renewalYears: 2, requiresExpiry: true, sortOrder: 3,
      id: 999, notAField: 'nope',
    }, db);
    await catalog.createCertType(req, res);
    const data = db.certType.create.mock.calls[0][0].data;
    expect(data).toEqual({ key: 'first-aid', label: 'First Aid', renewalYears: 2, requiresExpiry: true, sortOrder: 3 });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('notAField');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('reorderCertTypes', () => {
  test('writes sortOrder by array position, one update per id, inside tenantTransaction', async () => {
    // reorderCertTypes uses tenantTransaction (not req.db) for atomicity across the
    // extended tenant client — mock the tx handed to the callback with its own
    // certType.update spy, matching what the controller actually receives.
    const txCertTypeUpdate = jest.fn(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
    tenantTransaction.mockImplementation(async (agencyId, fn) => {
      return fn({ certType: { update: txCertTypeUpdate } });
    });
    const db = mockDb();
    const { req, res } = mockReqRes({}, { ids: [30, 10, 20] }, db);
    await catalog.reorderCertTypes(req, res, jest.fn());
    expect(txCertTypeUpdate).toHaveBeenCalledWith({ where: { id: 30 }, data: { sortOrder: 0 } });
    expect(txCertTypeUpdate).toHaveBeenCalledWith({ where: { id: 10 }, data: { sortOrder: 1 } });
    expect(txCertTypeUpdate).toHaveBeenCalledWith({ where: { id: 20 }, data: { sortOrder: 2 } });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
