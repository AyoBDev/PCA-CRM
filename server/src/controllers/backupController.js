const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');

// Tables in dependency order with their Prisma model names
const TABLES = [
  { name: 'insurance_types', model: 'insuranceType' },
  // users includes passwordHash (bcrypt) intentionally: a backup without it
  // cannot restore logins. This is a disaster-recovery dump, not a data export.
  { name: 'users', model: 'user' },
  { name: 'employees', model: 'employee' },
  { name: 'clients', model: 'client' },
  { name: 'authorizations', model: 'authorization' },
  { name: 'services', model: 'service' },
  { name: 'timesheets', model: 'timesheet' },
  { name: 'timesheet_entries', model: 'timesheetEntry' },
  { name: 'signing_tokens', model: 'signingToken' },
  { name: 'permanent_links', model: 'permanentLink' },
  { name: 'payroll_runs', model: 'payrollRun' },
  { name: 'payroll_visits', model: 'payrollVisit' },
  { name: 'shifts', model: 'shift' },
  { name: 'employee_schedule_links', model: 'employeeScheduleLink' },
  { name: 'schedule_notifications', model: 'scheduleNotification' },
  { name: 'audit_logs', model: 'auditLog' },
  // Deliberately excluded from backups:
  //  - password_reset_tokens: live single-use bearer credentials with no restore
  //    value; including them lets anyone holding a backup take over accounts.
];

// Shared export routine: dumps every backed-up table using whatever Prisma
// client it's given. Called with req.db (tenant-scoped, RLS-filtered) for the
// regular /api/backup/export route, and with the owner client (prisma) for
// the full-DB platform export.
async function exportAll(db) {
  const backup = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    tables: {},
  };

  let totalRows = 0;
  for (const { name, model } of TABLES) {
    const rows = await db[model].findMany();
    backup.tables[name] = rows;
    totalRows += rows.length;
  }

  backup.totalRows = totalRows;
  return backup;
}

function sendBackup(res, backup, filenamePrefix) {
  const filename = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backup, null, 2));
}

// GET /api/backup/export — tenant-scoped (admin JWT or backup API key).
// The route is registered above authenticate/tenantMiddleware so req.db may
// not be set yet; resolve it here from req.agency (subdomain) when needed.
async function exportBackup(req, res, next) {
  try {
    let db = req.db;
    if (!db) {
      if (!req.agency) {
        return res.status(404).json({ error: 'Agency not found' });
      }
      db = tenantClient(req.agency.id);
    }
    const backup = await exportAll(db);
    sendBackup(res, backup, 'nvbestpca-backup');
  } catch (err) {
    next(err);
  }
}

// GET /api/platform/backup — superadmin only, full cross-tenant export using
// the owner connection (bypasses RLS by design).
async function platformBackup(req, res, next) {
  try {
    const backup = await exportAll(prisma);
    sendBackup(res, backup, 'nvbestpca-platform-backup');
  } catch (err) {
    next(err);
  }
}

module.exports = { exportBackup, exportAll, platformBackup };
