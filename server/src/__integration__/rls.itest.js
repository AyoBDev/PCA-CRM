const { PrismaClient } = require('@prisma/client');
const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const appConn = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let agencyA, agencyB;

beforeAll(async () => {
  agencyA = await owner.agency.create({ data: { name: 'RLS A', slug: 'rls-a' } });
  agencyB = await owner.agency.create({ data: { name: 'RLS B', slug: 'rls-b' } });
  await owner.client.create({ data: { clientName: 'Alice A', agencyId: agencyA.id } });
  await owner.client.create({ data: { clientName: 'Bob B', agencyId: agencyB.id } });
});

afterAll(async () => {
  await owner.client.deleteMany({ where: { agencyId: { in: [agencyA.id, agencyB.id] } } });
  await owner.agency.deleteMany({ where: { id: { in: [agencyA.id, agencyB.id] } } });
  await owner.$disconnect();
  await appConn.$disconnect();
});

test('app_user with no tenant context sees zero rows (fails closed)', async () => {
  const rows = await appConn.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } });
  expect(rows).toEqual([]);
});

test('app_user with agency A context sees only agency A rows', async () => {
  const [, rows] = await appConn.$transaction([
    appConn.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyA.id)}, TRUE)`,
    appConn.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } }),
  ]);
  expect(rows.map((r) => r.clientName)).toEqual(['Alice A']);
});

test('app_user cannot insert a row for another agency (WITH CHECK)', async () => {
  await expect(
    appConn.$transaction([
      appConn.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyA.id)}, TRUE)`,
      appConn.client.create({ data: { clientName: 'Sneaky', agencyId: agencyB.id } }),
    ])
  ).rejects.toThrow();
});

test('owner connection bypasses RLS (backups, migrations)', async () => {
  const rows = await owner.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } });
  expect(rows).toHaveLength(2);
});
