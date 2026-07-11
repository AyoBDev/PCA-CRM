const { PrismaClient } = require('@prisma/client');
const { seedAgencyDefaults } = require('./seedAgencyDefaults');
const prisma = new PrismaClient();

// Convenience script: seeds reference data (insurance types, services,
// workflow triggers, admin folders) for agency #1. Kept for local/manual use
// — the platform console calls seedAgencyDefaults directly for every new
// agency created through POST /api/platform/agencies.
async function main() {
    const agency = await prisma.agency.findFirst({ orderBy: { id: 'asc' } });
    if (!agency) {
        console.error('No agency found — run `npm run db:seed` first to create agency #1.');
        process.exit(1);
    }
    console.log(`Seeding agency defaults for ${agency.name} (${agency.slug})...`);
    await seedAgencyDefaults(prisma, agency.id);
    console.log('Done.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
