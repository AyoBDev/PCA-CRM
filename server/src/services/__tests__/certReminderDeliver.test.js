const mockDb = { certReminderLog: { create: jest.fn() } };
jest.mock('../../lib/tenantContext', () => ({
  getTenantDb: () => mockDb,
  getAgencyId: () => 1,
}));
jest.mock('../reminderChannels/emailChannel', () => ({ send: jest.fn() }));
jest.mock('../reminderChannels/inAppChannel', () => ({ send: jest.fn() }));
jest.mock('../reminderChannels/pushChannel', () => ({ send: jest.fn() }));
jest.mock('../auditService', () => ({ logAction: jest.fn() }));

const email = require('../reminderChannels/emailChannel');
const inApp = require('../reminderChannels/inAppChannel');
const push = require('../reminderChannels/pushChannel');
const { deliverReminder } = require('../certReminderService');

const cert = {
  id: 10, certType: 'cpr', certLabel: 'CPR',
  expirationDate: new Date('2026-09-30T00:00:00Z'),
  employee: { id: 7, name: 'Jane Doe', email: 'jane@example.com' },
};

beforeEach(() => {
  jest.clearAllMocks();
  email.send.mockResolvedValue('sent');
  inApp.send.mockResolvedValue('sent');
  push.send.mockResolvedValue('stubbed');
  mockDb.certReminderLog.create.mockResolvedValue({});
});

test('fans out to all three channels and writes a ledger row', async () => {
  const res = await deliverReminder(cert, 'reminder_30day', '10');
  expect(email.send).toHaveBeenCalled();
  expect(inApp.send).toHaveBeenCalledWith(cert.employee, 'reminder_30day', expect.any(Object));
  expect(push.send).toHaveBeenCalled();
  expect(mockDb.certReminderLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      certificationId: 10, versionKey: '10', stage: 'reminder_30day', agencyId: 1,
      channels: { email: 'sent', inApp: 'sent', push: 'stubbed' },
    }),
  }));
  expect(res.skipped).toBe(false);
});

test('duplicate send (unique violation P2002) is caught and skipped', async () => {
  const e = new Error('unique'); e.code = 'P2002';
  mockDb.certReminderLog.create.mockRejectedValue(e);
  const res = await deliverReminder(cert, 'reminder_30day', '10');
  expect(res.skipped).toBe(true);
});
