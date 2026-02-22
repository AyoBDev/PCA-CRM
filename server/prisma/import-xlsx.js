/**
 * Import clients + authorizations from data/all-data.xlsx
 *
 * Spreadsheet layout:
 *   Row with col A (number) + col B (name) → new client (parent row)
 *   Row with col E/F/G (service category/code/name) → authorization (child row)
 *   Parent rows that have NO child rows following them AND have no serviceCode
 *     → create client with no auths
 *
 * Run:  node prisma/import-xlsx.js
 */

const XLSX = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FILE = path.resolve(__dirname, '../../data/all-data.xlsx');

function parseDate(val) {
    if (!val && val !== 0) return null;
    // XLSX might give a JS Date already
    if (val instanceof Date) return val;
    // XLSX serial number (days since 1899-12-30)
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
        return null;
    }
    // String like "3/18/2025" or "02/28/2027"
    const str = String(val).trim();
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function parseUnits(val) {
    if (val === undefined || val === null || val === '') return 0;
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
}

async function main() {
    const wb = XLSX.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    // Column mapping (0-indexed):
    //  0: row #      1: Client Name   2: Medicaid ID   3: Insurance Type
    //  4: Service Category  5: Service Code  6: Service Name
    //  7: Authorized Units  8: Auth Start    9: Auth End
    // 10: (status)  11: (days)  12: Notes

    // First pass: group rows into clients
    const clients = [];
    let current = null;

    for (let i = 1; i < rows.length; i++) { // skip header row
        const row = rows[i];

        // Skip completely empty rows
        const hasContent = row.some(cell => cell !== '' && cell !== undefined && cell !== null);
        if (!hasContent) continue;

        const rowNum = row[0];
        const clientName = String(row[1] || '').trim();
        const medicaidId = String(row[2] || '').trim();
        const insuranceType = String(row[3] || '').trim();
        const serviceCategory = String(row[4] || '').trim();
        const serviceCode = String(row[5] || '').trim();
        const serviceName = String(row[6] || '').trim();
        const authorizedUnits = row[7];
        const authStart = row[8];
        const authEnd = row[9];
        const notes = String(row[12] || '').trim();

        // Detect parent row: has a client name
        if (clientName) {
            // Push previous client
            if (current) clients.push(current);

            current = {
                clientName,
                medicaidId,
                insuranceType: insuranceType || 'MEDICAID',
                authorizations: [],
            };
            continue;
        }

        // Detect child row: has a service code
        if (current && serviceCode) {
            current.authorizations.push({
                serviceCategory: serviceCategory || '',
                serviceCode,
                serviceName: serviceName || serviceCode,
                authorizedUnits: parseUnits(authorizedUnits),
                authorizationStartDate: parseDate(authStart),
                authorizationEndDate: parseDate(authEnd),
                notes: notes || '',
            });
        }
    }
    // Push last client
    if (current) clients.push(current);

    console.log(`\n📊 Parsed ${clients.length} clients from spreadsheet\n`);

    // Wipe existing data
    await prisma.authorization.deleteMany();
    await prisma.client.deleteMany();
    console.log('🗑️  Cleared existing data\n');

    // Insert
    let totalAuths = 0;
    for (const c of clients) {
        // Filter out auths with no end date (they need at least SOME date to be useful)
        const auths = c.authorizations.map(a => ({
            serviceCategory: a.serviceCategory,
            serviceCode: a.serviceCode,
            serviceName: a.serviceName,
            authorizedUnits: a.authorizedUnits,
            authorizationStartDate: a.authorizationStartDate,
            authorizationEndDate: a.authorizationEndDate || new Date('2030-12-31'),
            notes: a.notes,
        }));

        const created = await prisma.client.create({
            data: {
                clientName: c.clientName,
                medicaidId: c.medicaidId,
                insuranceType: c.insuranceType,
                authorizations: {
                    create: auths,
                },
            },
        });

        totalAuths += auths.length;
        console.log(`  ✅ ${created.clientName} (${auths.length} auths)`);
    }

    console.log(`\n🌱 Import complete — ${clients.length} clients, ${totalAuths} authorizations\n`);
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error('❌ Import failed:', e);
        prisma.$disconnect();
        process.exit(1);
    });
