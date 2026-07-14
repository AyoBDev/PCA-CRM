const prisma = require('../lib/prisma');

// Tables that must NEVER be included in a backup — live single-use bearer
// credentials with no restore value. Including them lets anyone holding a
// backup take over accounts.
const EXCLUDED_TABLES = new Set([
  'password_reset_tokens',
  'onboarding_tokens',
  '_prisma_migrations',
]);

// How many rows to pull per query. Keeps peak memory bounded regardless of
// how large any single table (e.g. audit_logs, shifts) grows.
const PAGE_SIZE = 1000;

// snake_case (Postgres column) → camelCase (backup/restore field name).
// The restore path feeds rows to Prisma createMany, which expects camelCase, so
// the backup is emitted in camelCase to stay directly restorable.
function toCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// JSON.stringify replacer: Postgres raw queries can return BigInt (int8) and
// Date objects. BigInt throws in JSON.stringify by default, so coerce it.
function jsonReplacer(_key, value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

// List every base table in the public schema, in a stable order. Deriving the
// table list from the database (rather than a hardcoded Prisma model list)
// means the backup automatically covers new tables — including ones the current
// Prisma client doesn't model yet (agencies, leads, etc.) — so coverage can't
// silently drift behind schema changes.
async function listTables() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((r) => r.table_name).filter((t) => !EXCLUDED_TABLES.has(t));
}

// Does this table have an integer "id" column we can page/order by? Most do;
// join tables may not, in which case we fall back to a full read.
async function hasIdColumn(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id' LIMIT 1`,
    table
  );
  return rows.length > 0;
}

// Convert a raw DB row's keys from snake_case to camelCase.
function camelizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

// Stream the whole database out as a JSON attachment.
//
// This is deliberately streamed rather than built in memory: the original
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
    const tables = await listTables();

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
    for (let t = 0; t < tables.length; t++) {
      const table = tables[t];
      res.write(`${JSON.stringify(table)}: [`);

      const pageable = await hasIdColumn(table);
      let offset = 0;
      let wroteAnyRow = false;

      // Page until a short page signals the end of the table. Tables without an
      // id column are read in one shot (they are small join tables).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = pageable
          ? await prisma.$queryRawUnsafe(
              `SELECT * FROM "${table}" ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`
            )
          : await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);

        for (const row of rows) {
          res.write(wroteAnyRow ? ',' : '');
          res.write(JSON.stringify(camelizeRow(row), jsonReplacer));
          wroteAnyRow = true;
        }
        totalRows += rows.length;

        if (!pageable || rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      res.write(']');
      res.write(t < tables.length - 1 ? ',\n' : '\n');
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
