const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const auths = await prisma.authorization.findMany({
        where: { manualStatus: 'active', archivedAt: null },
        orderBy: [{ clientId: 'asc' }, { serviceCode: 'asc' }, { authorizationStartDate: 'desc' }, { id: 'desc' }],
        include: { client: { select: { clientName: true } } },
    });

    const groups = {};
    for (const a of auths) {
        const key = `${a.clientId}|${a.serviceCode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
    }

    const toDeactivate = [];
    for (const [key, items] of Object.entries(groups)) {
        if (items.length <= 1) continue;
        // items[0] has the latest start date (kept active), rest get deactivated
        for (let i = 1; i < items.length; i++) {
            toDeactivate.push(items[i]);
        }
    }

    if (toDeactivate.length === 0) {
        console.log('No duplicate active authorizations found. Nothing to do.');
        return;
    }

    console.log(`Found ${toDeactivate.length} duplicate active auth(s) to deactivate:`);
    for (const a of toDeactivate) {
        const start = a.authorizationStartDate ? a.authorizationStartDate.toISOString().split('T')[0] : 'no-start';
        const end = a.authorizationEndDate ? a.authorizationEndDate.toISOString().split('T')[0] : 'no-end';
        console.log(`  - ID ${a.id}: ${a.client.clientName} / ${a.serviceCode} (${start} to ${end})`);
    }

    const result = await prisma.authorization.updateMany({
        where: { id: { in: toDeactivate.map(a => a.id) } },
        data: { manualStatus: 'inactive' },
    });

    console.log(`\nDone. Deactivated ${result.count} authorization(s).`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
