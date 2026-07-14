const prisma = require('../lib/prisma');

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

// How many rows to pull per query. Keeps peak memory bounded regardless of
// how large any single table (e.g. audit_logs) grows.
const PAGE_SIZE = 1000;

// Stream the whole database out as a JSON attachment.
//
// This is deliberately streamed rather than built in memory: the previous
// implementation did `JSON.stringify(entireDb, null, 2)` after loading every
// row of every table at once. On a production-sized database that blew past
// Railway's response timeout / container memory, the connection was dropped
// before any bytes were sent, and the browser reported "Failed to fetch".
//
// Here we start the response immediately, page through each table, and write
// rows as we go — peak memory stays at one page, and the steady byte flow
// keeps the proxy connection alive.
async function exportBackup(req, res, next) {
  try {
    const filename = `nvbestpca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Open the JSON envelope. `totalRows` is written last (we don't know it up
    // front without buffering), so it lives after `tables`.
    res.write('{\n');
    res.write(`"exportedAt": ${JSON.stringify(new Date().toISOString())},\n`);
    res.write('"version": "1.0",\n');
    res.write('"tables": {\n');

    let totalRows = 0;
    for (let t = 0; t < TABLES.length; t++) {
      const { name, model } = TABLES[t];
      res.write(`${JSON.stringify(name)}: [`);

      let skip = 0;
      let wroteAnyRow = false;
      // Page until a short page signals the end of the table.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await prisma[model].findMany({ skip, take: PAGE_SIZE });
        for (const row of rows) {
          res.write(wroteAnyRow ? ',' : '');
          res.write(JSON.stringify(row));
          wroteAnyRow = true;
        }
        totalRows += rows.length;
        if (rows.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }

      res.write(']');
      res.write(t < TABLES.length - 1 ? ',\n' : '\n');
    }

    res.write('},\n');
    res.write(`"totalRows": ${totalRows}\n`);
    res.end('}\n');
  } catch (err) {
    // If headers are already sent we can't switch to a JSON error response;
    // destroy the connection so the client sees a failure rather than a
    // silently truncated (and invalid) backup file.
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    next(err);
  }
}

module.exports = { exportBackup };
