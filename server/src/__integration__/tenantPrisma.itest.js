const { PrismaClient } = require('@prisma/client');
const { tenantClient, tenantTransaction } = require('../lib/tenantPrisma');

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
let a, b;

beforeAll(async () => {
  a = await owner.agency.create({ data: { name: 'TP A', slug: 'tp-a' } });
  b = await owner.agency.create({ data: { name: 'TP B', slug: 'tp-b' } });
  await owner.client.create({ data: { clientName: 'TP Alice', agencyId: a.id } });
  await owner.client.create({ data: { clientName: 'TP Bob', agencyId: b.id } });
});

afterAll(async () => {
  await owner.client.deleteMany({ where: { agencyId: { in: [a.id, b.id] } } });
  await owner.agency.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await owner.$disconnect();
});

test('findMany is scoped to the tenant', async () => {
  const rows = await tenantClient(a.id).client.findMany({ where: { clientName: { startsWith: 'TP ' } } });
  expect(rows.map((r) => r.clientName)).toEqual(['TP Alice']);
});

test('cross-tenant findUnique by id returns null', async () => {
  const bob = await owner.client.findFirst({ where: { clientName: 'TP Bob' } });
  const leaked = await tenantClient(a.id).client.findUnique({ where: { id: bob.id } });
  expect(leaked).toBeNull();
});

test('create auto-stamps agencyId', async () => {
  const created = await tenantClient(a.id).client.create({ data: { clientName: 'TP Carol' } });
  expect(created.agencyId).toBe(a.id);
});

test('forged agencyId in create is rejected', async () => {
  await expect(
    tenantClient(a.id).client.create({ data: { clientName: 'TP Mallory', agencyId: b.id } })
  ).rejects.toThrow();
});

test('$queryRaw is scoped too', async () => {
  const rows = await tenantClient(a.id)
    .$queryRaw`SELECT client_name FROM clients WHERE client_name LIKE 'TP %' ORDER BY client_name`;
  expect(rows.map((r) => r.client_name)).toEqual(['TP Alice', 'TP Carol']);
});

test('tenantTransaction runs multiple ops under one context', async () => {
  const names = await tenantTransaction(a.id, async (tx) => {
    await tx.client.create({ data: { clientName: 'TP Dave', agencyId: a.id } });
    const rows = await tx.client.findMany({ where: { clientName: { startsWith: 'TP ' } } });
    return rows.map((r) => r.clientName).sort();
  });
  expect(names).toEqual(['TP Alice', 'TP Carol', 'TP Dave']);
});

test('rejects garbage agencyId', () => {
  expect(() => tenantClient(0)).toThrow();
  expect(() => tenantClient('1; DROP TABLE clients')).toThrow();
  expect(() => tenantClient(undefined)).toThrow();
});

test('$queryRawUnsafe and $executeRawUnsafe are blocked on tenant clients', async () => {
  const db = tenantClient(a.id);
  await expect(db.$queryRawUnsafe('SELECT 1')).rejects.toThrow(/not allowed on tenant clients/);
  await expect(db.$executeRawUnsafe('SELECT 1')).rejects.toThrow(/not allowed on tenant clients/);
});
