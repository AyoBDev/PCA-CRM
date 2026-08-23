const mockDb = {
  employeeCertification: { findMany: jest.fn() },
  employee: { update: jest.fn().mockResolvedValue({}) },
  certType: { findMany: jest.fn() },
};
jest.mock('../../lib/tenantContext', () => ({
  getTenantDb: jest.fn(() => mockDb),
  getAgencyId: jest.fn(() => 1),
}));
jest.mock('../../socket', () => ({ emitToEmployee: jest.fn() }));

const { evaluateCompliance } = require('../complianceService');

beforeEach(() => jest.clearAllMocks());

test('a cert with requiresExpiry:false never blocks even when past its date', async () => {
  mockDb.certType.findMany.mockResolvedValue([{ key: 'id_card', requiresExpiry: false, renewalYears: null }]);
  mockDb.employeeCertification.findMany.mockResolvedValue([
    { certType: 'id_card', expirationDate: new Date('2020-01-01'), status: 'active' },
  ]);
  const status = await evaluateCompliance(7);
  expect(status).toBe('ok');
});

test('a cert with requiresExpiry:true and a past date blocks', async () => {
  mockDb.certType.findMany.mockResolvedValue([{ key: 'cpr', requiresExpiry: true, renewalYears: 2 }]);
  mockDb.employeeCertification.findMany.mockResolvedValue([
    { certType: 'cpr', expirationDate: new Date('2020-01-01'), status: 'active' },
  ]);
  const status = await evaluateCompliance(7);
  expect(status).toBe('blocked');
});
