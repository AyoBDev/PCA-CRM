const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, client, auth;

beforeAll(async () => {
  A = await createAgencyWithAdmin('renew-a');
  client = await systemPrisma.client.create({ data: { clientName: 'Renew Alice', agencyId: A.agency.id } });
  auth = await systemPrisma.authorization.create({
    data: {
      clientId: client.id,
      serviceCode: 'PCS',
      serviceName: 'Personal Care Services',
      authorizedUnits: 100,
      authorizationStartDate: new Date('2026-01-01'),
      authorizationEndDate: new Date('2026-06-30'),
      agencyId: A.agency.id,
    },
  });
});

afterAll(async () => {
  await cleanupAgencies(['renew-a']);
  await systemPrisma.$disconnect();
});

test('renewAuthorization stamps agencyId on the new authorization', async () => {
  const res = await request(app)
    .post(`/api/authorizations/${auth.id}/renew`)
    .set('Host', 'renew-a.localhost')
    .set('Authorization', `Bearer ${A.token}`)
    .send({
      serviceCode: 'PCS',
      serviceName: 'Personal Care Services',
      authorizedUnits: 120,
      authorizationStartDate: '2026-07-01',
      authorizationEndDate: '2026-12-31',
    });
  expect(res.status).toBeLessThan(300);
  const renewed = await systemPrisma.authorization.findFirst({
    where: { clientId: client.id, id: { not: auth.id } },
    orderBy: { id: 'desc' },
  });
  expect(renewed).not.toBeNull();
  expect(renewed.agencyId).toBe(A.agency.id);
});
