// Unit tests for the streaming database backup export.
//
// Regression context: the original implementation loaded every row of every
// table into memory and serialized the whole thing with a single blocking
// JSON.stringify(obj, null, 2). On a production-sized database this exceeded
// Railway's response timeout / container memory, the connection dropped, and
// the browser reported "Failed to fetch" after a long pause. The fix streams
// the JSON incrementally, paging through rows so the full DB is never held in
// memory and bytes start flowing immediately.

jest.mock('../../lib/prisma', () => {
  // One fake table with more rows than a single page, to prove pagination.
  const auditRows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, action: 'X' }));
  const store = {
    insuranceType: [{ id: 1, name: 'Medicaid' }],
    user: [{ id: 1, email: 'a@b.co' }],
    employee: [],
    client: [{ id: 1, name: 'C' }],
    authorization: [],
    service: [],
    timesheet: [],
    timesheetEntry: [],
    signingToken: [],
    permanentLink: [],
    payrollRun: [],
    payrollVisit: [],
    shift: [],
    employeeScheduleLink: [],
    scheduleNotification: [],
    auditLog: auditRows,
  };
  const mk = (rows) => ({
    findMany: jest.fn(async ({ skip = 0, take } = {}) => {
      const end = take == null ? rows.length : skip + take;
      return rows.slice(skip, end);
    }),
  });
  const client = {};
  for (const [model, rows] of Object.entries(store)) client[model] = mk(rows);
  client.__store = store;
  return client;
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

describe('exportBackup (streaming)', () => {
  test('streams a valid JSON backup with every table and correct totals', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(res.ended).toBe(true);

    const parsed = JSON.parse(res.body());
    expect(parsed.version).toBe('1.0');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.tables.insurance_types).toEqual([{ id: 1, name: 'Medicaid' }]);
    expect(parsed.tables.audit_logs).toHaveLength(250);
    // totalRows = 1 + 1 + 1 + 250 = 253
    expect(parsed.totalRows).toBe(253);
  });

  test('does not buffer the whole DB: uses res.write to stream incrementally', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });
    // Must have streamed in multiple chunks, not one giant res.send().
    expect(res.send).not.toHaveBeenCalled();
    expect(res.chunks.length).toBeGreaterThan(1);
  });

  test('pages through large tables instead of loading them all at once', async () => {
    const res = mockRes();
    await exportBackup({ headers: {} }, res, (e) => { throw e; });
    // The 250-row audit table must be fetched in multiple paged findMany calls.
    const calls = prisma.auditLog.findMany.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    // Every paged call must pass an explicit `take` (bounded page size).
    for (const [args] of calls) {
      expect(args && typeof args.take).toBe('number');
    }
  });
});
