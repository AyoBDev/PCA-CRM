const prisma = require('../lib/prisma');

// Tables in dependency order with their Prisma model names
const TABLES = [
  { name: 'insurance_types', model: 'insuranceType' },
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
  { name: 'password_reset_tokens', model: 'passwordResetToken' },
];

async function exportBackup(req, res, next) {
  try {
    const backup = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      tables: {},
    };

    let totalRows = 0;
    for (const { name, model } of TABLES) {
      const rows = await prisma[model].findMany();
      backup.tables[name] = rows;
      totalRows += rows.length;
    }

    backup.totalRows = totalRows;

    const filename = `nvbestpca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    next(err);
  }
}

module.exports = { exportBackup };
