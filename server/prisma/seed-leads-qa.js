// Seed realistic lead data for end-to-end QA of the Lead & Referral Management
// feature. Idempotent: deletes any prior leads whose firstName starts with
// "[QA]" (and their linked converted clients) before re-inserting.
//
// Usage:
//   cd server && node prisma/seed-leads-qa.js
//
// Data shape (~18 leads):
//   - Multiple months across 2025-2026 (exercises Year/Month filter)
//   - Every workflow status (new, review, waiting_insurance, waiting_docs,
//     quoted, pending_start, archived, converted)
//   - 2 dormant leads (archived + dormantAt, updatedAt 100+ days old)
//   - 2 converted leads (linked to real newly-created QA clients)
//   - Mix of case types (initial, transfer, private)

const prisma = require('../src/lib/prisma');

// helper: build a Date N days ago
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
// helper: monthsAgo returns a date in a specific past month (day 15)
const monthsAgo = (n) => {
    const d = new Date();
    d.setDate(15);
    d.setMonth(d.getMonth() - n);
    return d;
};

const LEADS = [
    // --- New (recent, active) ---
    {
        firstName: '[QA] Margaret', lastName: 'Johnson', phone: '7025550101',
        insuranceType: 'Molina Healthcare', referralSource: 'Website inquiry',
        caseType: 'initial', status: 'new',
        createdOffsetDays: 2,
    },
    {
        firstName: '[QA] Roberto', lastName: 'Torres', phone: '7025550102',
        insuranceType: 'Private Pay', referralSource: 'Walk-in',
        caseType: 'private', status: 'new',
        ppRate: 22, ppHoursPerWeek: 20, ppDepositHours: 20,
        createdOffsetDays: 5,
    },
    {
        firstName: '[QA] Carmen', lastName: 'Reyes', phone: '7025550103',
        insuranceType: 'SilverSummit', referralSource: 'Caseworker referral',
        caseType: 'transfer', status: 'new',
        createdOffsetDays: 7,
    },

    // --- In review ---
    {
        firstName: '[QA] James', lastName: 'Williams', phone: '7025550104',
        insuranceType: 'Careource NV', referralSource: 'Hospital discharge',
        caseType: 'initial', status: 'review',
        createdOffsetDays: 10,
    },
    {
        firstName: '[QA] Dorothy', lastName: 'Simmons', phone: '7025550105',
        insuranceType: 'Medicaid', referralSource: 'Doctor referral',
        caseType: 'initial', status: 'review',
        createdOffsetDays: 15,
    },

    // --- Waiting insurance / docs ---
    {
        firstName: '[QA] Clarence', lastName: 'Booker', phone: '7025550106',
        insuranceType: 'Molina Healthcare', referralSource: 'Family referral',
        caseType: 'transfer', status: 'waiting_insurance',
        createdOffsetDays: 20,
    },
    {
        firstName: '[QA] Anita', lastName: 'Washington', phone: '7025550107',
        insuranceType: 'SilverSummit', referralSource: 'Community outreach',
        caseType: 'initial', status: 'waiting_docs',
        createdOffsetDays: 25,
    },

    // --- Quoted / Pending Start ---
    {
        firstName: '[QA] Beatrice', lastName: 'Nguyen', phone: '7025550108',
        insuranceType: 'Private Pay', referralSource: 'Website inquiry',
        caseType: 'private', status: 'quoted',
        ppRate: 25, ppHoursPerWeek: 24, ppDepositHours: 20,
        createdOffsetDays: 30,
    },
    {
        firstName: '[QA] Frederick', lastName: 'Owens', phone: '7025550109',
        insuranceType: 'Molina Healthcare', referralSource: 'Doctor referral',
        caseType: 'initial', status: 'pending_start',
        createdOffsetDays: 35,
    },

    // --- Older (different months, for filter testing) ---
    {
        firstName: '[QA] Sylvia', lastName: 'Martinez', phone: '7025550110',
        insuranceType: 'SilverSummit', referralSource: 'Caseworker referral',
        caseType: 'transfer', status: 'quoted',
        createdAtOverride: monthsAgo(2),
    },
    {
        firstName: '[QA] Edwin', lastName: 'Parker', phone: '7025550111',
        insuranceType: 'Careource NV', referralSource: 'Hospital discharge',
        caseType: 'initial', status: 'review',
        createdAtOverride: monthsAgo(3),
    },
    {
        firstName: '[QA] Louise', lastName: 'Bennett', phone: '7025550112',
        insuranceType: 'Medicaid', referralSource: 'Community outreach',
        caseType: 'initial', status: 'waiting_insurance',
        createdAtOverride: monthsAgo(4),
    },
    {
        firstName: '[QA] Malcolm', lastName: 'Bright', phone: '7025550113',
        insuranceType: 'Molina Healthcare', referralSource: 'Family referral',
        caseType: 'transfer', status: 'new',
        createdAtOverride: monthsAgo(8),
    },

    // --- Archived (manually) ---
    {
        firstName: '[QA] Vera', lastName: 'Hoffman', phone: '7025550114',
        insuranceType: 'SilverSummit', referralSource: 'Website inquiry',
        caseType: 'initial', status: 'archived',
        createdOffsetDays: 60,
        archivedAtOffsetDays: 30,
    },

    // --- Dormant (auto-archived, 100+ days no activity) ---
    {
        firstName: '[QA] Otis', lastName: 'Lambert', phone: '7025550115',
        insuranceType: 'Molina Healthcare', referralSource: 'Hospital discharge',
        caseType: 'initial', status: 'archived',
        createdOffsetDays: 200,
        updatedAtOffsetDays: 120,
        archivedAtOffsetDays: 30,
        dormantAtOffsetDays: 30,
    },
    {
        firstName: '[QA] Lorraine', lastName: 'Whitfield', phone: '7025550116',
        insuranceType: 'Private Pay', referralSource: 'Doctor referral',
        caseType: 'private', status: 'archived',
        createdOffsetDays: 240,
        updatedAtOffsetDays: 150,
        archivedAtOffsetDays: 60,
        dormantAtOffsetDays: 60,
    },

    // --- Converted (with linked client) ---
    {
        firstName: '[QA] Debra', lastName: 'Drake', phone: '7025550117',
        insuranceType: 'Molina Healthcare', referralSource: 'Caseworker referral',
        caseType: 'initial', status: 'converted',
        createdOffsetDays: 45,
        convertedAtOffsetDays: 10,
        archivedAtOffsetDays: 10,
        createClient: { clientName: '[QA] Debra Drake' },
    },
    {
        firstName: '[QA] Reese', lastName: 'Maxwell', phone: '7025550118',
        insuranceType: 'Careource NV', referralSource: 'Website inquiry',
        caseType: 'initial', status: 'converted',
        createdOffsetDays: 55,
        convertedAtOffsetDays: 5,
        archivedAtOffsetDays: 5,
        createClient: { clientName: '[QA] Reese Maxwell' },
    },
];

async function main() {
    console.log('=== Lead QA Seed ===');

    // 1. Delete any prior [QA] leads and any linked clients we created before.
    const priorLeads = await prisma.lead.findMany({
        where: { firstName: { startsWith: '[QA]' } },
        select: { id: true, convertedClientId: true },
    });
    const priorClientIds = priorLeads.map(l => l.convertedClientId).filter(Boolean);
    const delLeads = await prisma.lead.deleteMany({ where: { firstName: { startsWith: '[QA]' } } });
    console.log(`- Deleted ${delLeads.count} prior [QA] leads`);
    if (priorClientIds.length) {
        const delClients = await prisma.client.deleteMany({ where: { id: { in: priorClientIds } } });
        console.log(`- Deleted ${delClients.count} prior [QA] converted clients`);
    }
    const delOrphans = await prisma.client.deleteMany({ where: { clientName: { startsWith: '[QA]' } } });
    if (delOrphans.count) console.log(`- Deleted ${delOrphans.count} orphan [QA] clients`);

    let created = 0;
    let convertedClientsCreated = 0;

    for (const l of LEADS) {
        const createdAt = l.createdAtOverride || (l.createdOffsetDays != null ? daysAgo(l.createdOffsetDays) : new Date());
        const updatedAt = l.updatedAtOffsetDays != null ? daysAgo(l.updatedAtOffsetDays) : createdAt;
        const archivedAt = l.archivedAtOffsetDays != null ? daysAgo(l.archivedAtOffsetDays) : null;
        const dormantAt = l.dormantAtOffsetDays != null ? daysAgo(l.dormantAtOffsetDays) : null;
        const convertedAt = l.convertedAtOffsetDays != null ? daysAgo(l.convertedAtOffsetDays) : null;

        // For converted leads, first create the linked client.
        let convertedClientId = null;
        if (l.createClient) {
            const c = await prisma.client.create({
                data: {
                    clientName: l.createClient.clientName,
                    insuranceType: l.insuranceType || 'MEDICAID',
                    phone: l.phone,
                    enabledServices: '["PAS","Homemaker"]',
                    createdAt: convertedAt || createdAt,
                    updatedAt: convertedAt || createdAt,
                },
            });
            convertedClientId = c.id;
            convertedClientsCreated++;
        }

        const lead = await prisma.lead.create({
            data: {
                firstName: l.firstName,
                lastName: l.lastName,
                phone: l.phone,
                insuranceType: l.insuranceType || '',
                referralSource: l.referralSource || '',
                caseType: l.caseType,
                status: l.status,
                ppRate: l.ppRate || 0,
                ppHoursPerWeek: l.ppHoursPerWeek || 0,
                ppDepositHours: l.ppDepositHours || 0,
                createdBy: 'admin',
                createdAt,
                updatedAt,
                archivedAt,
                dormantAt,
                convertedClientId,
                convertedAt,
            },
        });
        created++;
        console.log(
            `  + ${l.firstName} ${l.lastName} (${l.status}) id=${lead.id}` +
            (convertedClientId ? ` → client ${convertedClientId}` : '') +
            (dormantAt ? ' [dormant]' : '') +
            ` created ${createdAt.toISOString().slice(0, 10)}`
        );
    }

    console.log(`\n✓ Seeded ${created} leads (${convertedClientsCreated} with linked clients).`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
