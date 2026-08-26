const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { systemPrisma } = require('./helpers');

let superadmin;
const PASSWORD = 'super-secret-1';

beforeAll(async () => {
  superadmin = await systemPrisma.user.create({
    data: {
      email: 'super-gating@platform.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      name: 'Super Gating',
      role: 'superadmin',
    },
  });
});

afterAll(async () => {
  // Login fires before tenant context exists for superadmins (no agencyId),
  // so it writes agency_id = NULL audit rows — clean those up so
  // agencySchema.itest.js's backfill-NULL check stays deterministic
  // regardless of file execution order (see tenantAuth.itest.js for the
  // same pattern).
  await systemPrisma.auditLog.deleteMany({ where: { userId: superadmin.id, agencyId: null } });
  await systemPrisma.user.delete({ where: { id: superadmin.id } });
  await systemPrisma.$disconnect();
});

test('superadmin login succeeds on admin.localhost (platform host)', async () => {
  const res = await request(app).post('/api/auth/login')
    .set('Host', 'admin.localhost')
    .send({ email: superadmin.email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
});

test('superadmin login succeeds on bare loopback (platform host in test env)', async () => {
  const res = await request(app).post('/api/auth/login')
    .set('Host', 'localhost')
    .send({ email: superadmin.email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
});
