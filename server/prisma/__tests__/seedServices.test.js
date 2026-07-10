const prisma = require('../../src/lib/prisma');
const { SERVICE_DEFAULTS } = require('../../src/lib/serviceDefaults');
const { seedServices } = require('../seed-services');

describe('seedServices', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test('every default code exists with complete fields after seeding', async () => {
    await seedServices();
    for (const code of Object.keys(SERVICE_DEFAULTS)) {
      const row = await prisma.service.findUnique({ where: { code } });
      expect(row).not.toBeNull();
      expect(row.timesheetSection).toBe(SERVICE_DEFAULTS[code].timesheetSection);
    }
  });

  test('does not overwrite an existing edited row', async () => {
    await prisma.service.update({ where: { code: 'PCS' }, data: { color: '#000000' } });
    await seedServices();
    const row = await prisma.service.findUnique({ where: { code: 'PCS' } });
    expect(row.color).toBe('#000000');
  });
});
