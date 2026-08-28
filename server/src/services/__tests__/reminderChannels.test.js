jest.mock('../notificationService', () => ({
  sendEmail: jest.fn(),
  isEmailConfigured: jest.fn(() => true),
}));
jest.mock('../complianceService', () => ({
  createNotification: jest.fn(),
}));

const notif = require('../notificationService');
const compliance = require('../complianceService');
const emailChannel = require('../reminderChannels/emailChannel');
const inAppChannel = require('../reminderChannels/inAppChannel');
const pushChannel = require('../reminderChannels/pushChannel');

const emp = { id: 7, name: 'Jane', email: 'jane@example.com' };
const msg = { subject: 'S', html: '<p>h</p>', text: 't', title: 'T', body: 'B' };

beforeEach(() => jest.clearAllMocks());

test('email channel returns "sent" when Brevo resolves', async () => {
  notif.sendEmail.mockResolvedValue({});
  expect(await emailChannel.send(emp, msg)).toBe('sent');
  expect(notif.sendEmail).toHaveBeenCalledWith('jane@example.com', 'S', '<p>h</p>', 't');
});

test('email channel returns "skipped" when not configured', async () => {
  notif.isEmailConfigured.mockReturnValueOnce(false);
  expect(await emailChannel.send(emp, msg)).toBe('skipped');
  expect(notif.sendEmail).not.toHaveBeenCalled();
});

test('email channel returns "skipped" when employee has no email', async () => {
  expect(await emailChannel.send({ ...emp, email: '' }, msg)).toBe('skipped');
});

test('email channel returns "failed" when Brevo throws', async () => {
  notif.sendEmail.mockRejectedValue(new Error('boom'));
  expect(await emailChannel.send(emp, msg)).toBe('failed');
});

test('in-app channel creates a notification and returns "sent"', async () => {
  compliance.createNotification.mockResolvedValue({});
  expect(await inAppChannel.send(emp, 'reminder_7day', msg)).toBe('sent');
  expect(compliance.createNotification).toHaveBeenCalledWith(7, 'reminder_7day', 'T', 'B');
});

test('in-app channel returns "failed" when create throws', async () => {
  compliance.createNotification.mockRejectedValue(new Error('boom'));
  expect(await inAppChannel.send(emp, 'reminder_7day', msg)).toBe('failed');
});

test('push channel is a stub returning "stubbed"', async () => {
  expect(await pushChannel.send(emp, msg)).toBe('stubbed');
});
