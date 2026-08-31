const { PrismaClient } = require('@prisma/client');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const { sweepCertRemindersForAgency } = require('../services/certReminderService');

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

let agency, employee, employee2, certType, db;

// `sweepCertRemindersForAgency` accepts an explicit `now` for its own stage
// math, but `complianceService.evaluateCompliance` (called for the
// expired/blocked path) always compares against the real wall clock. Anchor
// `NOW` to the actual current time so an "expired 2 days before NOW" cert is
// also expired relative to `Date.now()` inside evaluateCompliance.
const NOW = new Date();
NOW.setUTCHours(12, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function runSwept(now) {
  const tdb = tenantClient(agency.id);
  return runWithTenant({ db: tdb, agencyId: agency.id }, () => sweepCertRemindersForAgency(now));
}

beforeAll(async () => {
  agency = await owner.agency.create({ data: { name: 'Cert Sweep Agency', slug: 'cert-sweep-a' } });
  db = tenantClient(agency.id);

  certType = await owner.certType.create({
    data: { key: 'cpr', label: 'CPR', requiresExpiry: true, agencyId: agency.id },
  });

  employee = await owner.employee.create({
    data: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      complianceStatus: 'ok',
      agencyId: agency.id,
    },
  });

  employee2 = await owner.employee.create({
    data: {
      name: 'John Roe',
      email: 'john@example.com',
      complianceStatus: 'ok',
      agencyId: agency.id,
    },
  });
});

afterAll(async () => {
  await owner.notification.deleteMany({ where: { agencyId: agency.id } });
  await owner.certReminderLog.deleteMany({ where: { agencyId: agency.id } });
  await owner.employeeCertification.deleteMany({ where: { agencyId: agency.id } });
  await owner.certType.deleteMany({ where: { agencyId: agency.id } });
  await owner.employee.deleteMany({ where: { agencyId: agency.id } });
  await owner.agency.delete({ where: { id: agency.id } });
  await owner.$disconnect();
});

test('sweep sends the 7-day reminder exactly once, writes a ledger row and a notification, and is idempotent on re-run', async () => {
  const cert = await owner.employeeCertification.create({
    data: {
      employeeId: employee.id,
      certType: 'cpr',
      status: 'active',
      currentVersionKey: 'v0',
      expirationDate: new Date(NOW.getTime() + 3 * DAY_MS), // 3 days after NOW
      agencyId: agency.id,
    },
  });

  const first = await runSwept(NOW);
  expect(first.sent).toBeGreaterThanOrEqual(1);

  const logs = await db.certReminderLog.findMany({
    where: { certificationId: cert.id, versionKey: 'v0', stage: 'reminder_7day' },
  });
  expect(logs).toHaveLength(1);

  const notifications = await db.notification.findMany({ where: { employeeId: employee.id } });
  expect(notifications.length).toBeGreaterThanOrEqual(1);

  // Second run with the same `now` must not send the stage again (idempotent).
  const second = await runSwept(NOW);

  const logsAfterSecondRun = await db.certReminderLog.findMany({
    where: { certificationId: cert.id, versionKey: 'v0', stage: 'reminder_7day' },
  });
  expect(logsAfterSecondRun).toHaveLength(1);
  expect(second.sent).toBe(0);
});

test('an expired cert with no approval blocks the employee', async () => {
  await owner.employeeCertification.create({
    data: {
      employeeId: employee2.id,
      certType: 'cpr',
      status: 'active',
      currentVersionKey: 'v0',
      expirationDate: new Date(NOW.getTime() - 2 * DAY_MS), // 2 days before NOW
      approvedAt: null,
      agencyId: agency.id,
    },
  });

  await runSwept(NOW);

  const updated = await owner.employee.findUnique({ where: { id: employee2.id } });
  expect(updated.complianceStatus).toBe('blocked');
});
