const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

// Live tenant-path coverage for PUT /api/auth/users/:id. This is the real
// bug that shipped: the handler used the RLS-bypassing owner client with
// findUnique({ where: { email } }), which throws under the multi-tenant
// schema (unique key is agencyId_email, not email) — a 500 in production.
// These tests drive the endpoint through resolveAgency + tenant middleware +
// RLS, exactly as the browser does.

let A, B, inactiveA, otherA, userB;

beforeAll(async () => {
  A = await createAgencyWithAdmin('uu-a');
  B = await createAgencyWithAdmin('uu-b');
  const hash = await bcrypt.hash('oldpass1', 4);

  // Agency A: an inactive "office" account to be renamed for a new hire.
  inactiveA = await systemPrisma.user.create({
    data: { email: 'office@uu-a.test', passwordHash: hash, name: 'Araceli Mongalvo', role: 'user', active: false, agencyId: A.agency.id },
  });
  // Agency A: another active user, to test in-agency email collision.
  otherA = await systemPrisma.user.create({
    data: { email: 'other@uu-a.test', passwordHash: hash, name: 'Other A', role: 'user', active: true, agencyId: A.agency.id },
  });
  // Agency B: a user whose email is identical in shape but belongs to B.
  userB = await systemPrisma.user.create({
    data: { email: 'shared@example.test', passwordHash: hash, name: 'User B', role: 'user', active: true, agencyId: B.agency.id },
  });
});

afterAll(async () => {
  await cleanupAgencies(['uu-a', 'uu-b']);
  await systemPrisma.$disconnect();
});

const putA = (id, body) => request(app).put(`/api/auth/users/${id}`)
  .set('Host', 'uu-a.localhost').set('Authorization', `Bearer ${A.token}`).send(body);

test('renames an inactive user, same email, new password, reactivate — no 500', async () => {
  const res = await putA(inactiveA.id, { name: 'Maria Lopez', email: 'office@uu-a.test', password: 'newhire2026', active: true });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Maria Lopez');
  expect(res.body.active).toBe(true);

  const fresh = await systemPrisma.user.findUnique({ where: { id: inactiveA.id } });
  expect(await bcrypt.compare('newhire2026', fresh.passwordHash)).toBe(true);
  expect(fresh.permissionsVersion).toBeGreaterThan(1);
});

test('409 when the email belongs to a different user in the same agency', async () => {
  const res = await putA(inactiveA.id, { email: 'other@uu-a.test' });
  expect(res.status).toBe(409);
});

test('an email used by another AGENCY does not collide (agency-scoped uniqueness)', async () => {
  const res = await putA(inactiveA.id, { email: 'shared@example.test' });
  expect(res.status).toBe(200);
  expect(res.body.email).toBe('shared@example.test');
  // Agency B's identically-emailed user is untouched.
  const stillB = await systemPrisma.user.findUnique({ where: { id: userB.id } });
  expect(stillB.agencyId).toBe(B.agency.id);
});

test("agency A's admin cannot edit a user in agency B", async () => {
  const res = await putA(userB.id, { name: 'Hacked' });
  expect(res.status).not.toBe(200);
  expect([404, 400, 500]).toContain(res.status);
  const stillB = await systemPrisma.user.findUnique({ where: { id: userB.id } });
  expect(stillB.name).toBe('User B');
});
