// The controller reads/writes via req.db (set by tenantMiddleware), not the
// owner-connection lib/prisma — matching the established pattern (see
// clientController.test.js). This used to hit a real local DB directly
// through lib/prisma with no agencyId, which broke once services carried a
// required agency_id and the unique index moved to (agencyId, code).
const prisma = {
  service: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};

jest.mock('../../services/serviceRegistry', () => ({ invalidate: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const { createService } = require('../serviceController');

function mockRes() {
  return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} };
}
const user = { id: 1, name: 'T', role: 'admin' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('service CRUD new fields', () => {
  test('createService persists new fields', async () => {
    prisma.service.create.mockResolvedValue({
      id: 101, category: 'GUIDE', code: 'ZZTEST', name: 'Z', label: 'Z Label',
      accountNumber: '71119', color: '#123456', timesheetSection: 'Respite',
      sortOrder: 7, enforceAuthLimit: false,
    });

    const res = mockRes();
    await createService({
      body: { category: 'GUIDE', code: 'ZZTEST', name: 'Z', label: 'Z Label', accountNumber: '71119', color: '#123456', timesheetSection: 'Respite', sortOrder: 7, enforceAuthLimit: false },
      user, db: prisma,
    }, res, e => { throw e; });

    expect(res.statusCode).toBe(201);
    expect(res.body.color).toBe('#123456');
    expect(res.body.timesheetSection).toBe('Respite');
    expect(res.body.sortOrder).toBe(7);
    expect(res.body.enforceAuthLimit).toBe(false);
    expect(prisma.service.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sortOrder: 7, enforceAuthLimit: false, color: '#123456' }),
    }));
  });

  test('createService defaults enforceAuthLimit to true when omitted', async () => {
    prisma.service.create.mockResolvedValue({
      id: 102, category: 'GUIDE', code: 'ZZTEST2', name: 'Z2', enforceAuthLimit: true,
    });

    const res = mockRes();
    await createService({ body: { category: 'GUIDE', code: 'ZZTEST2', name: 'Z2' }, user, db: prisma }, res, e => { throw e; });

    expect(res.body.enforceAuthLimit).toBe(true);
    expect(prisma.service.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ enforceAuthLimit: true }),
    }));
  });
});
