const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant, getAgencyId } = require('../lib/tenantContext');
const onboarding = require('../services/onboardingService');
const { systemPrisma, cleanupAgencies } = require('./helpers');

let agency, employee, user;

beforeAll(async () => {
  agency = await systemPrisma.agency.create({ data: { name: 'Approve Onboard', slug: 'approve-onboard' } });
  user = await systemPrisma.user.create({
    data: { email: 'approve-onboard-pca@test.com', passwordHash: 'x', name: 'Approve PCA', role: 'pca', status: 'submitted', agencyId: agency.id },
  });
  employee = await systemPrisma.employee.create({
    data: { name: 'Approve PCA', email: 'approve-onboard-pca@test.com', agencyId: agency.id, userId: user.id, onboardingStatus: 'submitted' },
  });
});

afterAll(async () => {
  await systemPrisma.employee.deleteMany({ where: { agencyId: agency.id } });
  await systemPrisma.user.deleteMany({ where: { agencyId: agency.id } });
  await cleanupAgencies(['approve-onboard']);
  await systemPrisma.$disconnect();
});

test('approveOnboarding activates both the employee and the linked user atomically via tenantTransaction', async () => {
  const db = tenantClient(agency.id);
  const result = await runWithTenant({ agencyId: agency.id, db }, async () => {
    expect(getAgencyId()).toBe(agency.id);
    return onboarding.approveOnboarding(db, employee.id);
  });
  expect(result.id).toBe(employee.id);

  const updatedEmployee = await systemPrisma.employee.findUnique({ where: { id: employee.id } });
  const updatedUser = await systemPrisma.user.findUnique({ where: { id: user.id } });
  expect(updatedEmployee.onboardingStatus).toBe('active');
  expect(updatedUser.status).toBe('active');
});

test('approveOnboarding rejects an employee that is not pending approval, leaving state unchanged', async () => {
  const db = tenantClient(agency.id);
  await expect(
    runWithTenant({ agencyId: agency.id, db }, () => onboarding.approveOnboarding(db, employee.id))
  ).rejects.toThrow('Employee is not pending approval');

  const stillActive = await systemPrisma.employee.findUnique({ where: { id: employee.id } });
  expect(stillActive.onboardingStatus).toBe('active');
});

test('approveOnboarding is atomic: if the user update fails, the employee update is rolled back too', async () => {
  const brokenUser = await systemPrisma.user.create({
    data: { email: 'approve-onboard-broken@test.com', passwordHash: 'x', name: 'Broken PCA', role: 'pca', status: 'submitted', agencyId: agency.id },
  });
  const brokenEmployee = await systemPrisma.employee.create({
    data: { name: 'Broken PCA', email: 'approve-onboard-broken@test.com', agencyId: agency.id, userId: brokenUser.id, onboardingStatus: 'submitted' },
  });
  // Delete the user out from under the employee record so the user update
  // inside approveOnboarding's transaction fails (record not found) while
  // the employee update would otherwise succeed on its own.
  await systemPrisma.user.delete({ where: { id: brokenUser.id } });

  const db = tenantClient(agency.id);
  await expect(
    runWithTenant({ agencyId: agency.id, db }, () => onboarding.approveOnboarding(db, brokenEmployee.id))
  ).rejects.toThrow();

  const employeeAfter = await systemPrisma.employee.findUnique({ where: { id: brokenEmployee.id } });
  expect(employeeAfter.onboardingStatus).toBe('submitted');

  await systemPrisma.employee.delete({ where: { id: brokenEmployee.id } });
});
