/**
 * Upsert clients + authorizations from a spreadsheet.
 * - Matches existing clients by Medicaid ID
 * - Existing clients: updates name/insurance, upserts authorizations
 * - New clients: creates with all authorizations
 * - Never deletes existing data
 *
 * Run:  node prisma/import-upsert.js [path-to-xlsx]
 */

const XLSX = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FILE = process.argv[2] || path.resolve(__dirname, '../../data/all-data.xlsx');

function parseDate(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
        return null;
    }
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

function sameDay(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

async function main() {
    console.log(`\n📂 Reading: ${FILE}\n`);
    const wb = XLSX.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    // Parse spreadsheet into client groups
    const parsed = [];
    let current = null;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const hasContent = row.some(cell => cell !== '' && cell !== undefined && cell !== null);
        if (!hasContent) continue;

        const clientName = String(row[1] || '').trim();
        const medicaidId = String(row[2] || '').trim();
        const insuranceType = String(row[3] || '').trim();
        const serviceCode = String(row[5] || '').trim();
        const serviceName = String(row[6] || '').trim();
        const serviceCategory = String(row[4] || '').trim();
        const authorizedUnits = row[7];
        const authStart = row[8];
        const authEnd = row[9];
        const notes = String(row[12] || '').trim();

        if (clientName) {
            if (current) parsed.push(current);
            current = {
                clientName,
                medicaidId,
                insuranceType: insuranceType || 'MEDICAID',
                authorizations: [],
            };
            continue;
        }

        if (current && serviceCode) {
            current.authorizations.push({
                serviceCategory,
                serviceCode,
                serviceName: serviceName || serviceCode,
                authorizedUnits: parseUnits(authorizedUnits),
                authorizationStartDate: parseDate(authStart),
                authorizationEndDate: parseDate(authEnd),
                notes: notes || '',
            });
        }
    }
    if (current) parsed.push(current);

    console.log(`📊 Parsed ${parsed.length} clients from spreadsheet\n`);

    // Load existing clients indexed by Medicaid ID
    const existingClients = await prisma.client.findMany({
        include: { authorizations: true },
    });
    const clientByMedicaid = {};
    for (const c of existingClients) {
        if (c.medicaidId) clientByMedicaid[c.medicaidId] = c;
    }

    let created = 0, updated = 0, authsCreated = 0, authsUpdated = 0, skipped = 0;

    for (const c of parsed) {
        const existing = c.medicaidId ? clientByMedicaid[c.medicaidId] : null;

        if (existing) {
            // Update client name/insurance if changed
            const updates = {};
            if (c.clientName && c.clientName !== existing.clientName) updates.clientName = c.clientName;
            if (c.insuranceType && c.insuranceType !== existing.insuranceType) updates.insuranceType = c.insuranceType;
            if (Object.keys(updates).length > 0) {
                await prisma.client.update({ where: { id: existing.id }, data: updates });
            }

            // Upsert authorizations
            for (const auth of c.authorizations) {
                const match = existing.authorizations.find(a =>
                    a.serviceCode === auth.serviceCode &&
                    sameDay(a.authorizationStartDate, auth.authorizationStartDate) &&
                    sameDay(a.authorizationEndDate, auth.authorizationEndDate)
                );

                if (match) {
                    // Update units/notes if changed
                    const authUpdates = {};
                    if (auth.authorizedUnits && auth.authorizedUnits !== match.authorizedUnits) authUpdates.authorizedUnits = auth.authorizedUnits;
                    if (auth.serviceName && auth.serviceName !== match.serviceName) authUpdates.serviceName = auth.serviceName;
                    if (auth.serviceCategory && auth.serviceCategory !== match.serviceCategory) authUpdates.serviceCategory = auth.serviceCategory;
                    if (auth.notes && auth.notes !== (match.notes || '')) authUpdates.notes = auth.notes;
                    if (Object.keys(authUpdates).length > 0) {
                        await prisma.authorization.update({ where: { id: match.id }, data: authUpdates });
                        authsUpdated++;
                    } else {
                        skipped++;
                    }
                } else {
                    // Create new authorization for existing client
                    await prisma.authorization.create({
                        data: {
                            clientId: existing.id,
                            serviceCategory: auth.serviceCategory,
                            serviceCode: auth.serviceCode,
                            serviceName: auth.serviceName,
                            authorizedUnits: auth.authorizedUnits,
                            authorizationStartDate: auth.authorizationStartDate,
                            authorizationEndDate: auth.authorizationEndDate || new Date('2030-12-31'),
                            notes: auth.notes,
                        },
                    });
                    authsCreated++;
                }
            }

            updated++;
            console.log(`  ♻️  ${c.clientName} — updated (${c.authorizations.length} auths checked)`);
        } else {
            // Create new client with all authorizations
            const auths = c.authorizations.map(a => ({
                serviceCategory: a.serviceCategory,
                serviceCode: a.serviceCode,
                serviceName: a.serviceName,
                authorizedUnits: a.authorizedUnits,
                authorizationStartDate: a.authorizationStartDate,
                authorizationEndDate: a.authorizationEndDate || new Date('2030-12-31'),
                notes: a.notes,
            }));

            const newClient = await prisma.client.create({
                data: {
                    clientName: c.clientName,
                    medicaidId: c.medicaidId,
                    insuranceType: c.insuranceType,
                    authorizations: { create: auths },
                },
            });

            // Add to lookup so duplicates within the file don't create twice
            clientByMedicaid[c.medicaidId] = { ...newClient, authorizations: auths };
            created++;
            authsCreated += auths.length;
            console.log(`  ✅ ${c.clientName} — created (${auths.length} auths)`);
        }
    }

    console.log(`\n─────────────────────────────────`);
    console.log(`📈 Import complete:`);
    console.log(`   Clients created:       ${created}`);
    console.log(`   Clients updated:       ${updated}`);
    console.log(`   Authorizations created: ${authsCreated}`);
    console.log(`   Authorizations updated: ${authsUpdated}`);
    console.log(`   Authorizations skipped: ${skipped} (unchanged)`);
    console.log(`─────────────────────────────────\n`);
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error('❌ Import failed:', e);
        prisma.$disconnect();
        process.exit(1);
    });
