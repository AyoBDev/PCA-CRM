/**
 * Backfill Client.authorizationRequired and Authorization.authorizationType.
 *
 * Rules (see docs / Timesheet Authorization Validation spec §2, §6):
 *   - Client.authorizationRequired = false when insuranceType matches Private Pay
 *     or GUIDE (case-insensitive); true for everyone else.
 *   - Authorization.authorizationType = "Annual Visits" for authorizations belonging
 *     to GUIDE clients; "Weekly Units" for everyone else.
 *
 * Produces a spot-check report (stdout + CSV) so office staff can review every
 * client's resulting value before go-live. Idempotent — safe to re-run.
 *
 * Run: cd server && node prisma/backfill-authorization-required.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRIVATE_PAY_RE = /private\s*pay/i;
const GUIDE_RE = /guide/i;

function isGuide(insuranceType) {
    return GUIDE_RE.test(insuranceType || '');
}

function authRequiredFor(insuranceType) {
    const t = insuranceType || '';
    if (PRIVATE_PAY_RE.test(t) || GUIDE_RE.test(t)) return false;
    return true;
}

async function main() {
    const clients = await prisma.client.findMany({
        select: { id: true, clientName: true, insuranceType: true },
        orderBy: { clientName: 'asc' },
    });

    const report = [];
    let clientsUpdated = 0;
    let authsUpdated = 0;

    for (const c of clients) {
        const required = authRequiredFor(c.insuranceType);
        await prisma.client.update({
            where: { id: c.id },
            data: { authorizationRequired: required },
        });
        clientsUpdated++;

        // GUIDE clients: mark their authorizations as Annual Visits.
        if (isGuide(c.insuranceType)) {
            const res = await prisma.authorization.updateMany({
                where: { clientId: c.id },
                data: { authorizationType: 'Annual Visits' },
            });
            authsUpdated += res.count;
        }

        report.push({
            clientName: c.clientName,
            insuranceType: c.insuranceType || '',
            authorizationRequired: required ? 'Yes' : 'No',
        });
    }

    // Print report
    console.log(`\nBackfill complete. Clients updated: ${clientsUpdated}, GUIDE auths set to Annual Visits: ${authsUpdated}\n`);
    console.log('Spot-check report (review Private Pay / GUIDE = No before go-live):');
    console.log('  clientName | insuranceType | authorizationRequired');
    for (const r of report) {
        console.log(`  ${r.clientName} | ${r.insuranceType} | ${r.authorizationRequired}`);
    }

    // Write CSV
    const outDir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const csvPath = path.join(outDir, 'auth-required-backfill-report.csv');
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ['clientName,insuranceType,authorizationRequired']
        .concat(report.map(r => [r.clientName, r.insuranceType, r.authorizationRequired].map(esc).join(',')))
        .join('\n');
    fs.writeFileSync(csvPath, csv + '\n');
    console.log(`\nCSV written to ${csvPath}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
