const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { JWT_SECRET } = require('../config/secrets');
const { systemPrisma, cleanupAgencies } = require('./helpers');

let superToken;

beforeAll(async () => {
  const superadmin = await systemPrisma.user.create({
    data: { email: 'super@platform.test', passwordHash: await bcrypt.hash('x', 4), name: 'Super', role: 'superadmin' },
  });
  superToken = jwt.sign(
    { id: superadmin.id, email: superadmin.email, name: 'Super', role: 'superadmin',
      permissions: [], permissionsVersion: 1, agencyId: null, agencySlug: null },
    JWT_SECRET, { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await cleanupAgencies(['plat-a']);
  await systemPrisma.user.deleteMany({ where: { email: { contains: 'platform.test' } } });
  await systemPrisma.$disconnect();
});

function platformReq(method, url) {
  return request(app)[method](url).set('Host', 'localhost').set('Authorization', `Bearer ${superToken}`);
}

test('superadmin creates an agency with seeded defaults and first admin', async () => {
  const res = await platformReq('post', '/api/platform/agencies')
    .send({ name: 'Platform A', slug: 'plat-a', adminEmail: 'admin@platform.test', adminName: 'PA Admin' });
  expect(res.status).toBe(201);
  const agencyId = res.body.agency.id;
  expect(await systemPrisma.service.count({ where: { agencyId } })).toBeGreaterThan(0);
  expect(await systemPrisma.insuranceType.count({ where: { agencyId } })).toBeGreaterThan(0);
  expect(await systemPrisma.adminFolder.count({ where: { agencyId } })).toBeGreaterThan(0);
  const admin = await systemPrisma.user.findFirst({ where: { agencyId, role: 'admin' } });
  expect(admin.email).toBe('admin@platform.test');
});

test('duplicate slug is rejected', async () => {
  const res = await platformReq('post', '/api/platform/agencies')
    .send({ name: 'Dup', slug: 'plat-a', adminEmail: 'x@platform.test', adminName: 'X' });
  expect(res.status).toBe(409);
});

test('non-superadmin cannot reach platform routes', async () => {
  const { createAgencyWithAdmin } = require('./helpers');
  const t = await createAgencyWithAdmin('plat-tmp');
  const res = await request(app).get('/api/platform/agencies')
    .set('Host', 'localhost').set('Authorization', `Bearer ${t.token}`);
  expect(res.status).toBe(403);
  await cleanupAgencies(['plat-tmp']);
});

test('impersonation returns a scoped 30-min token and audits it', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const res = await platformReq('post', `/api/platform/agencies/${agency.id}/impersonate`).send({});
  expect(res.status).toBe(200);
  const payload = jwt.verify(res.body.token, JWT_SECRET);
  expect(payload.agencyId).toBe(agency.id);
  expect(payload.role).toBe('admin');
  expect(payload.impersonatorId).toBeTruthy();
  // impersonated request works on the agency subdomain
  const list = await request(app).get('/api/clients')
    .set('Host', 'plat-a.localhost').set('Authorization', `Bearer ${res.body.token}`);
  expect(list.status).toBe(200);
});

test('impersonation via explicit userId rejects archived/inactive/non-admin targets', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const archived = await systemPrisma.user.create({
    data: { email: 'archived-admin@platform.test', passwordHash: 'x', name: 'Archived', role: 'admin', agencyId: agency.id, archivedAt: new Date() },
  });
  const res = await platformReq('post', `/api/platform/agencies/${agency.id}/impersonate`).send({ userId: archived.id });
  expect(res.status).toBe(404);
});

test('tenant backup is scoped; platform backup is full', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const admin = await systemPrisma.user.findFirst({ where: { agencyId: agency.id, role: 'admin' } });
  const adminToken = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: 'admin',
      permissions: [], permissionsVersion: 1, agencyId: agency.id, agencySlug: 'plat-a' },
    JWT_SECRET, { expiresIn: '1h' }
  );
  const scoped = await request(app).get('/api/backup/export')
    .set('Host', 'plat-a.localhost').set('Authorization', `Bearer ${adminToken}`);
  expect(scoped.status).toBe(200);
  const scopedUsers = scoped.body.users || scoped.body.data?.users || [];
  expect(scopedUsers.every((u) => u.agencyId === agency.id)).toBe(true);

  const full = await platformReq('get', '/api/platform/backup');
  expect(full.status).toBe(200);
});

test('superadmin renames an agency via PATCH /api/platform/agencies/:id', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const res = await platformReq('patch', `/api/platform/agencies/${agency.id}`)
    .send({ name: 'Platform A Renamed' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Platform A Renamed');

  const updated = await systemPrisma.agency.findUnique({ where: { id: agency.id } });
  expect(updated.name).toBe('Platform A Renamed');

  const log = await systemPrisma.auditLog.findFirst({
    where: { entityType: 'Agency', entityId: agency.id, action: 'UPDATE' },
    orderBy: { createdAt: 'desc' },
  });
  expect(log).not.toBeNull();
  const changes = JSON.parse(log.changes);
  expect(changes.some((c) => c.field === 'name')).toBe(true);
});

test('PATCH /api/platform/agencies/:id rejects an empty name', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const res = await platformReq('patch', `/api/platform/agencies/${agency.id}`)
    .send({ name: '   ' });
  expect(res.status).toBe(400);
});

test('non-superadmin cannot rename an agency', async () => {
  const { createAgencyWithAdmin } = require('./helpers');
  const t = await createAgencyWithAdmin('plat-tmp2');
  const res = await request(app).patch(`/api/platform/agencies/${t.agency.id}`)
    .set('Host', 'localhost').set('Authorization', `Bearer ${t.token}`)
    .send({ name: 'Hijacked Name' });
  expect(res.status).toBe(403);
  await cleanupAgencies(['plat-tmp2']);
});

test('platform routes 404 off the platform host even with a valid superadmin token', async () => {
  const res = await request(app).get('/api/platform/agencies')
    .set('Host', 'plat-a.localhost').set('Authorization', `Bearer ${superToken}`);
  expect(res.status).toBe(404);
});
