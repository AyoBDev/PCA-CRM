const { PrismaClient } = require('@prisma/client');

describe('integration harness', () => {
  test('connects to the test database with migrations applied', async () => {
    const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
    // proves migrations ran — clients table exists
    const count = await prisma.client.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await prisma.$disconnect();
  });
});
