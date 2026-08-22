const prisma = require('../src/lib/prisma');
const { seedRequirements, DEFAULT_CERT_TYPES } = require('../prisma/seed-requirements');

let agencyId;

beforeAll(async () => {
  // Use a dedicated agency, not the shared default agency (id 1) — many other
  // unit test files also seed/create catalog rows against agency 1 concurrently,
  // so counting rows scoped to agency 1 here would be a cross-test race, not a
  // real idempotency check.
  const agency = await prisma.agency.create({ data: { name: `Seed Req Test ${Date.now()}`, slug: `seed-req-test-${Date.now()}` } });
  agencyId = agency.id;
});

afterAll(async () => {
  await prisma.certType.deleteMany({ where: { agencyId } });
  await prisma.agency.delete({ where: { id: agencyId } });
  await prisma.$disconnect();
});

describe('seedRequirements', () => {
  it('seeds canonical cert types and is idempotent', async () => {
    await seedRequirements(prisma, agencyId);
    const cpr = await prisma.certType.findFirst({ where: { key: 'cpr', agencyId } });
    expect(cpr).toBeTruthy();
    expect(cpr.renewalYears).toBe(2);
    const countBefore = await prisma.certType.count({ where: { agencyId } });
    await seedRequirements(prisma, agencyId); // second run creates nothing new
    const countAfter = await prisma.certType.count({ where: { agencyId } });
    expect(countAfter).toBe(countBefore);
  });

  it('exposes the canonical cert catalog keys', () => {
    const keys = DEFAULT_CERT_TYPES.map(c => c.key);
    expect(keys).toEqual(['id_expiration', 'tb_test', 'cpr', 'annual_training', 'background_check']);
  });
});
