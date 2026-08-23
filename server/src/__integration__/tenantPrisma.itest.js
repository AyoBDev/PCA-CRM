const { PrismaClient } = require('@prisma/client');
const { tenantClient, tenantTransaction } = require('../lib/tenantPrisma');
const { CIPHERTEXT_RE } = require('../lib/phiCrypto');

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

describe('PHI transparency on the tenant client', () => {
  // The headline risk this test guards against: tenantPrisma.js's base
  // connection has no PHI extension of its own. If tenantClient() were ever
  // built directly off that raw connection (skipping phiCrypto's
  // encrypt-on-write / decrypt-on-read layer), every tenant-scoped request —
  // i.e. all normal app traffic — would silently read and write PHI fields
  // (Client.medicaidId/dob/notes/pcaNotes, etc.) in PLAINTEXT.
  test('a PHI field written through tenantClient is stored encrypted and read back decrypted, scoped to its agency', async () => {
    const db = tenantClient(a.id);

    const created = await db.client.create({
      data: { clientName: 'TP PHI Alice', medicaidId: '99988877701', dob: '1955-04-10' },
    });
    expect(created.agencyId).toBe(a.id);
    // Transparent decryption: the tenant client hands back plaintext.
    expect(created.medicaidId).toBe('99988877701');
    expect(created.dob).toBe('1955-04-10');

    // What's actually on disk must be ciphertext, not plaintext — verified via
    // the raw, unextended owner connection (mirrors how lib/prismaBase.js /
    // the backup export intentionally see ciphertext).
    const raw = await owner.client.findUnique({ where: { id: created.id } });
    expect(CIPHERTEXT_RE.test(raw.medicaidId)).toBe(true);
    expect(CIPHERTEXT_RE.test(raw.dob)).toBe(true);
    expect(raw.medicaidId).not.toBe('99988877701');

    // Reading it back through the tenant client decrypts again.
    const refetched = await db.client.findUnique({ where: { id: created.id } });
    expect(refetched.medicaidId).toBe('99988877701');
    expect(refetched.dob).toBe('1955-04-10');

    // And it's still tenant-scoped: agency B's tenant client can't see it.
    const leaked = await tenantClient(b.id).client.findUnique({ where: { id: created.id } });
    expect(leaked).toBeNull();

    await owner.client.delete({ where: { id: created.id } });
  });
});
