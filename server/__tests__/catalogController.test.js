jest.mock('../src/lib/prisma', () => ({
  documentType: { findMany: jest.fn(), create: jest.fn() },
  certType: { findMany: jest.fn(), create: jest.fn() },
  policyDocument: { findMany: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../src/lib/prisma');
const audit = require('../src/services/auditService');
const controller = require('../src/controllers/catalogController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const reqUser = { user: { id: 1, name: 'Admin', role: 'admin' } };

beforeEach(() => jest.clearAllMocks());

describe('listDocuments', () => {
  test('responds with { documentTypes } queried active + sorted by sortOrder', async () => {
    const rows = [{ id: 1, key: 'id_card', label: 'ID Card', sortOrder: 0, active: true }];
    prisma.documentType.findMany.mockResolvedValue(rows);
    const res = mockRes();
    await controller.listDocuments({ ...reqUser }, res, jest.fn());
    expect(prisma.documentType.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    expect(res.body).toEqual({ documentTypes: rows });
  });
});

describe('createCertType', () => {
  test('creates and returns 201 with the row, and logs an audit CREATE', async () => {
    const created = { id: 9, key: 'inline-cert', label: 'Inline Cert', renewalYears: 2 };
    prisma.certType.create.mockResolvedValue(created);
    const res = mockRes();
    await controller.createCertType({ ...reqUser, body: { key: 'inline-cert', label: 'Inline Cert', renewalYears: 2 } }, res, jest.fn());
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
