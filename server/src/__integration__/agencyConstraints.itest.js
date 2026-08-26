const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'constraint-test' } } });
  await prisma.agency.deleteMany({ where: { slug: { startsWith: 'ctest' } } });
  await prisma.$disconnect();
});

test('same email allowed in two different agencies', async () => {
  const a = await prisma.agency.create({ data: { name: 'CTest A', slug: 'ctest-a' } });
  const b = await prisma.agency.create({ data: { name: 'CTest B', slug: 'ctest-b' } });
  const email = 'constraint-test@example.com';
  await prisma.user.create({ data: { email, passwordHash: 'x', name: 'A', role: 'admin', agencyId: a.id } });
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'B', role: 'admin', agencyId: b.id } })
  ).resolves.toMatchObject({ email });
  // duplicate inside the SAME agency is rejected
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'A2', role: 'admin', agencyId: a.id } })
  ).rejects.toThrow();
});

test('two superadmins cannot share an email (partial index)', async () => {
  const email = 'constraint-test-super@example.com';
  await prisma.user.create({ data: { email, passwordHash: 'x', name: 'S1', role: 'superadmin' } });
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'S2', role: 'superadmin' } })
  ).rejects.toThrow();
});

test('clients.agency_id is NOT NULL', async () => {
  const [{ is_nullable }] = await prisma.$queryRaw`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'agency_id'`;
  expect(is_nullable).toBe('NO');
});
