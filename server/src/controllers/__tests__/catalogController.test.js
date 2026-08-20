jest.mock('../../lib/prisma', () => ({
  documentType: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  certType: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  policyDocument: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
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
});
