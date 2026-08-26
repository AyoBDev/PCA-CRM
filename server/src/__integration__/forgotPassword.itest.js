const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A;

beforeAll(async () => {
  A = await createAgencyWithAdmin('fpw-a');
});

afterAll(async () => {
  await cleanupAgencies(['fpw-a']);
  await systemPrisma.$disconnect();
});

test('forgot-password creates an agency-stamped reset token and returns success', async () => {
  const res = await request(app).post('/api/auth/forgot-password')
    .set('Host', 'fpw-a.localhost')
    .send({ email: A.admin.email });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  const token = await systemPrisma.passwordResetToken.findFirst({
    where: { userId: A.admin.id, usedAt: null },
    orderBy: { id: 'desc' },
  });
  expect(token).not.toBeNull();
  expect(token.agencyId).toBe(A.agency.id);
});

test('reset with the token works on the agency subdomain', async () => {
  const token = await systemPrisma.passwordResetToken.findFirst({
    where: { userId: A.admin.id, usedAt: null },
  });
  const res = await request(app).post('/api/auth/reset-password-with-token')
    .set('Host', 'fpw-a.localhost')
    .send({ token: token.token, password: 'newpass123' });
  expect(res.status).toBe(200);
});
