const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, superadmin;

beforeAll(async () => {
  A = await createAgencyWithAdmin('rpg-a');
  superadmin = await systemPrisma.user.create({
    data: { email: 'rpg-super@platform.test', passwordHash: await bcrypt.hash('x', 4), name: 'RPG Super', role: 'superadmin' },
  });
});

afterAll(async () => {
  await systemPrisma.passwordResetToken.deleteMany({ where: { userId: { in: [A.admin.id, superadmin.id] } } });
  await cleanupAgencies(['rpg-a']);
  await systemPrisma.user.deleteMany({ where: { email: { contains: 'platform.test' } } });
  await systemPrisma.$disconnect();
});

test("an agency user's reset token does NOT work on the apex domain", async () => {
  const resetToken = await systemPrisma.passwordResetToken.create({
    data: { userId: A.admin.id, agencyId: A.agency.id, expiresAt: new Date(Date.now() + 3600000) },
  });
  const res = await request(app).post('/api/auth/reset-password-with-token')
    .set('Host', 'localhost')
    .send({ token: resetToken.token, password: 'newpassword1' });
  expect(res.status).toBe(400);

  const stillThere = await systemPrisma.passwordResetToken.findUnique({ where: { id: resetToken.id } });
  expect(stillThere.usedAt).toBeNull();
});

test("an agency user's reset token still works on that agency's own subdomain", async () => {
  const resetToken = await systemPrisma.passwordResetToken.create({
    data: { userId: A.admin.id, agencyId: A.agency.id, expiresAt: new Date(Date.now() + 3600000) },
  });
  const res = await request(app).post('/api/auth/reset-password-with-token')
    .set('Host', 'rpg-a.localhost')
    .send({ token: resetToken.token, password: 'newpassword2' });
  expect(res.status).toBe(200);
});
