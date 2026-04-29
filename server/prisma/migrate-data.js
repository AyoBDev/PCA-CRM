/**
 * One-time SQLite → PostgreSQL data migration.
 *
 * Usage:
 *   1. Ensure PostgreSQL is running and DATABASE_URL is set to the Postgres connection string.
 *   2. Ensure the Postgres schema is up to date (run prisma migrate dev first).
 *   3. Place the SQLite file at server/prisma/dev.db (or set SQLITE_PATH env var).
 *   4. Run: node prisma/migrate-data.js
 */
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'dev.db');

// Tables in foreign-key dependency order (parents first).
// Each entry: [sqliteTableName, prismaModelName, arrayOfBooleanColumnNames]
const TABLES = [
  ['insurance_types', 'insuranceType', []],
  ['users', 'user', ['active']],
  ['employees', 'employee', ['active']],
  ['clients', 'client', []],
  ['authorizations', 'authorization', []],
  ['services', 'service', []],
  ['timesheets', 'timesheet', []],
  ['timesheet_entries', 'timesheetEntry', []],
  ['signing_tokens', 'signingToken', []],
  ['permanent_links', 'permanentLink', ['active']],
  ['payroll_runs', 'payrollRun', []],
  ['payroll_visits', 'payrollVisit', [
    'void_flag', 'is_incomplete', 'is_unauthorized', 'needs_review',
    'early_call_in', 'late_call_out', 'next_day_call_out',
  ]],
  ['shifts', 'shift', []],
  ['employee_schedule_links', 'employeeScheduleLink', ['active']],
  ['schedule_notifications', 'scheduleNotification', []],
  ['audit_logs', 'auditLog', []],
  ['password_reset_tokens', 'passwordResetToken', []],
];

// Map SQLite snake_case columns → Prisma camelCase field names.
const COLUMN_MAP = {
  password_hash: 'passwordHash',
  archived_at: 'archivedAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  user_id: 'userId',
  expires_at: 'expiresAt',
  used_at: 'usedAt',
  employee_id: 'employeeId',
  week_start: 'weekStart',
  confirmation_token: 'confirmationToken',
  confirmed_at: 'confirmedAt',
  sent_at: 'sentAt',
  failure_reason: 'failureReason',
  client_name: 'clientName',
  medicaid_id: 'medicaidId',
  insurance_type: 'insuranceType',
  gate_code: 'gateCode',
  enabled_services: 'enabledServices',
  client_id: 'clientId',
  service_category: 'serviceCategory',
  service_code: 'serviceCode',
  service_name: 'serviceName',
  authorized_units: 'authorizedUnits',
  authorization_start_date: 'authorizationStartDate',
  authorization_end_date: 'authorizationEndDate',
  client_phone: 'clientPhone',
  client_id_number: 'clientIdNumber',
  pca_name: 'pcaName',
  total_pas_hours: 'totalPasHours',
  total_hm_hours: 'totalHmHours',
  total_hours: 'totalHours',
  total_respite_hours: 'totalRespiteHours',
  recipient_name: 'recipientName',
  recipient_signature: 'recipientSignature',
  pca_signature: 'pcaSignature',
  pca_full_name: 'pcaFullName',
  supervisor_name: 'supervisorName',
  supervisor_signature: 'supervisorSignature',
  completion_date: 'completionDate',
  submitted_at: 'submittedAt',
  timesheet_id: 'timesheetId',
  day_of_week: 'dayOfWeek',
  date_of_service: 'dateOfService',
  adl_activities: 'adlActivities',
  adl_time_in: 'adlTimeIn',
  adl_time_out: 'adlTimeOut',
  adl_hours: 'adlHours',
  adl_pca_initials: 'adlPcaInitials',
  adl_client_initials: 'adlClientInitials',
  adl_time_blocks: 'adlTimeBlocks',
  iadl_activities: 'iadlActivities',
  iadl_time_in: 'iadlTimeIn',
  iadl_time_out: 'iadlTimeOut',
  iadl_hours: 'iadlHours',
  iadl_pca_initials: 'iadlPcaInitials',
  iadl_client_initials: 'iadlClientInitials',
  iadl_time_blocks: 'iadlTimeBlocks',
  respite_activities: 'respiteActivities',
  respite_time_in: 'respiteTimeIn',
  respite_time_out: 'respiteTimeOut',
  respite_hours: 'respiteHours',
  respite_pca_initials: 'respitePcaInitials',
  respite_client_initials: 'respiteClientInitials',
  respite_time_blocks: 'respiteTimeBlocks',
  run_id: 'runId',
  employee_name: 'employeeName',
  visit_date: 'visitDate',
  call_in_raw: 'callInRaw',
  call_out_raw: 'callOutRaw',
  call_hours_raw: 'callHoursRaw',
  visit_status: 'visitStatus',
  units_raw: 'unitsRaw',
  call_in_time: 'callInTime',
  call_out_time: 'callOutTime',
  duration_minutes: 'durationMinutes',
  final_payable_units: 'finalPayableUnits',
  void_flag: 'voidFlag',
  void_reason: 'voidReason',
  overlap_id: 'overlapId',
  is_incomplete: 'isIncomplete',
  is_unauthorized: 'isUnauthorized',
  needs_review: 'needsReview',
  review_reason: 'reviewReason',
  merged_into: 'mergedInto',
  early_call_in: 'earlyCallIn',
  late_call_out: 'lateCallOut',
  next_day_call_out: 'nextDayCallOut',
  shift_date: 'shiftDate',
  start_time: 'startTime',
  end_time: 'endTime',
  recurring_group_id: 'recurringGroupId',
  account_number: 'accountNumber',
  sandata_client_id: 'sandataClientId',
  user_name: 'userName',
  user_role: 'userRole',
  entity_type: 'entityType',
  entity_id: 'entityId',
  entity_name: 'entityName',
  period_start: 'periodStart',
  period_end: 'periodEnd',
  total_visits: 'totalVisits',
  total_payable: 'totalPayable',
  error_message: 'errorMessage',
  authorization_snapshot: 'authorizationSnapshot',
  file_name: 'fileName',
};

// DateTime columns (SQLite stores as ISO strings; Postgres needs Date objects)
const DATETIME_COLUMNS = new Set([
  'created_at', 'updated_at', 'archived_at', 'expires_at', 'used_at',
  'confirmed_at', 'sent_at', 'submitted_at', 'week_start', 'visit_date',
  'authorization_start_date', 'authorization_end_date', 'period_start',
  'period_end', 'shift_date',
]);

function convertRow(row, boolColumns) {
  const converted = {};
  for (const [col, val] of Object.entries(row)) {
    const key = COLUMN_MAP[col] || col;
    if (boolColumns.includes(col)) {
      converted[key] = val === 1 || val === true;
    } else if (DATETIME_COLUMNS.has(col) && val != null) {
      converted[key] = new Date(val);
    } else {
      converted[key] = val;
    }
  }
  return converted;
}

async function main() {
  console.log(`\nReading SQLite database: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  console.log(`Writing to PostgreSQL: ${process.env.DATABASE_URL}\n`);

  let totalRows = 0;

  for (const [tableName, modelName, boolCols] of TABLES) {
    // Check if table exists in SQLite
    const tableExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName);

    if (!tableExists) {
      console.log(`  skip  ${tableName} — table not found in SQLite`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();

    if (rows.length === 0) {
      console.log(`  skip  ${tableName} — 0 rows`);
      continue;
    }

    // Convert all rows
    const converted = rows.map((r) => convertRow(r, boolCols));

    // Insert in batches of 100 to avoid hitting parameter limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < converted.length; i += BATCH_SIZE) {
      const batch = converted.slice(i, i + BATCH_SIZE);
      await prisma[modelName].createMany({
        data: batch,
        skipDuplicates: true,
      });
    }

    console.log(`  done  ${tableName} — ${rows.length} rows`);
    totalRows += rows.length;
  }

  // Reset auto-increment sequences so new inserts get the next ID
  console.log('\nResetting sequences...');
  const tablesWithId = TABLES.map(([t]) => t);
  for (const tableName of tablesWithId) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1, false)`
      );
    } catch (err) {
      // Table might not have a sequence — skip
    }
  }
  console.log('  done  Sequences reset\n');

  console.log(`Migration complete: ${totalRows} total rows transferred.`);

  sqlite.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
