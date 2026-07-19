/**
 * One-time backfill: move inline file bytes for client_documents and
 * authorization_documents into the object bucket, then null the DB bytes.
 *
 * For each row that still has inline bytes (fileData / file_data):
 *   1. upload the bytes to a bucket key (reusing/So normalizing file_path)
 *   2. verify the object is readable back from the bucket
 *   3. null the inline column so the DB stops carrying the blob
 *
 * Idempotent: rows already migrated (no inline bytes) are skipped. Safe to
 * re-run. Dry-run by default; pass --execute to write. After --execute, run
 * a VACUUM FULL on the two tables to reclaim the space (printed at the end).
 *
 * Usage:
 *   node scripts/migrate-docs-to-bucket.js            # dry run
 *   node scripts/migrate-docs-to-bucket.js --execute  # perform the migration
 */

'use strict';

const prisma = require('../src/lib/prisma');
const { uploadFile, downloadFile } = require('../src/lib/storage');

// Ensure a bucket key: if the stored file_path already looks like a bucket key
// (has our prefix), reuse it; otherwise build a fresh, collision-safe key.
function bucketKeyFor(prefix, ownerId, filePath, fileName) {
    if (filePath && filePath.startsWith(`${prefix}/`)) return filePath;
    return `${prefix}/${ownerId}/${Date.now()}-${fileName}`;
}

async function migrateTable({ label, prefix, findRows, ownerIdOf, updateRow }) {
    const rows = await findRows();
    const report = { total: rows.length, migrated: 0, skipped: 0, errors: [] };
    for (const row of rows) {
        try {
            const key = bucketKeyFor(prefix, ownerIdOf(row), row.filePath, row.fileName);
            if (EXECUTE) {
                await uploadFile(key, Buffer.from(row.fileData), row.mimeType || 'application/octet-stream');
                const check = await downloadFile(key);
                if (!check || check.length !== Buffer.from(row.fileData).length) {
                    throw new Error(`verify failed (bucket len ${check ? check.length : 'null'} vs ${row.fileData.length})`);
                }
                await updateRow(row.id, key);
            }
            report.migrated++;
        } catch (err) {
            report.errors.push(`${label} #${row.id} (${row.fileName}): ${err.message}`);
        }
    }
    return report;
}

async function main() {
    console.log(EXECUTE ? '=== EXECUTE (writing to bucket + nulling inline bytes) ===' : '=== DRY RUN (no writes; pass --execute) ===');

    // Client documents
    const clientReport = await migrateTable({
        label: 'client_document',
        prefix: 'client-documents',
        findRows: () => prisma.clientDocument.findMany({
            where: { fileData: { not: null } },
            select: { id: true, clientId: true, fileName: true, filePath: true, mimeType: true, fileData: true },
        }),
        ownerIdOf: (r) => r.clientId,
        updateRow: (id, key) => prisma.clientDocument.update({ where: { id }, data: { fileData: null, filePath: key } }),
    });

    // Authorization documents (snake_case model/columns — normalize field names)
    const authRows = await prisma.authorization_documents.findMany({
        where: { file_data: { not: null } },
        select: { id: true, authorization_id: true, file_name: true, file_path: true, mime_type: true, file_data: true },
    });
    const authReport = { total: authRows.length, migrated: 0, skipped: 0, errors: [] };
    for (const r of authRows) {
        try {
            const key = bucketKeyFor('auth-documents', r.authorization_id, r.file_path, r.file_name);
            if (EXECUTE) {
                await uploadFile(key, Buffer.from(r.file_data), r.mime_type || 'application/octet-stream');
                const check = await downloadFile(key);
                if (!check || check.length !== Buffer.from(r.file_data).length) {
                    throw new Error(`verify failed (bucket len ${check ? check.length : 'null'} vs ${r.file_data.length})`);
                }
                await prisma.authorization_documents.update({ where: { id: r.id }, data: { file_data: null, file_path: key } });
            }
            authReport.migrated++;
        } catch (err) {
            authReport.errors.push(`auth_document #${r.id} (${r.file_name}): ${err.message}`);
        }
    }

    console.log('\n--- Report ---');
    console.log(`client_documents: ${EXECUTE ? 'migrated' : 'to migrate'} ${clientReport.migrated}/${clientReport.total}`);
    console.log(`authorization_documents: ${EXECUTE ? 'migrated' : 'to migrate'} ${authReport.migrated}/${authReport.total}`);
    const errors = [...clientReport.errors, ...authReport.errors];
    if (errors.length) console.log(`ERRORS (${errors.length}):\n  ${errors.join('\n  ')}`);

    if (EXECUTE && (clientReport.migrated || authReport.migrated)) {
        console.log('\nTo reclaim the freed DB space, run:');
        console.log('  psql "$DATABASE_URL" -c "VACUUM FULL client_documents; VACUUM FULL authorization_documents;"');
    }

    await prisma.$disconnect();
}

const EXECUTE = process.argv.includes('--execute');

main().catch(err => { console.error(err); process.exit(1); });
