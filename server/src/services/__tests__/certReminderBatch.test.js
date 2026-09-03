const mockDb = { certReminderLog: { create: jest.fn() } };
jest.mock('../../lib/tenantContext', () => ({ getTenantDb: () => mockDb, getAgencyId: () => 1 }));
jest.mock('../reminderChannels/emailChannel', () => ({ send: jest.fn() }));
jest.mock('../reminderChannels/inAppChannel', () => ({ send: jest.fn() }));
jest.mock('../reminderChannels/pushChannel', () => ({ send: jest.fn() }));
jest.mock('../auditService', () => ({ logAction: jest.fn() }));

const email = require('../reminderChannels/emailChannel');
const inApp = require('../reminderChannels/inAppChannel');
const push = require('../reminderChannels/pushChannel');
const { deliverReminderBatch } = require('../certReminderService');

const employee = { id: 7, name: 'Jane Doe', email: 'jane@example.com' };
const items = [
  { cert: { id: 10 }, stage: 'expired_final', versionKey: 'v0', certLabel: 'CPR', expDate: new Date('2026-08-15T00:00:00Z') },
  { cert: { id: 11 }, stage: 'reminder_7day', versionKey: 'v0', certLabel: 'TB Test', expDate: new Date('2026-09-10T00:00:00Z') },
];

beforeEach(() => {
  jest.clearAllMocks();
  email.send.mockResolvedValue('sent');
  inApp.send.mockResolvedValue('sent');
  push.send.mockResolvedValue('stubbed');
  mockDb.certReminderLog.create.mockResolvedValue({});
});

test('sends exactly one email and one in-app for the whole batch', async () => {
  await deliverReminderBatch(employee, items);
  expect(email.send).toHaveBeenCalledTimes(1);
  expect(inApp.send).toHaveBeenCalledTimes(1);
  expect(inApp.send).toHaveBeenCalledWith(employee, 'cert_reminder', expect.any(Object));
  expect(push.send).toHaveBeenCalledTimes(1);
});

test('writes one ledger row per item with the shared channels result', async () => {
  await deliverReminderBatch(employee, items);
  expect(mockDb.certReminderLog.create).toHaveBeenCalledTimes(2);
  expect(mockDb.certReminderLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ certificationId: 10, versionKey: 'v0', stage: 'expired_final', agencyId: 1,
      channels: { email: 'sent', inApp: 'sent', push: 'stubbed' } }),
  }));
  expect(mockDb.certReminderLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ certificationId: 11, stage: 'reminder_7day' }),
  }));
});

test('a P2002 on one row is caught and does not abort the remaining rows', async () => {
  const e = new Error('unique'); e.code = 'P2002';
  mockDb.certReminderLog.create.mockRejectedValueOnce(e).mockResolvedValueOnce({});
  const res = await deliverReminderBatch(employee, items);
  expect(mockDb.certReminderLog.create).toHaveBeenCalledTimes(2);
  expect(res.certCount).toBe(2);
});
