jest.mock('../src/services/auditService', () => ({ logAction: jest.fn(), redactChanges: jest.fn((c) => c), diffFields: jest.fn(() => []) }));
jest.mock('../src/services/onboardingService', () => ({
  createOnboardingToken: jest.fn(async () => 'tok'),
  sendOnboardingEmail: jest.fn(async () => {}),
}));
jest.mock('../src/services/geocodeOnWrite', () => ({ geocodeOnWrite: jest.fn() }));
jest.mock('../src/lib/tenantPrisma', () => ({ tenantTransaction: jest.fn() }));

const audit = require('../src/services/auditService');
const { tenantTransaction } = require('../src/lib/tenantPrisma');
const controller = require('../src/controllers/employeeController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
// createEmployee auto-sends an onboarding invite (req.db.employee.update + a
// second onboarding token) whenever an email is provided with no linked user —
// stub req.db for that path too.
const reqDb = { employee: { update: jest.fn(async ({ data }) => ({ onboardingStatus: data.onboardingStatus })) } };
const reqUser = { user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 }, db: reqDb };

beforeEach(() => jest.clearAllMocks());

// createEmployee runs its work inside tenantTransaction(agencyId, async (tx) => {...}) —
// build a tx double per test and wire tenantTransaction to invoke the real callback with it.
function makeTx() {
  const tx = {
    employee: { create: jest.fn() },
    certType: { findUnique: jest.fn(), findFirst: jest.fn() },
    employeeCertification: { create: jest.fn() },
    employeeRequirement: { create: jest.fn() },
  };
  tenantTransaction.mockImplementation(async (agencyId, fn) => fn(tx));
  return tx;
}

describe('createEmployee with requirementSelections', () => {
  test('creates employee + requirement ledger rows in one transaction and logs audit', async () => {
    const tx = makeTx();
    tx.employee.create.mockResolvedValue({ id: 10, name: 'Req EE', email: 'reqee@t.co' });
    tx.certType.findUnique.mockResolvedValue({ id: 2, key: 'cert-key' });
    tx.employeeCertification.create.mockResolvedValue({ id: 99, employeeId: 10 });
    tx.employeeRequirement.create
      .mockResolvedValueOnce({ id: 1, employeeId: 10, kind: 'document', catalogTypeId: 1 })
      .mockResolvedValueOnce({ id: 2, employeeId: 10, kind: 'certification', catalogTypeId: 2, certificationId: 99 });

    const res = mockRes();
    await controller.createEmployee({
      ...reqUser,
      body: {
        name: 'Req EE',
        email: 'reqee@t.co',
        requirementSelections: { documentTypeIds: [1], certTypeIds: [2], policyDocumentIds: [] },
      },
    }, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(tenantTransaction).toHaveBeenCalledTimes(1);
    expect(tx.employeeRequirement.create).toHaveBeenCalledTimes(2);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'EmployeeRequirement',
      entityId: 10,
      metadata: expect.objectContaining({ count: 2 }),
    }));
    // existing employee-create audit log preserved
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'Employee',
      entityId: 10,
    }));
  });

  test('creates employee without requirementSelections (no ledger rows, no extra audit)', async () => {
    const tx = makeTx();
    tx.employee.create.mockResolvedValue({ id: 11, name: 'Plain EE', email: '' });

    const res = mockRes();
    await controller.createEmployee({ ...reqUser, body: { name: 'Plain EE' } }, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(tx.employeeRequirement.create).not.toHaveBeenCalled();
    const reqCalls = audit.logAction.mock.calls.filter(([arg]) => arg.entityType === 'EmployeeRequirement');
    expect(reqCalls).toHaveLength(0);
  });
});
