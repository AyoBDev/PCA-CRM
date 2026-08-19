const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

let seq = 0;
function uniq(p) { return `${p}-${Date.now()}-${seq++}-${Math.random().toString(36).slice(2)}`; }

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `${uniq('rd-admin')}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin' } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1 }, JWT_SECRET)}` };
}

// A pending_review employee with a linked login user and NO requirements (the legacy case).
async function pendingReviewEmployee() {
  const user = await prisma.user.create({ data: { email: `${uniq('rd-u')}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'Rd', role: 'pca', status: 'pending' } });
  const emp = await prisma.employee.create({ data: { name: 'Rd EE', email: `${uniq('rd-e')}@t.co`, onboardingStatus: 'pending_review', userId: user.id } });
  return { emp, user };
}

describe('whole-submission onboarding review decisions', () => {
  it('approve → active + user activated', async () => {
    const header = await adminHeader();
    const { emp, user } = await pendingReviewEmployee();
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/approve`).set(header).send();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('approved');
    expect((await prisma.employee.findUnique({ where: { id: emp.id } })).onboardingStatus).toBe('active');
    expect((await prisma.user.findUnique({ where: { id: user.id } })).status).toBe('active');
  });

  it('send-back → changes_requested + note stored + token reopened', async () => {
    const header = await adminHeader();
    const { emp } = await pendingReviewEmployee();
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/send-back`).set(header).send({ note: 'Fix your ID upload' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('changes_requested');
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after.onboardingStatus).toBe('changes_requested');
    expect(after.adminReviewNote).toBe('Fix your ID upload');
    const tok = await prisma.onboardingToken.findFirst({ where: { employeeId: emp.id, status: 'pending', expiresAt: { gt: new Date() } } });
    expect(tok).toBeTruthy();
  });

  it('reject → inactive + user held inactive + note stored', async () => {
    const header = await adminHeader();
    const { emp, user } = await pendingReviewEmployee();
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/reject`).set(header).send({ note: 'Incomplete application' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('inactive');
    const afterEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterEmp.onboardingStatus).toBe('inactive');
    expect(afterEmp.active).toBe(false); // legacy boolean flipped so the list status column shows Inactive
    expect(afterEmp.adminReviewNote).toBe('Incomplete application');
    expect(afterUser.active).toBe(false);
  });

  it('decisions 400 when the employee is not pending_review', async () => {
    const header = await adminHeader();
    const { emp } = await pendingReviewEmployee();
    await prisma.employee.update({ where: { id: emp.id }, data: { onboardingStatus: 'active' } });
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/approve`).set(header).send();
    expect(res.status).toBe(400);
  });

  it('reject requires no per-item state and works with zero requirements', async () => {
    const header = await adminHeader();
    const { emp } = await pendingReviewEmployee();
    const count = await prisma.employeeRequirement.count({ where: { employeeId: emp.id } });
    expect(count).toBe(0); // legacy: no requirement rows
    const res = await request(app).post(`/api/employees/${emp.id}/onboarding/reject`).set(header).send({ note: 'n/a' });
    expect(res.status).toBe(200);
  });
});
