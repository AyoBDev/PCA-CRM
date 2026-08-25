const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B, clientA, clientB, linkA, linkB;

beforeAll(async () => {
  A = await createAgencyWithAdmin('atc-a');
  B = await createAgencyWithAdmin('atc-b');
  clientA = await systemPrisma.client.create({
    data: { clientName: 'ATC Alice', agencyId: A.agency.id },
  });
  clientB = await systemPrisma.client.create({
    data: { clientName: 'ATC Bob', agencyId: B.agency.id },
  });
  linkA = await systemPrisma.permanentLink.create({
    data: { clientId: clientA.id, pcaName: 'ATC PCA A', agencyId: A.agency.id },
  });
  linkB = await systemPrisma.permanentLink.create({
    data: { clientId: clientB.id, pcaName: 'ATC PCA B', agencyId: B.agency.id },
  });
});

afterAll(async () => {
  await cleanupAgencies(['atc-a', 'atc-b']);
  await systemPrisma.$disconnect();
});

test("GET /api/permanent-links with agency A's token returns only agency A's links", async () => {
  const res = await request(app).get('/api/permanent-links')
    .set('Host', 'atc-a.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(200);
  const ids = res.body.map((l) => l.id);
  expect(ids).toContain(linkA.id);
  expect(ids).not.toContain(linkB.id);
});

test("agency A's admin cannot delete agency B's permanent link", async () => {
  const res = await request(app).delete(`/api/permanent-links/${linkB.id}`)
    .set('Host', 'atc-a.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect([404, 400, 500]).toContain(res.status);
  expect(res.status).not.toBe(200);

  const stillThere = await systemPrisma.permanentLink.findUnique({ where: { id: linkB.id } });
  expect(stillThere).not.toBeNull();
  expect(stillThere.active).toBe(true);
});
