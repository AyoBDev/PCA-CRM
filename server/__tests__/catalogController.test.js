jest.mock('../src/services/auditService', () => ({ logAction: jest.fn() }));

const audit = require('../src/services/auditService');
const controller = require('../src/controllers/catalogController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

// Controllers read the DB via req.db (tenant-scoped client set by tenantMiddleware),
// not the owner lib/prisma connection.
function mockDb() {
  return {
    documentType: { findMany: jest.fn(), create: jest.fn() },
    certType: { findMany: jest.fn(), create: jest.fn() },
    policyDocument: { findMany: jest.fn(), create: jest.fn() },
  };
}

const reqUser = { user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 } };

describe('listDocuments', () => {
  test('responds with { documentTypes } queried active + sorted by sortOrder', async () => {
    const db = mockDb();
    const rows = [{ id: 1, key: 'id_card', label: 'ID Card', sortOrder: 0, active: true }];
    db.documentType.findMany.mockResolvedValue(rows);
    const res = mockRes();
    await controller.listDocuments({ ...reqUser, db, query: {} }, res, jest.fn());
    expect(db.documentType.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    expect(res.body).toEqual({ documentTypes: rows });
  });
});

describe('createCertType', () => {
  test('creates and returns 201 with the row, and logs an audit CREATE', async () => {
    const db = mockDb();
    const created = { id: 9, key: 'inline-cert', label: 'Inline Cert', renewalYears: 2 };
    db.certType.create.mockResolvedValue(created);
    const res = mockRes();
    await controller.createCertType({ ...reqUser, db, body: { key: 'inline-cert', label: 'Inline Cert', renewalYears: 2 } }, res, jest.fn());
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(created);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'CertType',
      entityId: 9,
      entityName: 'Inline Cert',
    }));
  });
});
