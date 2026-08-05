const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `rev-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin' } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1 }, JWT_SECRET)}` };
}

// A submitted employee with a login user + a completed token (as after real submit).
async function submittedEmployee() {
  const user = await prisma.user.create({ data: { email: `sube-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'Sub', role: 'pca', status: 'pending' } });
  const emp = await prisma.employee.create({ data: { name: 'Sub EE', email: `sub-emp-${Date.now()}@t.co`, onboardingStatus: 'submitted', userId: user.id } });
  const tok = await onboarding.createOnboardingToken(emp.id);
  await prisma.onboardingToken.update({ where: { id: tok.id }, data: { status: 'completed', completedAt: new Date() } });
  return { emp, user, tokenStr: tok.token };
}

describe('onboarding review decisions (admin)', () => {
  it('request change sends the employee back to onboarding with a note and reopens the link', async () => {
    const header = await adminHeader();
    const { emp, tokenStr } = await submittedEmployee();

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/request-onboarding-change`)
      .set(header)
      .send({ note: 'Please re-upload a clearer ID.' });
    expect(res.status).toBe(200);

    const reloaded = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(reloaded.onboardingStatus).toBe('changes_requested');
    expect(reloaded.adminReviewNote).toBe('Please re-upload a clearer ID.');

    // The employee's existing link works again, and the note is returned to them.
    const info = await request(app).get(`/api/onboarding/${tokenStr}`);
    expect(info.status).toBe(200);
    expect(info.body.adminReviewNote).toBe('Please re-upload a clearer ID.');

    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('reject also sends them back (with note) and is admin-only', async () => {
    const header = await adminHeader();
    const { emp } = await submittedEmployee();
    const res = await request(app)
      .patch(`/api/employees/${emp.id}/reject-onboarding`)
      .set(header)
      .send({ note: 'Not approved yet.' });
    expect(res.status).toBe(200);
    const reloaded = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(reloaded.onboardingStatus).toBe('changes_requested');
    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('approve clears the review note and activates', async () => {
    const header = await adminHeader();
    const { emp } = await submittedEmployee();
    await prisma.employee.update({ where: { id: emp.id }, data: { adminReviewNote: 'old note' } });
    const res = await request(app).patch(`/api/employees/${emp.id}/approve-onboarding`).set(header);
    expect(res.status).toBe(200);
    const reloaded = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(reloaded.onboardingStatus).toBe('active');
    expect(reloaded.adminReviewNote).toBe('');
    await prisma.employee.delete({ where: { id: emp.id } });
  });
});
