const prisma = require('../src/lib/prisma');
const { SERVICE_DEFAULTS } = require('../src/lib/serviceDefaults');

// Create-missing-only: never overwrite an existing (possibly admin-edited)
// row. Service codes are scoped per-agency (agencyId+code composite unique,
// not a global unique on code) so two agencies can each have their own take
// on the same code — this must be seeded per-agency, not once globally.
async function seedServices(agencyId) {
  if (!Number.isInteger(agencyId)) {
    throw new Error('seedServices requires an agencyId — service codes are agency-scoped');
  }
  let created = 0;
  for (const [code, d] of Object.entries(SERVICE_DEFAULTS)) {
    const existing = await prisma.service.findUnique({ where: { agencyId_code: { agencyId, code } } });
    if (existing) continue;
    await prisma.service.create({ data: { code, agencyId, ...d } });
    created++;
  }
  return { created };
}

// Convenience script: seeds SERVICE_DEFAULTS for every existing agency (or
// just agency #1 if none is specified). The platform console seeds a fresh
// agency directly via seedAgencyDefaults()/seedServices() at creation time.
async function main() {
  const agencies = await prisma.agency.findMany({ orderBy: { id: 'asc' } });
  if (agencies.length === 0) {
    console.error('No agency found — run `npm run db:seed` first to create agency #1.');
    process.exit(1);
  }
  let totalCreated = 0;
  for (const agency of agencies) {
    const { created } = await seedServices(agency.id);
    console.log(`Seeded ${created} new service(s) for ${agency.name} (${agency.slug}).`);
    totalCreated += created;
  }
  return { created: totalCreated };
}

if (require.main === module) {
  main()
    .then(({ created }) => { console.log(`Done. Seeded ${created} new service(s) total.`); })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedServices };
