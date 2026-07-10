const prisma = require('../src/lib/prisma');
const { SERVICE_DEFAULTS } = require('../src/lib/serviceDefaults');

// Create-missing-only: never overwrite an existing (possibly admin-edited) row.
async function seedServices() {
  let created = 0;
  for (const [code, d] of Object.entries(SERVICE_DEFAULTS)) {
    const existing = await prisma.service.findUnique({ where: { code } });
    if (existing) continue;
    await prisma.service.create({ data: { code, ...d } });
    created++;
  }
  return { created };
}

if (require.main === module) {
  seedServices()
    .then(({ created }) => { console.log(`Seeded ${created} new service(s).`); })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedServices };
