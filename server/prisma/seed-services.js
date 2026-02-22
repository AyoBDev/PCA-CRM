const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_SERVICES = [
    { category: 'PCS', code: 'S5130', name: 'Homemaker' },
    { category: 'PCS', code: 'S5125', name: 'Attendant Care' },
    { category: 'PCS', code: 'S5150', name: 'Unskilled Respite Care' },
    { category: 'SDPC', code: 'SDPC', name: 'Self-Directed Personal Care' },
    { category: 'TIMESHEETS', code: 'TIMESHEETS', name: 'Timesheets' },
];

async function main() {
    console.log('Seeding services...');
    for (const s of DEFAULT_SERVICES) {
        await prisma.service.upsert({
            where: { code: s.code },
            update: { category: s.category, name: s.name },
            create: s,
        });
        console.log(`  ✓ ${s.code} — ${s.name} (${s.category})`);
    }
    console.log('Done.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
