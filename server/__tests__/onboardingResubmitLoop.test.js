// Drives the FULL changes_requested → re-submit → pending_review loop through
// the real onboardingService/lifecycle path — the loop the final review found
// broken (C1: duplicate-availability 500; C2: re-submit auto-activated).
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');
const lifecycle = require('../src/services/onboardingLifecycle');

afterAll(async () => { await prisma.$disconnect(); });

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function availabilityPayload() {
  return {
    availableFrom: '2026-01-01',
    availableUntil: null,
    weeklySchedule: { mon: true },
    maxHoursPerWeek: 40,
    maxConcurrentClients: 3,
    maxTravelTime: 30,
    transportation: 'car',
    holidayAvailability: {},
    blackoutDates: [],
    initialTimeOff: [],
    notes: '',
  };
}

// Build an employee that has already been through a first submit + admin review
// that sent them back to changes_requested: a linked minted user, an existing
// availability row, a rejected-then-re-uploaded requirement, and a reopened token.
async function changesRequestedEmployee() {
  const email = `loop-${uniq()}@t.co`;
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash('x', 4), name: 'Loop EE', role: 'pca', status: 'pending', agencyId: 1 },
  });
  const emp = await prisma.employee.create({
    data: { name: 'Loop EE', email, onboardingStatus: 'changes_requested', userId: user.id, agencyId: 1 },
  });
  await prisma.employeeRequirement.create({
    data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'pending', agencyId: 1 },
  });
  // Availability already exists from the first submit — the @unique employeeId
  // means a second create() would P2002/500.
  await prisma.employeeAvailability.create({
    data: {
      employeeId: emp.id, availableFrom: new Date('2025-01-01'), availableUntil: null,
      weeklySchedule: { sun: true }, maxHoursPerWeek: 10, maxConcurrentClients: 1,
      maxTravelDistance: 5, transportation: 'walk', holidayAvailability: {},
      blackoutDates: [], initialTimeOff: [], notes: 'old', agencyId: 1,
    },
  });
  const tok = await onboarding.createOnboardingToken(prisma, emp.id);
  return { emp, user, tokenStr: tok.token };
}

describe('re-submit loop after changes_requested', () => {
  it('does not 500 on duplicate availability and lands in pending_review (NOT active)', async () => {
    const { emp, user, tokenStr } = await changesRequestedEmployee();

    const result = await onboarding.completeOnboarding(tokenStr, {
      password: 'password123', availability: availabilityPayload(),
    });

    // C2: must NOT skip approval / auto-activate on re-submit.
    expect(result.skipApproval).toBe(false);

    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterEmp.onboardingStatus).toBe('pending_review');
    expect(afterUser.status).not.toBe('active'); // user not auto-activated

    // C1: availability upserted, not duplicated — still exactly one row, updated.
    const avails = await prisma.employeeAvailability.findMany({ where: { employeeId: emp.id } });
    expect(avails).toHaveLength(1);
    expect(avails[0].maxHoursPerWeek).toBe(40); // updated from the old 10

    // A lifecycle transition audit exists for the changes_requested → pending_review move.
    const audits = await prisma.auditLog.findMany({ where: { entityType: 'Employee', entityId: emp.id } });
    const toPendingReview = audits.some(a => {
      let m = {};
      try { m = JSON.parse(a.metadata || '{}'); } catch { /* ignore */ }
      return m.statusTo === 'pending_review';
    });
    expect(toPendingReview).toBe(true);

    await prisma.employee.delete({ where: { id: emp.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('external-account adoption still skips approval and activates (first submit, pre-existing external user)', async () => {
    // A brand-new employee whose email already has a pre-existing (external) user,
    // and the employee is NOT yet linked to any user (userId null).
    const email = `ext-${uniq()}@t.co`;
    const externalUser = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('x', 4), name: 'External', role: 'admin', status: 'active', agencyId: 1 },
    });
    const emp = await prisma.employee.create({
      data: { name: 'External', email, onboardingStatus: 'invitation_pending', userId: null, agencyId: 1 },
    });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);

    const result = await onboarding.completeOnboarding(tok.token, {
      password: 'password123', availability: availabilityPayload(),
    });

    expect(result.skipApproval).toBe(true);
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(afterEmp.onboardingStatus).toBe('active');
    expect(afterEmp.userId).toBe(externalUser.id);

    await prisma.employee.delete({ where: { id: emp.id } });
    await prisma.user.delete({ where: { id: externalUser.id } });
  });

  it('first-ever submit (no existing user) creates the user and goes to pending_review', async () => {
    const email = `new-${uniq()}@t.co`;
    const emp = await prisma.employee.create({
      data: { name: 'Fresh', email, onboardingStatus: 'invitation_pending', userId: null, agencyId: 1 },
    });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);

    const result = await onboarding.completeOnboarding(tok.token, {
      password: 'password123', availability: availabilityPayload(),
    });

    expect(result.skipApproval).toBe(false);
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(afterEmp.onboardingStatus).toBe('pending_review');
    const createdUser = await prisma.user.findFirst({ where: { email } });
    expect(createdUser).toBeTruthy();
    expect(createdUser.status).not.toBe('active');

    await prisma.employee.delete({ where: { id: emp.id } });
    await prisma.user.delete({ where: { id: createdUser.id } });
  });
});
