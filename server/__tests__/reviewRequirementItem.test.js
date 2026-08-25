const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

async function adminHeader() {
  const u = await prisma.user.create({ data: { email: `ri-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: 'admin', role: 'admin', agencyId: 1 } });
  return { Authorization: `Bearer ${jwt.sign({ id: u.id, role: 'admin', permissionsVersion: u.permissionsVersion ?? 1, agencyId: u.agencyId }, JWT_SECRET)}` };
}

async function empWithReq() {
  const emp = await prisma.employee.create({ data: { name: 'RI EE', email: `ri-${Date.now()}-${Math.random().toString(36).slice(2)}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 } });
  const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted' , agencyId: 1} });
  return { emp, req };
}

describe('PATCH /employees/:id/requirements/:reqId/review', () => {
  it('approves an item', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'approved' });
    expect(res.status).toBe(200);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('approved');
  });

  it('rejects an item with a reason', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'rejected', reason: 'Blurry scan' });
    expect(res.status).toBe(200);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('rejected');
    expect(after.rejectionReason).toBe('Blurry scan');
  });

  it('400s on reject with a blank reason', async () => {
    const header = await adminHeader();
    const { emp, req } = await empWithReq();
    const res = await request(app).patch(`/api/employees/${emp.id}/requirements/${req.id}/review`).set(header).send({ decision: 'rejected', reason: '  ' });
    expect(res.status).toBe(400);
  });

  it('404s when the requirement is not owned by the employee', async () => {
    const header = await adminHeader();
    const { req } = await empWithReq();
    const other = await prisma.employee.create({ data: { name: 'Other', email: `other-${Date.now()}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 } });
    const res = await request(app).patch(`/api/employees/${other.id}/requirements/${req.id}/review`).set(header).send({ decision: 'approved' });
    expect(res.status).toBe(404);
  });
});
