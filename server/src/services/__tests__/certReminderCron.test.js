jest.mock('../../lib/prisma', () => ({ agency: { findMany: jest.fn() } }));
jest.mock('../../lib/tenantPrisma', () => ({ tenantClient: jest.fn(() => ({})) }));
jest.mock('../../lib/tenantContext', () => ({ runWithTenant: jest.fn((ctx, fn) => fn()) }));
jest.mock('../certReminderService', () => ({ sweepCertRemindersForAgency: jest.fn().mockResolvedValue({ sent: 0, blocked: 0, checked: 0 }) }));

const prisma = require('../../lib/prisma');
const sweep = require('../certReminderService');
const { runCertReminderSweep } = require('../../jobs/certReminderCron');

beforeEach(() => jest.clearAllMocks());

test('runs the sweep for each active agency', async () => {
  prisma.agency.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  await runCertReminderSweep();
  expect(sweep.sweepCertRemindersForAgency).toHaveBeenCalledTimes(2);
});

test('one agency failing does not abort the others', async () => {
  prisma.agency.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  sweep.sweepCertRemindersForAgency.mockRejectedValueOnce(new Error('boom'));
  await runCertReminderSweep();
  expect(sweep.sweepCertRemindersForAgency).toHaveBeenCalledTimes(2);
});
