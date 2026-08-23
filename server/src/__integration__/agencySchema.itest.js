const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

afterAll(() => prisma.$disconnect());

test('agencies table exists with default agency', async () => {
  const agency = await prisma.agency.findUnique({ where: { slug: 'nvbest' } });
  expect(agency).not.toBeNull();
  expect(agency.status).toBe('active');
});

test('every tenant table has an agency_id column', async () => {
  const missing = await prisma.$queryRaw`
    SELECT t.table_name FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND t.table_name NOT IN ('agencies', '_prisma_migrations')
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name
          AND c.column_name = 'agency_id'
      )`;
  expect(missing).toEqual([]);
});

test('backfill left no NULL agency_id in clients/users/timesheets', async () => {
  for (const table of ['clients', 'users', 'timesheets', 'authorizations', 'audit_logs']) {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE agency_id IS NULL`
    );
    expect({ table, n }).toEqual({ table, n: 0 });
  }
});
