const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_SERVICES = [
    { category: 'PCS', code: 'S5130', name: 'Homemaker' },
    { category: 'PCS', code: 'S5125', name: 'Attendant Care' },
    { category: 'PCS', code: 'S5150', name: 'Unskilled Respite Care' },
    { category: 'SDPC', code: 'SDPC', name: 'Self-Directed Personal Care' },
    { category: 'TIMESHEETS', code: 'TIMESHEETS', name: 'Timesheet (Private)' },
    { category: 'TIMESHEETS', code: 'TIMESHEET_PCS', name: 'Timesheet – Personal Care Services (PCS)' },
    { category: 'TIMESHEETS', code: 'TIMESHEET_HOMEMAKER', name: 'Timesheet – Homemaker' },
    { category: 'TIMESHEETS', code: 'TIMESHEET_RESPITE', name: 'Timesheet – Respite' },
    { category: 'TIMESHEETS', code: 'TIMESHEET_COMPANION', name: 'Timesheet – Companion' },
    { category: 'TIMESHEETS', code: 'TIMESHEET_CHORE', name: 'Timesheet – Chore' },
    { category: 'COPE', code: 'COPE', name: 'COPE' },
    { category: 'PAS', code: 'PAS', name: 'Personal Assistance Services' },
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
