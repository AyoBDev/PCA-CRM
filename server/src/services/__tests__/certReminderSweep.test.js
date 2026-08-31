const mockDb = {
  employeeCertification: { findMany: jest.fn() },
  certType: { findMany: jest.fn() },
  certReminderLog: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../../lib/tenantContext', () => ({ getTenantDb: () => mockDb, getAgencyId: () => 1 }));
jest.mock('../reminderChannels/emailChannel', () => ({ send: jest.fn().mockResolvedValue('sent') }));
jest.mock('../reminderChannels/inAppChannel', () => ({ send: jest.fn().mockResolvedValue('sent') }));
jest.mock('../reminderChannels/pushChannel', () => ({ send: jest.fn().mockResolvedValue('stubbed') }));
jest.mock('../auditService', () => ({ logAction: jest.fn() }));
jest.mock('../complianceService', () => ({ evaluateCompliance: jest.fn().mockResolvedValue('blocked') }));

const compliance = require('../complianceService');
const { sweepCertRemindersForAgency } = require('../certReminderService');

const emp = { id: 7, name: 'Jane Doe', email: 'jane@example.com' };
const NOW = new Date('2026-09-01T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.certType.findMany.mockResolvedValue([{ key: 'cpr', label: 'CPR', requiresExpiry: true }]);
  mockDb.certReminderLog.findFirst.mockResolvedValue(null); // nothing sent yet
  mockDb.certReminderLog.create.mockResolvedValue({});
});

test('cert 7 days out sends the 7-day stage exactly once', async () => {
  mockDb.employeeCertification.findMany.mockResolvedValue([{
    id: 10, certType: 'cpr', status: 'active', currentVersionKey: '10',
    approvedAt: null, expirationDate: new Date('2026-09-08T00:00:00Z'), employee: emp,
  }]);
  const res = await sweepCertRemindersForAgency(NOW);
  expect(mockDb.certReminderLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ stage: 'reminder_7day' }),
  }));
  expect(res.sent).toBe(1);
});

test('already-sent stage is not re-sent', async () => {
  mockDb.certReminderLog.findFirst.mockResolvedValue({ id: 1 }); // ledger has this stage
  mockDb.employeeCertification.findMany.mockResolvedValue([{
    id: 10, certType: 'cpr', status: 'active', currentVersionKey: '10',
    approvedAt: null, expirationDate: new Date('2026-09-08T00:00:00Z'), employee: emp,
  }]);
  const res = await sweepCertRemindersForAgency(NOW);
  expect(mockDb.certReminderLog.create).not.toHaveBeenCalled();
  expect(res.sent).toBe(0);
});

test('expired + not approved triggers compliance block', async () => {
  mockDb.employeeCertification.findMany.mockResolvedValue([{
    id: 11, certType: 'cpr', status: 'active', currentVersionKey: '11',
    approvedAt: null, expirationDate: new Date('2026-08-20T00:00:00Z'), employee: emp,
  }]);
  const res = await sweepCertRemindersForAgency(NOW);
  expect(compliance.evaluateCompliance).toHaveBeenCalledWith(7);
  expect(res.blocked).toBe(1);
});

test('non-requiresExpiry cert type is skipped', async () => {
  mockDb.certType.findMany.mockResolvedValue([{ key: 'id_card', label: 'ID', requiresExpiry: false }]);
  mockDb.employeeCertification.findMany.mockResolvedValue([{
    id: 12, certType: 'id_card', status: 'active', currentVersionKey: '12',
    approvedAt: null, expirationDate: new Date('2026-08-20T00:00:00Z'), employee: emp,
  }]);
  const res = await sweepCertRemindersForAgency(NOW);
  expect(mockDb.certReminderLog.create).not.toHaveBeenCalled();
  expect(compliance.evaluateCompliance).not.toHaveBeenCalled();
  expect(res.checked).toBe(0);
});
