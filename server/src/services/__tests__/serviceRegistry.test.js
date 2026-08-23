const registry = require('../serviceRegistry');
const { SERVICE_DEFAULTS } = require('../../lib/serviceDefaults');
const { runWithTenant } = require('../../lib/tenantContext');

// The OLD mapping, copied verbatim, as the parity oracle.
function oldDerive(auth) {
  const code = auth.serviceCode;
  if (code === 'COPE' || code === 'PAS') {
    const name = (auth.serviceName || '').toLowerCase();
    if (name.includes('homemaker')) return 'Homemaker';
    if (name.includes('respite')) return 'Respite';
    if (name.includes('companion')) return 'Companion';
    return 'PAS';
  }
  if (code === 'PCS' || code === 'S5125' || code === 'TIMESHEET_PCS') return 'PAS';
  if (code === 'S5130' || code === 'S5120' || code === 'TIMESHEET_HOMEMAKER' || code === 'TIMESHEET_CHORE') return 'Homemaker';
  if (code === 'S5150' || code === 'TIMESHEET_RESPITE') return 'Respite';
  if (code === 'S5135' || code === 'TIMESHEET_COMPANION') return 'Companion';
  if (code === 'SDPC') return 'PAS';
  return null;
}

describe('serviceRegistry.deriveTimesheetSection parity', () => {
  test('matches old mapping for every known code', () => {
    for (const code of Object.keys(SERVICE_DEFAULTS)) {
      if (code === 'TIMESHEETS') continue; // blank-section special case, tested separately
      const got = registry.deriveTimesheetSection(code, SERVICE_DEFAULTS[code].name);
      const want = oldDerive({ serviceCode: code, serviceName: SERVICE_DEFAULTS[code].name });
      expect(`${code}:${got}`).toBe(`${code}:${want}`);
    }
  });

  test('COPE disambiguates by serviceName', () => {
    expect(registry.deriveTimesheetSection('COPE', 'Homemaker')).toBe('Homemaker');
    expect(registry.deriveTimesheetSection('COPE', 'Respite')).toBe('Respite');
    expect(registry.deriveTimesheetSection('COPE', 'Personal Care')).toBe('PAS');
  });

  test('getServiceMap merges DB over defaults', async () => {
    const map = await registry.getServiceMap();
    expect(map.PCS.timesheetSection).toBe('PAS');
  });
});

describe('serviceRegistry per-agency cache isolation', () => {
  function fakeDb(rows) {
    return { service: { findMany: jest.fn().mockResolvedValue(rows) } };
  }

  beforeEach(() => {
    registry.invalidateAll();
  });

  test('two agencies redefining the same code see only their own metadata', async () => {
    const dbA = fakeDb([{ code: 'PCS', name: 'Agency A PCS', label: 'A', color: 'red', timesheetSection: 'PAS', sortOrder: 1, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);
    const dbB = fakeDb([{ code: 'PCS', name: 'Agency B PCS', label: 'B', color: 'blue', timesheetSection: 'PAS', sortOrder: 2, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);

    const mapA = await runWithTenant({ agencyId: 1, db: dbA }, () => registry.getServiceMap());
    const mapB = await runWithTenant({ agencyId: 2, db: dbB }, () => registry.getServiceMap());

    expect(mapA.PCS.name).toBe('Agency A PCS');
    expect(mapB.PCS.name).toBe('Agency B PCS');
    // Re-reading agency A after loading B must still show A's cached value,
    // not be clobbered by B's load.
    const mapAAgain = await runWithTenant({ agencyId: 1, db: dbA }, () => registry.getServiceMap());
    expect(mapAAgain.PCS.name).toBe('Agency A PCS');
  });

  test('invalidate() with no args clears only the current tenant context agency', async () => {
    const dbA = fakeDb([{ code: 'PCS', name: 'Agency A PCS', label: 'A', color: '', timesheetSection: 'PAS', sortOrder: 1, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);
    const dbB = fakeDb([{ code: 'PCS', name: 'Agency B PCS', label: 'B', color: '', timesheetSection: 'PAS', sortOrder: 1, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);

    await runWithTenant({ agencyId: 1, db: dbA }, () => registry.getServiceMap());
    await runWithTenant({ agencyId: 2, db: dbB }, () => registry.getServiceMap());

    // Invalidate from inside agency 1's request context only.
    runWithTenant({ agencyId: 1, db: dbA }, () => registry.invalidate());

    // Agency 1 should re-fetch (sync map falls back to defaults-only since its
    // cache entry was cleared).
    const syncA = registry.getServiceMapSync(1);
    expect(syncA.PCS.name).not.toBe('Agency A PCS');

    // Agency 2's cache must be untouched by agency 1's invalidation.
    const syncB = registry.getServiceMapSync(2);
    expect(syncB.PCS.name).toBe('Agency B PCS');
  });

  test('invalidateAll() clears every agency (explicit escape hatch, not the no-arg default)', async () => {
    const dbA = fakeDb([{ code: 'PCS', name: 'Agency A PCS', label: 'A', color: '', timesheetSection: 'PAS', sortOrder: 1, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);
    const dbB = fakeDb([{ code: 'PCS', name: 'Agency B PCS', label: 'B', color: '', timesheetSection: 'PAS', sortOrder: 1, enforceAuthLimit: true, category: 'EVV', accountNumber: '' }]);

    await runWithTenant({ agencyId: 1, db: dbA }, () => registry.getServiceMap());
    await runWithTenant({ agencyId: 2, db: dbB }, () => registry.getServiceMap());

    registry.invalidateAll();

    expect(registry.getServiceMapSync(1).PCS.name).not.toBe('Agency A PCS');
    expect(registry.getServiceMapSync(2).PCS.name).not.toBe('Agency B PCS');
  });
});
