const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { tenantTransaction } = require('../lib/tenantPrisma');

// Tables that must NEVER be included in a backup — live single-use bearer
// credentials with no restore value. Including them lets anyone holding a
// backup take over accounts. `agencies` is also excluded from the per-tenant
// export: a tenant backup restores that agency's own data, not the platform's
// tenant registry.
const EXCLUDED_TABLES = new Set([
  'password_reset_tokens',
  'onboarding_tokens',
  '_prisma_migrations',
]);
const TENANT_EXCLUDED_TABLES = new Set([...EXCLUDED_TABLES, 'agencies']);

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
// Prisma client doesn't model yet — so coverage can't silently drift behind
// schema changes. `excluded` lets the tenant-scoped export also drop `agencies`.
async function listTables(db, excluded) {
  const rows = await db.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((r) => r.table_name).filter((t) => !excluded.has(t));
}

// Does this table have an integer "id" column we can page/order by? Most do;
// join tables may not, in which case we fall back to a full read.
async function hasIdColumn(db, table) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id' LIMIT 1`,
    table
  );
  return rows.length > 0;
}

// Does this table have an agency_id column? Used to decide whether the
// tenant-scoped export needs to (and can) filter a table by agency.
async function hasAgencyIdColumn(db, table) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'agency_id' LIMIT 1`,
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

// Stream the whole database (or one agency's slice of it) out as a JSON
// attachment.
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
//
// `agencyId` is null for the platform (cross-tenant) export, which reads via
// the owner connection with no row filter. When set, every table with an
// agency_id column is filtered to that agency; tables without one are simply
// skipped (today, only `agencies` itself — already removed via
// TENANT_EXCLUDED_TABLES — has no agency_id, so this is a defensive no-op).
async function streamBackup(res, { db, excludedTables, agencyId }) {
  const tables = await listTables(db, excludedTables);

  const filename = `${agencyId ? 'nvbestpca-backup' : 'nvbestpca-platform-backup'}-${new Date().toISOString().slice(0, 10)}.json`;
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

    const scopeToAgency = agencyId != null && (await hasAgencyIdColumn(db, table));
    const pageable = await hasIdColumn(db, table);
    let offset = 0;
    let wroteAnyRow = false;

    // Page until a short page signals the end of the table. Tables without an
    // id column are read in one shot (they are small join tables).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const tableIdent = Prisma.raw(`"${table}"`);
      let rows;
      if (pageable && scopeToAgency) {
        rows = await db.$queryRaw`SELECT * FROM ${tableIdent} WHERE agency_id = ${agencyId} ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      } else if (pageable) {
        rows = await db.$queryRaw`SELECT * FROM ${tableIdent} ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      } else if (scopeToAgency) {
        rows = await db.$queryRaw`SELECT * FROM ${tableIdent} WHERE agency_id = ${agencyId}`;
      } else {
        rows = await db.$queryRaw`SELECT * FROM ${tableIdent}`;
      }

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
}

// GET /api/backup/export — tenant-scoped (admin JWT or backup API key). The
// route is registered above authenticate/tenantMiddleware so req.db may not
// be set yet; resolve the agency from req.agency (subdomain) when needed.
// Runs inside tenantTransaction so RLS's tenant_isolation policy is a second
// backstop behind the explicit agency_id filter in streamBackup.
async function exportBackup(req, res, next) {
  try {
    if (!req.agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    const agencyId = req.agency.id;
    await tenantTransaction(agencyId, (tx) =>
      streamBackup(res, { db: tx, excludedTables: TENANT_EXCLUDED_TABLES, agencyId })
    );
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

// GET /api/platform/backup — superadmin only, full cross-tenant export using
// the owner connection (bypasses RLS by design, unfiltered by agency).
async function platformBackup(req, res, next) {
  try {
    await streamBackup(res, { db: prisma, excludedTables: EXCLUDED_TABLES, agencyId: null });
  } catch (err) {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    next(err);
  }
}

module.exports = { exportBackup, platformBackup };
