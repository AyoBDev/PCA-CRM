const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B;

beforeAll(async () => {
  A = await createAgencyWithAdmin('auth-a');
  B = await createAgencyWithAdmin('auth-b');
  await systemPrisma.client.create({ data: { clientName: 'Auth Alice', agencyId: A.agency.id } });
  await systemPrisma.client.create({ data: { clientName: 'Auth Bob', agencyId: B.agency.id } });
});

afterAll(async () => {
  // The login flow audits before tenant context exists (agencyId is not yet
  // known to auditService), so it writes agency_id = NULL rows. Clean those
  // up so agencySchema.itest.js's backfill-NULL check stays deterministic
  // regardless of file execution order.
  await systemPrisma.auditLog.deleteMany({ where: { userId: A.admin.id, agencyId: null } });
  await cleanupAgencies(['auth-a', 'auth-b']);
  await systemPrisma.$disconnect();
});

function onAgency(slug) {
  return (r) => r.set('Host', `${slug}.localhost`);
}

test('login is scoped to the subdomain agency', async () => {
  const ok = await request(app).post('/api/auth/login')
    .set('Host', 'auth-a.localhost')
    .send({ email: A.admin.email, password: 'secret123' });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toBeTruthy();

  const wrong = await request(app).post('/api/auth/login')
    .set('Host', 'auth-b.localhost')
    .send({ email: A.admin.email, password: 'secret123' });
  expect(wrong.status).toBe(401);
});

test('agency A token lists only agency A clients', async () => {
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-a.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(200);
  const names = res.body.map((c) => c.clientName).filter((n) => n.startsWith('Auth '));
  expect(names).toEqual(['Auth Alice']);
});

test('agency A token replayed on agency B subdomain is rejected', async () => {
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-b.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(401);
});

test('token without agencyId (pre-migration session) is rejected', async () => {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../config/secrets');
  const legacy = jwt.sign(
    { id: A.admin.id, email: A.admin.email, name: A.admin.name, role: 'admin', permissionsVersion: 1 },
    JWT_SECRET, { expiresIn: '1h' }
  );
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-a.localhost')
    .set('Authorization', `Bearer ${legacy}`);
  expect(res.status).toBe(401);
});

test('suspended agency gets 403', async () => {
  await systemPrisma.agency.update({ where: { id: B.agency.id }, data: { status: 'suspended' } });
  const { clearAgencyCache } = require('../middleware/resolveAgency');
  clearAgencyCache();
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-b.localhost')
    .set('Authorization', `Bearer ${B.token}`);
  expect(res.status).toBe(403);
  await systemPrisma.agency.update({ where: { id: B.agency.id }, data: { status: 'active' } });
  clearAgencyCache();
});
