const request = require('supertest');
const app = require('../app');
const { createAgencyWithAdmin, cleanupAgencies, systemPrisma } = require('./helpers');

let A;

beforeAll(async () => {
  A = await createAgencyWithAdmin('hostinfo-a');
});

afterAll(async () => {
  await cleanupAgencies(['hostinfo-a']);
  await systemPrisma.$disconnect();
});

test('admin.localhost reports type platform', async () => {
  const res = await request(app).get('/api/host-info').set('Host', 'admin.localhost');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ type: 'platform' });
});

test('agency subdomain reports type agency with name and slug', async () => {
  const res = await request(app).get('/api/host-info').set('Host', 'hostinfo-a.localhost');
  expect(res.status).toBe(200);
  expect(res.body.type).toBe('agency');
  expect(res.body.agency).toMatchObject({ name: A.agency.name, slug: 'hostinfo-a' });
});

test('loopback host reports type platform in test env (dev/test convenience)', async () => {
  const res = await request(app).get('/api/host-info').set('Host', 'localhost');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ type: 'platform' });
});
