const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B, link;

beforeAll(async () => {
  A = await createAgencyWithAdmin('tok-a');
  B = await createAgencyWithAdmin('tok-b');
  const client = await systemPrisma.client.create({
    data: { clientName: 'Tok Alice', agencyId: A.agency.id },
  });
  link = await systemPrisma.permanentLink.create({
    data: { clientId: client.id, pcaName: 'Tok PCA', agencyId: A.agency.id },
  });
});

afterAll(async () => {
  await cleanupAgencies(['tok-a', 'tok-b']);
  await systemPrisma.$disconnect();
});

test("agency A's pca-form token works on agency A's subdomain", async () => {
  const res = await request(app).get(`/api/pca-form/${link.token}`).set('Host', 'tok-a.localhost');
  expect(res.status).toBe(200);
});

test("agency A's pca-form token is rejected on agency B's subdomain", async () => {
  const res = await request(app).get(`/api/pca-form/${link.token}`).set('Host', 'tok-b.localhost');
  expect(res.status).toBe(404);
});

test('unknown token is a plain 404 (no agency oracle)', async () => {
  const res = await request(app).get('/api/pca-form/00000000-0000-0000-0000-000000000000').set('Host', 'tok-a.localhost');
  expect(res.status).toBe(404);
});

test('saving a pca-form for a new week creates the timesheet + entries (nested entries get agencyId)', async () => {
  // Regression: db.timesheet.create nested `entries.create[]` were built without
  // agencyId. The tenant client only auto-stamps the top-level create, so the
  // nested TimesheetEntry rows threw "Argument `agency` is missing" → 500 on save.
  const weekStart = '2026-08-23'; // a Sunday with no existing timesheet
  const res = await request(app)
    .put(`/api/pca-form/${link.token}`)
    .set('Host', 'tok-a.localhost')
    .send({ weekStart, entries: [] });
  expect(res.status).toBeLessThan(300);

  // The timesheet + its 7 day-entries persisted, scoped to agency A.
  const ts = await systemPrisma.timesheet.findFirst({
    where: { clientId: link.clientId, pcaName: link.pcaName },
    include: { entries: true },
  });
  expect(ts).not.toBeNull();
  expect(ts.agencyId).toBe(A.agency.id);
  expect(ts.entries.length).toBe(7);
  expect(ts.entries.every((e) => e.agencyId === A.agency.id)).toBe(true);
});
