/**
 * Restore data from a JSON backup file into PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node prisma/import-backup.js /path/to/backup.json
 *
 * This is a thin CLI wrapper around lib/restoreBackup, which is SCHEMA-DRIVEN:
 * it restores every table present in the backup (matched against the live
 * schema's columns), coerces timestamp/json columns, and loads with FK checks
 * deferred — so it stays correct as the schema grows. Restore into an EMPTY
 * database (a fresh restore target); ON CONFLICT DO NOTHING makes re-runs safe
 * but it does not overwrite existing rows.
 */
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { restoreBackup } = require('../src/lib/restoreBackup');

const prisma = new PrismaClient();

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Usage: node prisma/import-backup.js <backup.json>');
    process.exit(1);
  }

  console.log(`\nReading backup: ${backupPath}`);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`Backup from: ${backup.exportedAt} (${backup.totalRows} total rows)`);
  console.log(`Writing to: ${process.env.DATABASE_URL}\n`);

  const { imported, skipped } = await restoreBackup(prisma, backup, { log: (m) => console.log(m) });

  console.log(`\nImport complete: ${imported} rows imported.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} table(s) not in the current schema: ${skipped.join(', ')}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
