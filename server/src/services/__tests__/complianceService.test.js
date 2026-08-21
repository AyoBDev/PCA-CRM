jest.mock('../../lib/prisma', () => ({
  employeeCertification: { findMany: jest.fn() },
  employee: { update: jest.fn().mockResolvedValue({}) },
  certType: { findMany: jest.fn() },
}));
jest.mock('../../socket', () => ({ emitToEmployee: jest.fn() }));

const prisma = require('../../lib/prisma');
const { evaluateCompliance } = require('../complianceService');

beforeEach(() => jest.clearAllMocks());

test('a cert with requiresExpiry:false never blocks even when past its date', async () => {
  prisma.certType.findMany.mockResolvedValue([{ key: 'id_card', requiresExpiry: false, renewalYears: null }]);
  prisma.employeeCertification.findMany.mockResolvedValue([
    { certType: 'id_card', expirationDate: new Date('2020-01-01'), status: 'active' },
  ]);
  const status = await evaluateCompliance(7);
  expect(status).toBe('ok');
});

test('a cert with requiresExpiry:true and a past date blocks', async () => {
  prisma.certType.findMany.mockResolvedValue([{ key: 'cpr', requiresExpiry: true, renewalYears: 2 }]);
  prisma.employeeCertification.findMany.mockResolvedValue([
    { certType: 'cpr', expirationDate: new Date('2020-01-01'), status: 'active' },
  ]);
  const status = await evaluateCompliance(7);
  expect(status).toBe('blocked');
});
