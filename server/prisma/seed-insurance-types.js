const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_TYPES = [
    { name: 'AGING DISABILITY', color: '#F5C9B0' },
    { name: 'MEDICAID', color: '#C8E6C9' },
    { name: 'MOLINA', color: '#B71C1C' },
    { name: 'SILVERSUMMIT', color: '#BBDEFB' },
    { name: 'CARESOURCE', color: '#0D47A1' },
    { name: 'GUIDE', color: '#311B92' },
];

async function main() {
    console.log('Seeding insurance types...');
    for (const t of DEFAULT_TYPES) {
        await prisma.insuranceType.upsert({
            where: { name: t.name },
            update: { color: t.color },
            create: t,
        });
        console.log(`  ✓ ${t.name} (${t.color})`);
    }
    console.log('Done.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
