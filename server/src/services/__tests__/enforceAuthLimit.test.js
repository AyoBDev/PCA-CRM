const prisma = require('../../lib/prisma');
const registry = require('../serviceRegistry');

describe('serviceRegistry.sectionEnforcesLimit', () => {
  afterEach(() => registry.invalidate());
  afterAll(async () => { await prisma.$disconnect(); });

  test('PAS enforces because PCS (enforceAuthLimit=true) contributes', async () => {
    await registry.getServiceMap();
    expect(await registry.sectionEnforcesLimit('PAS')).toBe(true);
  });

  test('a section with only enforceAuthLimit=false services does not enforce', async () => {
    // create an isolated section whose only service has the flag off
    await prisma.service.upsert({
      where: { code: '__NOLIMIT__' },
      update: { timesheetSection: 'ZZTESTSECTION', enforceAuthLimit: false, archivedAt: null },
      create: { category: 'GUIDE', code: '__NOLIMIT__', timesheetSection: 'ZZTESTSECTION', enforceAuthLimit: false },
    });
    registry.invalidate();
    await registry.getServiceMap();
    expect(await registry.sectionEnforcesLimit('ZZTESTSECTION')).toBe(false);
    await prisma.service.delete({ where: { code: '__NOLIMIT__' } });
  });
});
