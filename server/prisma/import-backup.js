/**
 * Import data from a JSON backup file into PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node prisma/import-backup.js /path/to/backup.json
 */
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Tables in FK dependency order — must match backup keys
// [backupKey, prismaModelName]
const TABLES = [
  ['insurance_types', 'insuranceType'],
  ['users', 'user'],
  ['employees', 'employee'],
  ['clients', 'client'],
  ['authorizations', 'authorization'],
  ['services', 'service'],
  ['timesheets', 'timesheet'],
  ['timesheet_entries', 'timesheetEntry'],
  ['signing_tokens', 'signingToken'],
  ['permanent_links', 'permanentLink'],
  ['payroll_runs', 'payrollRun'],
  ['payroll_visits', 'payrollVisit'],
  ['shifts', 'shift'],
  ['employee_schedule_links', 'employeeScheduleLink'],
  ['schedule_notifications', 'scheduleNotification'],
  ['audit_logs', 'auditLog'],
  ['password_reset_tokens', 'passwordResetToken'],
];

// DateTime fields that need conversion from ISO strings to Date objects
const DATETIME_FIELDS = new Set([
  'createdAt', 'updatedAt', 'archivedAt', 'expiresAt', 'usedAt',
  'confirmedAt', 'sentAt', 'submittedAt', 'weekStart', 'visitDate',
  'authorizationStartDate', 'authorizationEndDate', 'periodStart',
  'periodEnd', 'shiftDate',
]);

function convertRow(row) {
  const converted = {};
  for (const [key, val] of Object.entries(row)) {
    if (DATETIME_FIELDS.has(key) && val != null) {
      const d = new Date(val);
      converted[key] = isNaN(d.getTime()) ? null : d;
    } else {
      converted[key] = val;
    }
  }
  return converted;
}

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Usage: node prisma/import-backup.js <backup.json>');
    process.exit(1);
  }

  console.log(`\nReading backup: ${backupPath}`);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`Backup from: ${backup.exportedAt} (${backup.totalRows} total rows)\n`);

  console.log(`Writing to: ${process.env.DATABASE_URL}\n`);

  let totalImported = 0;

  for (const [tableName, modelName] of TABLES) {
    const rows = backup.tables[tableName];
    if (!rows || rows.length === 0) {
      console.log(`  skip  ${tableName} — 0 rows`);
      continue;
    }

    const converted = rows.map(convertRow);

    // Insert in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < converted.length; i += BATCH_SIZE) {
      const batch = converted.slice(i, i + BATCH_SIZE);
      await prisma[modelName].createMany({
        data: batch,
        skipDuplicates: true,
      });
    }

    console.log(`  done  ${tableName} — ${rows.length} rows`);
    totalImported += rows.length;
  }

  // Reset auto-increment sequences
  console.log('\nResetting sequences...');
  for (const [tableName] of TABLES) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1, false)`
      );
    } catch (err) {
      // Table might not have a sequence — skip
    }
  }
  console.log('  done\n');

  console.log(`Import complete: ${totalImported} rows imported.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
