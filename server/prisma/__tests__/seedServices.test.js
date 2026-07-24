const prisma = require('../../src/lib/prisma');
const { SERVICE_DEFAULTS } = require('../../src/lib/serviceDefaults');
const { seedServices } = require('../seed-services');

describe('seedServices', () => {
  let agencyId;

  beforeAll(async () => {
    const agency = await prisma.agency.create({
      data: { name: 'Seed Services Test Agency', slug: `seed-services-test-${Date.now()}` },
    });
    agencyId = agency.id;
  });

  afterAll(async () => {
    await prisma.agency.delete({ where: { id: agencyId } });
    await prisma.$disconnect();
  });

  test('every default code exists with complete fields after seeding', async () => {
    await seedServices(agencyId);
    for (const code of Object.keys(SERVICE_DEFAULTS)) {
      const row = await prisma.service.findUnique({ where: { agencyId_code: { agencyId, code } } });
      expect(row).not.toBeNull();
      expect(row.timesheetSection).toBe(SERVICE_DEFAULTS[code].timesheetSection);
    }
  });

  test('does not overwrite an existing edited row', async () => {
    await prisma.service.update({ where: { agencyId_code: { agencyId, code: 'PCS' } }, data: { color: '#000000' } });
    await seedServices(agencyId);
    const row = await prisma.service.findUnique({ where: { agencyId_code: { agencyId, code: 'PCS' } } });
    expect(row.color).toBe('#000000');
  });
});
