/**
 * Import clients from Monday.com XLSX export
 *
 * Sheet 1: Client data with D.O.B., doctor info, PA#, etc.
 * Sheet 2: Renewal notification history → ClientNote records
 *
 * Usage:  node prisma/import-monday-xlsx.js <path-to-xlsx> [--existing-only]
 *
 * Flags:
 *   --existing-only  Only update clients that already exist in the DB.
 *                    Skips creating new clients. Does NOT touch authorizations.
 *                    Use this when running against production to avoid disrupting data.
 *
 * Behavior: Additive/upsert by client name (case-insensitive).
 *   - Existing clients: updated with non-empty XLSX values (bio fields only, never authorizations)
 *   - New clients: created (unless --existing-only flag is set)
 *   - No clients or data deleted
 */

const XLSX = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ──

function parseDate(val) {
    if (val === undefined || val === null || val === '') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
        return null;
    }
    const str = String(val).trim();
    if (!str) return null;
    const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (parts) {
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        let year = parseInt(parts[3], 10);
        if (year < 100) {
            year = year <= 29 ? 2000 + year : 1900 + year;
        }
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function parseDob(val) {
    return parseDate(val);
}

function parseMondayDate(val) {
    if (!val) return null;
    const str = String(val).trim();
    const d = new Date(str.replace(/\s+/g, ' '));
    return isNaN(d.getTime()) ? null : d;
}

function parseDoctorInfo(text) {
    const result = { doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '' };
    if (!text || typeof text !== 'string') return result;

    const cleaned = text.trim();
    if (!cleaned) return result;

    const phonePattern = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;

    const backupIdx = cleaned.search(/backup/i);
    let primaryPart, backupPart;

    if (backupIdx > 0) {
        primaryPart = cleaned.substring(0, backupIdx).trim();
        backupPart = cleaned.substring(backupIdx).replace(/^backup[:\s]*/i, '').trim();
    } else {
        const segments = cleaned.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
        primaryPart = segments[0] || '';
        backupPart = segments[1] || '';
    }

    const primaryPhones = primaryPart.match(phonePattern);
    if (primaryPhones) {
        result.doctorPhone = primaryPhones[0];
        result.doctorName = primaryPart.replace(phonePattern, '').replace(/[,\s]+$/, '').trim();
    } else {
        result.doctorName = primaryPart;
    }

    if (backupPart) {
        const backupPhones = backupPart.match(phonePattern);
        if (backupPhones) {
            result.backupDoctorPhone = backupPhones[0];
            result.backupDoctorName = backupPart.replace(phonePattern, '').replace(/[,\s]+$/, '').trim();
        } else {
            result.backupDoctorName = backupPart;
        }
    }

    return result;
}

const SECTION_LABELS = new Set([
    'CLIENT AUTH. ACTIVE/RENEWALS LIST',
    'CRITICAL LIST',
    'ACTIVE CLIENTS AUTHORIZATION',
    'ISO CLIENTS',
    'INACTIVE CLIENTS',
    'SUPERVISER REVIEW REMINDER',
    'Name',
    'SAMPLE',
    'Subitems',
]);

function isStructuralRow(row) {
    const colA = String(row[0] || '').trim();
    if (!colA) return true;
    if (SECTION_LABELS.has(colA)) return true;
    return false;
}

// ── Sheet 1: Client Data ──

async function importClients(ws, { existingOnly = false } = {}) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const stats = { created: 0, updated: 0, skipped: 0, errors: [] };

    let inCriticalSection = false;
    let criticalNames = new Set();

    for (let i = 0; i < rows.length; i++) {
        const colA = String(rows[i][0] || '').trim();
        if (colA === 'CRITICAL LIST') {
            inCriticalSection = true;
            continue;
        }
        if (colA === 'ACTIVE CLIENTS AUTHORIZATION') {
            inCriticalSection = false;
            continue;
        }
        if (inCriticalSection && colA && !SECTION_LABELS.has(colA)) {
            criticalNames.add(colA.toLowerCase());
        }
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (isStructuralRow(row)) continue;

        const name = String(row[0] || '').trim();
        if (!name) continue;

        const dob = parseDob(row[2]);
        const medicaidId = String(row[3] || '').trim();
        const insuranceType = String(row[4] || '').trim();
        const paNumber = String(row[12] || '').trim();
        const phone = String(row[15] || '').trim();
        const address = String(row[16] || '').trim();
        const doctorInfo = parseDoctorInfo(row[17]);
        const notes = String(row[19] || '').trim();
        const isCritical = criticalNames.has(name.toLowerCase());

        try {
            const existing = await prisma.client.findFirst({
                where: { clientName: { equals: name, mode: 'insensitive' } },
            });

            const data = {};
            if (medicaidId) data.medicaidId = medicaidId;
            if (insuranceType) data.insuranceType = insuranceType;
            if (phone) data.phone = phone;
            if (address) data.address = address;
            if (dob) data.dob = dob;
            if (paNumber) data.paNumber = paNumber;
            if (doctorInfo.doctorName) data.doctorName = doctorInfo.doctorName;
            if (doctorInfo.doctorPhone) data.doctorPhone = doctorInfo.doctorPhone;
            if (doctorInfo.backupDoctorName) data.backupDoctorName = doctorInfo.backupDoctorName;
            if (doctorInfo.backupDoctorPhone) data.backupDoctorPhone = doctorInfo.backupDoctorPhone;
            if (notes) data.notes = notes;
            data.critical = isCritical;

            if (existing) {
                await prisma.client.update({
                    where: { id: existing.id },
                    data,
                });
                stats.updated++;
                console.log(`  Updated: ${name} (id=${existing.id})`);
            } else if (existingOnly) {
                stats.skipped++;
            } else {
                data.clientName = name;
                await prisma.client.create({ data });
                stats.created++;
                console.log(`  Created: ${name}`);
            }
        } catch (err) {
            stats.errors.push({ row: i, name, error: err.message });
            console.error(`  ERROR row ${i} (${name}): ${err.message}`);
        }
    }

    return stats;
}

// ── Sheet 2: Renewal Notification History ──

async function importNotes(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const stats = { imported: 0, unmatched: 0, errors: [], unmatchedNames: [] };

    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[1] || '').trim();
        if (!name) continue;

        const dateStr = row[5];
        const content = String(row[6] || '').trim();
        if (!content) continue;

        const date = parseMondayDate(dateStr);
        if (!date) {
            stats.errors.push({ row: i, name, error: `Unparseable date: ${dateStr}` });
            console.error(`  ERROR row ${i} (${name}): Unparseable date: ${dateStr}`);
            continue;
        }

        let type = 'RENEWAL_NOTICE';
        if (content.includes('60 DAYS PA RENEWAL')) {
            type = '60_DAY_RENEWAL';
        } else if (content.includes('30 DAYS PA RENEWAL')) {
            type = '30_DAY_RENEWAL';
        }

        try {
            const client = await prisma.client.findFirst({
                where: { clientName: { equals: name, mode: 'insensitive' } },
            });

            if (!client) {
                stats.unmatched++;
                if (!stats.unmatchedNames.includes(name)) stats.unmatchedNames.push(name);
                console.warn(`  WARN row ${i}: No client match for "${name}"`);
                continue;
            }

            // Skip if an identical note already exists (idempotent)
            const existing = await prisma.clientNote.findFirst({
                where: { clientId: client.id, date, content },
            });
            if (existing) {
                continue;
            }

            await prisma.clientNote.create({
                data: {
                    clientId: client.id,
                    date,
                    type,
                    content,
                },
            });
            stats.imported++;
        } catch (err) {
            stats.errors.push({ row: i, name, error: err.message });
            console.error(`  ERROR row ${i} (${name}): ${err.message}`);
        }
    }

    return stats;
}

// ── Main ──

async function main() {
    const args = process.argv.slice(2);
    const existingOnly = args.includes('--existing-only');
    const filePath = args.find(a => !a.startsWith('--'));

    if (!filePath) {
        console.error('Usage: node prisma/import-monday-xlsx.js <path-to-xlsx> [--existing-only]');
        process.exit(1);
    }

    if (existingOnly) {
        console.log('\n⚠️  --existing-only mode: will only UPDATE existing clients, not create new ones.\n');
    }

    const resolved = path.resolve(filePath);
    console.log(`Reading: ${resolved}\n`);

    const wb = XLSX.readFile(resolved);
    console.log(`Sheets: ${wb.SheetNames.join(', ')}\n`);

    const clientSheet = wb.Sheets[wb.SheetNames[0]];
    console.log('=== Importing Clients (Sheet 1) ===');
    const clientStats = await importClients(clientSheet, { existingOnly });
    console.log(`\nClients: ${clientStats.created} created, ${clientStats.updated} updated, ${clientStats.skipped} skipped, ${clientStats.errors.length} errors\n`);

    if (wb.SheetNames.length > 1) {
        const notesSheet = wb.Sheets[wb.SheetNames[1]];
        console.log('=== Importing Renewal Notes (Sheet 2) ===');
        const noteStats = await importNotes(notesSheet);
        console.log(`\nNotes: ${noteStats.imported} imported, ${noteStats.unmatched} unmatched, ${noteStats.errors.length} errors`);
        if (noteStats.unmatchedNames.length > 0) {
            console.log(`Unmatched client names: ${noteStats.unmatchedNames.join(', ')}`);
        }
    }

    console.log('\nDone!');
}

main()
    .catch((err) => { console.error('Fatal:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
