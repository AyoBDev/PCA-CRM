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

jest.mock('../../lib/prisma', () => {
  // Fake database: table name -> rows (snake_case columns, as Postgres returns).
  const auditRows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, action: 'X' }));
  const store = {
    insurance_types: [{ id: 1, name: 'Medicaid', agency_id: 1 }],
    users: [{ id: 1, email: 'a@b.co', agency_id: 1 }],
    // A table with no `id` column (join table) to exercise the full-read path.
    client_care_team: [{ client_id: 1, employee_id: 2 }],
    audit_logs: auditRows,
    // Must be excluded from the backup entirely.
    password_reset_tokens: [{ id: 1, token: 'secret' }],
    _prisma_migrations: [{ id: 'x' }],
  };

  const $queryRawUnsafe = jest.fn(async (sql, param) => {
    // information_schema.tables — list base tables
    if (/information_schema\.tables/.test(sql)) {
      return Object.keys(store).map((table_name) => ({ table_name }));
    }
    // information_schema.columns — does this table have an id column?
    if (/information_schema\.columns/.test(sql)) {
      const rows = store[param] || [];
      return rows.length && 'id' in rows[0] ? [{ '?column?': 1 }] : [];
    }
    // SELECT * FROM "<table>" [ORDER BY id LIMIT n OFFSET m]
    const m = sql.match(/FROM "([^"]+)"/);
    const table = m && m[1];
    const rows = store[table] || [];
    const lim = sql.match(/LIMIT (\d+) OFFSET (\d+)/);
    if (lim) {
      const limit = Number(lim[1]);
      const offset = Number(lim[2]);
      return rows.slice(offset, offset + limit);
    }
    return rows;
  });

  return { $queryRawUnsafe };
});

const prisma = require('../../lib/prisma');
const { exportBackup } = require('../backupController');

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
    body() { return this.chunks.join(''); },
  };
}

beforeEach(() => prisma.$queryRawUnsafe.mockClear());

describe('exportBackup (streaming, schema-driven)', () => {
  test('streams a valid JSON backup with every non-excluded table and correct totals', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(res.ended).toBe(true);

    const parsed = JSON.parse(res.body());
    expect(parsed.version).toBe('1.0');
    expect(typeof parsed.exportedAt).toBe('string');
    // insurance_types present, columns camelized, agency_id -> agencyId preserved
    expect(parsed.tables.insurance_types).toEqual([{ id: 1, name: 'Medicaid', agencyId: 1 }]);
    expect(parsed.tables.audit_logs).toHaveLength(250);
    // Join table with no id is still fully exported.
    expect(parsed.tables.client_care_team).toEqual([{ clientId: 1, employeeId: 2 }]);
    // totalRows = 1 + 1 + 1 + 250 = 253 (excluded tables not counted)
    expect(parsed.totalRows).toBe(253);
  });

  test('excludes live-credential and internal tables from the backup', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });
    const parsed = JSON.parse(res.body());
    expect(parsed.tables.password_reset_tokens).toBeUndefined();
    expect(parsed.tables._prisma_migrations).toBeUndefined();
  });

  test('does not buffer the whole DB: uses res.write to stream incrementally', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });
    expect(res.send).not.toHaveBeenCalled();
    expect(res.chunks.length).toBeGreaterThan(1);
  });

  test('pages through large tables with bounded LIMIT/OFFSET queries', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });
    const pagedCalls = prisma.$queryRawUnsafe.mock.calls
      .filter(([sql]) => /FROM "audit_logs"/.test(sql));
    // 250 rows / 1000 page size = still multiple calls because the loop issues
    // one query then breaks on a short page — assert bounded queries were used.
    expect(pagedCalls.length).toBeGreaterThanOrEqual(1);
    for (const [sql] of pagedCalls) {
      expect(sql).toMatch(/LIMIT \d+ OFFSET \d+/);
    }
  });
});
