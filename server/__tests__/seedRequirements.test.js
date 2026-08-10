const prisma = require('../src/lib/prisma');
const { seedRequirements, DEFAULT_CERT_TYPES } = require('../prisma/seed-requirements');

afterAll(async () => { await prisma.$disconnect(); });

describe('seedRequirements', () => {
  it('seeds canonical cert types and is idempotent', async () => {
    await seedRequirements();
    const cpr = await prisma.certType.findUnique({ where: { key: 'cpr' } });
    expect(cpr).toBeTruthy();
    expect(cpr.renewalYears).toBe(2);
    const countBefore = await prisma.certType.count();
    await seedRequirements(); // second run creates nothing new
    const countAfter = await prisma.certType.count();
    expect(countAfter).toBe(countBefore);
  });

  it('exposes the canonical cert catalog keys', () => {
    const keys = DEFAULT_CERT_TYPES.map(c => c.key);
    expect(keys).toEqual(['id_expiration', 'tb_test', 'cpr', 'annual_training', 'background_check']);
  });
});
