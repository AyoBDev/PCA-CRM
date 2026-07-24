// Unit tests for the streaming, schema-driven database backup export.
//
// Regression context: the original implementation loaded every row of every
// table into memory and serialized the whole thing with a single blocking
// JSON.stringify(obj, null, 2). On a production-sized database this exceeded
// Railway's response timeout / container memory, the connection dropped, and
// the browser reported "Failed to fetch" after a long pause. The fix streams
// the JSON incrementally, paging through rows so the full DB is never held in
// memory and bytes start flowing immediately.
//
// A second, deeper bug: the export listed only 16 hardcoded Prisma models, so
// ~30 tables (agencies, leads, permission_groups, ...) and the agency_id column
// were silently absent from every backup — a backup that could not restore the
// live schema. The export is now schema-driven: it enumerates base tables from
// information_schema and dumps each via raw SQL, so coverage tracks the schema.
//
// Multi-tenancy: exportBackup (GET /api/backup/export) is agency-scoped — it
// must only ever return rows for the calling agency, filtered via
// tenantTransaction's `SET LOCAL app.agency_id` (RLS) plus an explicit
// `WHERE agency_id = $N` in the query itself. platformBackup (superadmin
// /api/platform/backup) is the unfiltered cross-tenant export.

const AGENCY_ID = 1;

// Fake database: table name -> rows (snake_case columns, as Postgres returns).
const auditRows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, action: 'X', agency_id: 1 }));
const store = {
  agencies: [{ id: 1, name: 'Agency One', slug: 'one' }],
  insurance_types: [
    { id: 1, name: 'Medicaid', agency_id: 1 },
    { id: 2, name: 'Other Agency Row', agency_id: 2 },
  ],
  users: [{ id: 1, email: 'a@b.co', agency_id: 1 }],
  // A table with no `id` column (join table) to exercise the full-read path.
  client_care_team: [{ client_id: 1, employee_id: 2, agency_id: 1 }],
  audit_logs: auditRows,
  // Must be excluded from the backup entirely.
  password_reset_tokens: [{ id: 1, token: 'secret' }],
  _prisma_migrations: [{ id: 'x' }],
};

function mockAgencyIdColumnFor(table) {
  const rows = store[table] || [];
  return rows.length > 0 && 'agency_id' in rows[0];
}

// Shared fake $queryRawUnsafe (schema introspection only — no tenant data).
function mockMakeQueryRawUnsafe() {
  return jest.fn(async (sql, param) => {
    if (/information_schema\.tables/.test(sql)) {
      return Object.keys(store).map((table_name) => ({ table_name }));
    }
    if (/information_schema\.columns/.test(sql) && /column_name = 'id'/.test(sql)) {
      const rows = store[param] || [];
      return rows.length && 'id' in rows[0] ? [{ '?column?': 1 }] : [];
    }
    if (/information_schema\.columns/.test(sql) && /column_name = 'agency_id'/.test(sql)) {
      return mockAgencyIdColumnFor(param) ? [{ '?column?': 1 }] : [];
    }
    return [];
  });
}

// A Prisma.raw()-wrapped identifier stringifies to "[object Object]" — pull
// its embedded SQL fragment out directly instead.
function mockSqlValueToString(v) {
  if (v && typeof v === 'object' && Array.isArray(v.strings)) return v.strings.join('');
  return String(v);
}

// Shared fake tagged-template $queryRaw — Prisma passes tagged template calls
// as (strings, ...values); we reconstruct the interpolated SQL to match on it.
function mockMakeQueryRaw() {
  return jest.fn(async (strings, ...values) => {
    const sql = strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? mockSqlValueToString(values[i]) : ''), '');
    const m = sql.match(/FROM "([^"]+)"/);
    const table = m && m[1];
    let rows = store[table] || [];
    if (/WHERE agency_id = /.test(sql)) {
      const agencyMatch = sql.match(/WHERE agency_id = (\d+)/);
      const agencyId = agencyMatch ? Number(agencyMatch[1]) : null;
      rows = rows.filter((r) => r.agency_id === agencyId);
    }
    const lim = sql.match(/LIMIT (\d+) OFFSET (\d+)/);
    if (lim) {
      const limit = Number(lim[1]);
      const offset = Number(lim[2]);
      return rows.slice(offset, offset + limit);
    }
    return rows;
  });
}

jest.mock('../../lib/prisma', () => {
  const $queryRawUnsafe = mockMakeQueryRawUnsafe();
  const $queryRaw = mockMakeQueryRaw();
  return { $queryRawUnsafe, $queryRaw };
});

jest.mock('../../lib/tenantPrisma', () => ({
  tenantTransaction: jest.fn((agencyId, fn) => {
    const tx = {
      $queryRawUnsafe: mockMakeQueryRawUnsafe(),
      $queryRaw: mockMakeQueryRaw(),
      $executeRaw: jest.fn(async () => {}),
    };
    return fn(tx);
  }),
}));

const prisma = require('../../lib/prisma');
const { exportBackup, platformBackup } = require('../backupController');

// Minimal writable-response double that records everything written.
function mockRes() {
  return {
    headers: {},
    chunks: [],
    ended: false,
    statusCode: 200,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    write(chunk) { this.chunks.push(String(chunk)); return true; },
    end(chunk) { if (chunk != null) this.chunks.push(String(chunk)); this.ended = true; },
    // A real controller must never call res.send() with the whole payload.
    send: jest.fn(function (chunk) { this.chunks.push(String(chunk)); this.ended = true; }),
    json: jest.fn(function (body) { this.body_ = body; }),
    body() { return this.chunks.join(''); },
  };
}

describe('exportBackup (streaming, schema-driven, agency-scoped)', () => {
  test('404s when the agency could not be resolved from the host', async () => {
    const res = mockRes();
    await exportBackup({ headers: {}, agency: null }, res, (e) => { throw e; });
    expect(res.statusCode).toBe(404);
  });

  test('streams a valid JSON backup scoped to the calling agency only', async () => {
    const res = mockRes();
    await exportBackup({ headers: {}, agency: { id: AGENCY_ID } }, res, (e) => { throw e; });

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(res.ended).toBe(true);

    const parsed = JSON.parse(res.body());
    expect(parsed.version).toBe('1.0');
    expect(typeof parsed.exportedAt).toBe('string');
    // Only agency 1's row comes back, not agency 2's.
    expect(parsed.tables.insurance_types).toEqual([{ id: 1, name: 'Medicaid', agencyId: 1 }]);
    expect(parsed.tables.audit_logs).toHaveLength(250);
    // The agencies table itself is never included in a tenant export.
    expect(parsed.tables.agencies).toBeUndefined();
  });

  test('excludes live-credential and internal tables from the backup', async () => {
    const res = mockRes();
    await exportBackup({ headers: {}, agency: { id: AGENCY_ID } }, res, (e) => { throw e; });
    const parsed = JSON.parse(res.body());
    expect(parsed.tables.password_reset_tokens).toBeUndefined();
    expect(parsed.tables._prisma_migrations).toBeUndefined();
  });

  test('does not buffer the whole DB: uses res.write to stream incrementally', async () => {
    const res = mockRes();
    await exportBackup({ headers: {}, agency: { id: AGENCY_ID } }, res, (e) => { throw e; });
    expect(res.send).not.toHaveBeenCalled();
    expect(res.chunks.length).toBeGreaterThan(1);
  });
});

describe('platformBackup (unfiltered cross-tenant export)', () => {
  test('includes every agency\'s rows and the agencies table itself', async () => {
    const res = mockRes();
    await platformBackup({ headers: {} }, res, (e) => { throw e; });
    const parsed = JSON.parse(res.body());
    expect(parsed.tables.agencies).toEqual([{ id: 1, name: 'Agency One', slug: 'one' }]);
    expect(parsed.tables.insurance_types).toEqual([
      { id: 1, name: 'Medicaid', agencyId: 1 },
      { id: 2, name: 'Other Agency Row', agencyId: 2 },
    ]);
  });

  test('excludes live-credential and internal tables', async () => {
    const res = mockRes();
    await platformBackup({ headers: {} }, res, (e) => { throw e; });
    const parsed = JSON.parse(res.body());
    expect(parsed.tables.password_reset_tokens).toBeUndefined();
    expect(parsed.tables._prisma_migrations).toBeUndefined();
  });
});
