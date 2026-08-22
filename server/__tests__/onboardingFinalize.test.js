const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `fin-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin', agencyId: 1 } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1, agencyId: u.agencyId }, JWT_SECRET)}` };
}

// pending_review employee with a login user + one required requirement, plus a completed token.
async function pendingReviewEmployee() {
  const user = await prisma.user.create({ data: { email: `finu-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'Fin', role: 'pca', status: 'pending', agencyId: 1 } });
  const emp = await prisma.employee.create({ data: { name: 'Fin EE', email: `fin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, onboardingStatus: 'pending_review', userId: user.id, agencyId: 1 } });
  const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted' , agencyId: 1} });
  const tok = await onboarding.createOnboardingToken(prisma, emp.id);
  await prisma.onboardingToken.update({ where: { id: tok.id }, data: { status: 'completed', completedAt: new Date() } });
  return { emp, user, req, tokenStr: tok.token };
}

describe('POST /employees/:id/onboarding/finalize', () => {
  it('all-approved → active + user activated', async () => {
    const header = await adminHeader();
    const { emp, user, req } = await pendingReviewEmployee();
    await prisma.employeeRequirement.update({ where: { id: req.id }, data: { reviewStatus: 'approved' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('approved');
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterEmp.onboardingStatus).toBe('active');
    expect(afterUser.status).toBe('active');
  });

  it('any-rejected → changes_requested + token reopened', async () => {
    const header = await adminHeader();
    const { emp, req } = await pendingReviewEmployee();
    await prisma.employeeRequirement.update({ where: { id: req.id }, data: { reviewStatus: 'rejected', rejectionReason: 'Bad' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('changes_requested');
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(afterEmp.onboardingStatus).toBe('changes_requested');
    const tok = await prisma.onboardingToken.findFirst({ where: { employeeId: emp.id, status: 'pending', expiresAt: { gt: new Date() } } });
    expect(tok).toBeTruthy();
  });

  it('400s if the employee is not pending_review', async () => {
    const header = await adminHeader();
    const { emp } = await pendingReviewEmployee();
    await prisma.employee.update({ where: { id: emp.id }, data: { onboardingStatus: 'active' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(400);
  });

  it('any-rejected with NO existing onboarding token mints a fresh one (changes_requested path)', async () => {
    const header = await adminHeader();
    // Deliberately built without pendingReviewEmployee()/createOnboardingToken — this
    // employee has never had an onboarding token, so finalize's `if (!active) { mint }`
    // branch (as opposed to the updateMany-reopens-an-existing-token branch) is the
    // only way a token can end up existing afterward.
    const emp = await prisma.employee.create({ data: { name: 'NoTok EE', email: `fin-notok-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'rejected', rejectionReason: 'Bad' , agencyId: 1} });

    const before = await prisma.onboardingToken.findFirst({ where: { employeeId: emp.id } });
    expect(before).toBeNull();

    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/finalize`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('changes_requested');

    const tok = await prisma.onboardingToken.findFirst({ where: { employeeId: emp.id, status: 'pending', expiresAt: { gt: new Date() } } });
    expect(tok).toBeTruthy();
  });
});
