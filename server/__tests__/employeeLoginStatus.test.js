const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');

afterAll(async () => { await prisma.$disconnect(); });

it('employee-login returns onboardingStatus', async () => {
  const pw = 'secret123';
  const user = await prisma.user.create({ data: { email: `els-${Date.now()}@t.co`, passwordHash: await bcrypt.hash(pw, 4), name: 'ELS', role: 'pca', status: 'active', agencyId: 1 } });
  await prisma.employee.create({ data: { name: 'ELS EE', email: `els-emp-${Date.now()}@t.co`, userId: user.id, onboardingStatus: 'changes_requested', agencyId: 1 } });
  const res = await request(app).post('/api/auth/employee-login').set('Host', 'nvbest.localhost').send({ email: user.email, password: pw });
  expect(res.status).toBe(200);
  expect(res.body.user.onboardingStatus).toBe('changes_requested');
});
