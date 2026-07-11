const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { JWT_SECRET } = require('../config/secrets');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B, superadmin;

beforeAll(async () => {
  A = await createAgencyWithAdmin('cth-a');
  B = await createAgencyWithAdmin('cth-b');
  await systemPrisma.user.create({
    data: { email: 'cth-user-b@cth-b.test', passwordHash: await bcrypt.hash('x', 4), name: 'B Regular', role: 'user', agencyId: B.agency.id },
  });
  superadmin = await systemPrisma.user.create({
    data: { email: 'cth-super@platform.test', passwordHash: await bcrypt.hash('supersecret', 4), name: 'CTH Super', role: 'superadmin' },
  });
});

afterAll(async () => {
  await systemPrisma.auditLog.deleteMany({ where: { agencyId: null } });
  await cleanupAgencies(['cth-a', 'cth-b']);
  await systemPrisma.user.deleteMany({ where: { email: { contains: 'platform.test' } } });
  await systemPrisma.$disconnect();
});

test('GET /api/auth/users on agency A subdomain returns only agency A users (no B, no superadmin)', async () => {
  const res = await request(app).get('/api/auth/users')
    .set('Host', 'cth-a.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(200);
  const emails = res.body.map((u) => u.email);
  expect(emails).toContain(A.admin.email);
  expect(emails).not.toContain(B.admin.email);
  expect(emails).not.toContain('cth-user-b@cth-b.test');
  expect(emails).not.toContain(superadmin.email);
});

test('agency A admin cannot reset a superadmin password', async () => {
  const before = await systemPrisma.user.findUnique({ where: { id: superadmin.id } });
  const res = await request(app).put(`/api/auth/users/${superadmin.id}/reset-password`)
    .set('Host', 'cth-a.localhost')
    .set('Authorization', `Bearer ${A.token}`)
    .send({ password: 'hijacked123' });
  expect(res.status).toBe(404);
  const after = await systemPrisma.user.findUnique({ where: { id: superadmin.id } });
  expect(after.passwordHash).toBe(before.passwordHash);
});

test('agency A JWT replayed against agency B host on backup export is rejected, not a data dump', async () => {
  const res = await request(app).get('/api/backup/export')
    .set('Host', 'cth-b.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect([401, 403]).toContain(res.status);
  expect(res.body.users).toBeUndefined();
});
