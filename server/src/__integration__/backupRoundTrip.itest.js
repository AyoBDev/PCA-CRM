// End-to-end backup → restore round-trip. This is the "restore has been tested"
// proof: it exports a real backup from the seeded test DB, restores it into a
// FRESH scratch database, and asserts every table's row count matches. It fails
// loudly if the restore drops tables (the exact bug the old 17-table hardcoded
// import-backup.js had against a 57-table schema).

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { platformBackup } = require('../controllers/backupController');
const { restoreBackup } = require('../lib/restoreBackup');

// Derive the scratch DB URL from the test DB URL by swapping the database name.
const SOURCE_URL = process.env.DATABASE_URL;
const SCRATCH_DB = 'nvbestpca_restore_scratch';
const SCRATCH_URL = SOURCE_URL.replace(/\/[^/?]+(\?|$)/, `/${SCRATCH_DB}$1`);

const source = new PrismaClient({ datasourceUrl: SOURCE_URL });
let scratch;

// Fake Express res that captures the streamed backup body into a string.
function captureRes() {
  const chunks = [];
  return {
    headersSent: false,
    setHeader() {},
    status() { return this; },
    json() {},
    write(s) { chunks.push(s); },
    end(s) { if (s) chunks.push(s); this._done = true; },
    destroy(err) { this._err = err; },
    body() { return chunks.join(''); },
  };
}

beforeAll(async () => {
  // Create + migrate a fresh scratch DB. Drop first so the test is repeatable.
  execSync(`dropdb --if-exists ${SCRATCH_DB}`, { stdio: 'ignore' });
  execSync(`createdb ${SCRATCH_DB}`, { stdio: 'ignore' });
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: SCRATCH_URL },
  });
  scratch = new PrismaClient({ datasourceUrl: SCRATCH_URL });

  // Ensure the source DB has at least one agency + a couple of dependent rows,
  // so the round-trip actually moves data across FK boundaries.
  const agency = await source.agency.create({ data: { name: 'RoundTrip', slug: `rt-${Date.now()}` } });
  const client = await source.client.create({ data: { clientName: 'RT Client', agencyId: agency.id } });
  await source.auditLog.create({
    data: { userId: 0, userName: 'rt', userRole: 'system', action: 'CREATE', entityType: 'Client', entityId: client.id, agencyId: agency.id },
  });
}, 120000);

afterAll(async () => {
  await source.$disconnect();
  if (scratch) await scratch.$disconnect();
  execSync(`dropdb --if-exists ${SCRATCH_DB}`, { stdio: 'ignore' });
});

test('platform backup restores into a fresh DB with matching row counts for every table', async () => {
  // 1. Export a full platform backup from the source DB.
  const res = captureRes();
  await platformBackup({}, res, (err) => { if (err) throw err; });
  const backup = JSON.parse(res.body());
  expect(backup.tables).toBeDefined();

  // 2. Restore it into the empty scratch DB.
  const result = await restoreBackup(scratch, backup);
  expect(result.imported).toBeGreaterThan(0);

  // 3. Every non-empty table in the backup must have the SAME row count in the
  //    restored DB. This is what catches a restore that silently drops tables.
  const mismatches = [];
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (result.skipped.includes(table)) continue; // table not in current schema
    const [{ count }] = await scratch.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    if (count !== rows.length) {
      mismatches.push(`${table}: backup=${rows.length} restored=${count}`);
    }
  }
  expect(mismatches).toEqual([]);
});

test('restore covers the full exported table set (no silent table drop)', async () => {
  const res = captureRes();
  await platformBackup({}, res, (err) => { if (err) throw err; });
  const backup = JSON.parse(res.body());

  const nonEmptyExported = Object.entries(backup.tables)
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .map(([t]) => t);

  const result = await restoreBackup(scratch, backup);

  // Anything exported-with-data must be either restored or explicitly skipped
  // because the current schema no longer models it — never silently ignored.
  const restored = Object.keys(result.perTable).filter((t) => result.perTable[t] > 0);
  const accountedFor = new Set([...restored, ...result.skipped]);
  const unaccounted = nonEmptyExported.filter((t) => !accountedFor.has(t));
  expect(unaccounted).toEqual([]);
});
