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
