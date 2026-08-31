// server/src/services/__tests__/complianceApproval.test.js
const mockDb = {
  certificationUpload: { findFirst: jest.fn() },
  employeeCertification: { findUnique: jest.fn(), update: jest.fn() },
  employee: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
  employeeTask: { updateMany: jest.fn().mockResolvedValue({}) },
  certType: { findMany: jest.fn().mockResolvedValue([{ key: 'cpr', requiresExpiry: true }]) },
};
jest.mock('../../lib/tenantContext', () => ({ getTenantDb: () => mockDb, getAgencyId: () => 1 }));
jest.mock('../../socket', () => ({ emitToEmployee: jest.fn() }));

const { approveCertRenewal, isClockInBlocked } = require('../complianceService');

beforeEach(() => jest.clearAllMocks());

test('approveCertRenewal makes latest upload current and stamps approval', async () => {
  mockDb.employeeCertification.findUnique.mockResolvedValue({ id: 10, employeeId: 7, certType: 'cpr' });
  mockDb.certificationUpload.findFirst.mockResolvedValue({ id: 55 });
  mockDb.employeeCertification.update.mockResolvedValue({ id: 10, currentVersionKey: '55' });
  mockDb.employeeCertification.findMany = jest.fn().mockResolvedValue([]); // evaluateCompliance reads certs
  mockDb.certType.findMany.mockResolvedValue([{ key: 'cpr', requiresExpiry: true }]);

  const newExp = new Date('2028-09-30T00:00:00Z');
  await approveCertRenewal(10, newExp, { id: 3, name: 'HR Amy' });

  expect(mockDb.employeeCertification.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 10 },
    data: expect.objectContaining({
      status: 'active', expirationDate: newExp, currentVersionKey: '55',
      approvedById: 3, approvedByName: 'HR Amy',
    }),
  }));
  expect(mockDb.employeeTask.updateMany).toHaveBeenCalled(); // tasks resolved
});

test('isClockInBlocked reflects complianceStatus', async () => {
  mockDb.employee.findUnique.mockResolvedValueOnce({ complianceStatus: 'blocked' });
  expect(await isClockInBlocked(7)).toBe(true);
  mockDb.employee.findUnique.mockResolvedValueOnce({ complianceStatus: 'ok' });
  expect(await isClockInBlocked(7)).toBe(false);
});
