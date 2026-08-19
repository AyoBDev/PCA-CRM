const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

const PW = 'secret123';
let seq = 0;
function uniq(p) { return `${p}-${Date.now()}-${seq++}-${Math.random().toString(36).slice(2)}`; }

// Create a login user + linked employee with the given user.status / employee.onboardingStatus.
async function makeEmployeeUser({ userStatus = 'pending', onboardingStatus = 'changes_requested', active = true, archivedAt = null } = {}) {
  const user = await prisma.user.create({
    data: { email: `${uniq('elg-u')}@t.co`, passwordHash: await bcrypt.hash(PW, 4), name: 'ELG', role: 'pca', status: userStatus, active, archivedAt },
  });
  const emp = await prisma.employee.create({
    data: { name: 'ELG EE', email: `${uniq('elg-e')}@t.co`, userId: user.id, onboardingStatus },
  });
  return { user, emp };
}

function loginReq(email, password = PW) {
  return request(app).post('/api/auth/employee-login').send({ email, password });
}

describe('employee-login onboarding gate (pending user.status relaxation)', () => {
  it('changes_requested employee with a pending login user CAN log in (200 + token)', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'changes_requested' });
    const res = await loginReq(user.email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.onboardingStatus).toBe('changes_requested');
  });

  it('pending_review employee with a pending login user CAN log in (200 + token)', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'pending_review' });
    const res = await loginReq(user.email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.onboardingStatus).toBe('pending_review');
  });

  it('active employee with an active user still logs in (unchanged happy path)', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'active', onboardingStatus: 'active' });
    const res = await loginReq(user.email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('pending user whose employee is NOT in the onboarding set is still 403 (pending approval)', async () => {
    // e.g. a pending user linked to an invitation_pending employee — not yet onboarding.
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'invitation_pending' });
    const res = await loginReq(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/pending admin approval/i);
  });

  it('archived user in the onboarding set is STILL 403 (archived), not relaxed', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'changes_requested', archivedAt: new Date() });
    const res = await loginReq(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/archived/i);
  });

  it('deactivated (active:false) user in the onboarding set is STILL 403 (deactivated), not relaxed', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'changes_requested', active: false });
    const res = await loginReq(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it('wrong password for a changes_requested employee is 401, not 200', async () => {
    const { user } = await makeEmployeeUser({ userStatus: 'pending', onboardingStatus: 'changes_requested' });
    const res = await loginReq(user.email, 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('a pending user with NO linked employee is still 403 (no relaxation without an onboarding employee)', async () => {
    const user = await prisma.user.create({
      data: { email: `${uniq('elg-noemp')}@t.co`, passwordHash: await bcrypt.hash(PW, 4), name: 'NoEmp', role: 'pca', status: 'pending' },
    });
    const res = await loginReq(user.email);
    expect(res.status).toBe(403);
  });
});

describe('finalizeOnboarding changes_requested branch does not demote the login user', () => {
  it('leaves user.status untouched (no forced pending) so the portal stays reachable', async () => {
    // Build a pending_review employee whose user is already active (post-adoption),
    // with one rejected requirement so finalize takes the changes_requested branch.
    const user = await prisma.user.create({
      data: { email: `${uniq('fin-u')}@t.co`, passwordHash: await bcrypt.hash(PW, 4), name: 'FinU', role: 'pca', status: 'active' },
    });
    const emp = await prisma.employee.create({
      data: { name: 'Fin EE', email: `${uniq('fin-e')}@t.co`, onboardingStatus: 'pending_review', userId: user.id },
    });
    await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'rejected', rejectionReason: 'Bad' } });

    const result = await onboarding.finalizeOnboarding(emp.id, { userId: 0, userName: 'admin', userRole: 'admin' });
    expect(result.outcome).toBe('changes_requested');

    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterUser.status).toBe('active'); // NOT demoted to 'pending'

    // And regardless, the employee can still authenticate to the gated portal.
    const res = await loginReq(user.email);
    expect(res.status).toBe(200);
    expect(res.body.user.onboardingStatus).toBe('changes_requested');
  });
});
