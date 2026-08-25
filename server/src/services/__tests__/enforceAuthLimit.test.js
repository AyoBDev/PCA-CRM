// serviceRegistry reads via getTenantDb()/a tenant-scoped client (see
// serviceRegistry.js) — not the owner-connection lib/prisma. This used to hit
// a real local DB directly with no agencyId and an upsert keyed on the old
// global-unique `code`, which broke once services required agency_id and the
// unique index moved to (agencyId, code). Rewritten as a mocked unit test
// using runWithTenant, matching serviceRegistry.test.js's per-agency tests.
const registry = require('../serviceRegistry');
const { runWithTenant } = require('../../lib/tenantContext');

const AGENCY_ID = 7;

function fakeDb(rows) {
  return { service: { findMany: jest.fn().mockResolvedValue(rows) } };
}

describe('serviceRegistry.sectionEnforcesLimit', () => {
  afterEach(() => registry.invalidateAll());

  test('PAS enforces because PCS (enforceAuthLimit=true) contributes', async () => {
    // No DB rows for PCS — falls back to SERVICE_DEFAULTS, where PCS is
    // enforceAuthLimit: true and timesheetSection: 'PAS'.
    const db = fakeDb([]);

    await runWithTenant({ agencyId: AGENCY_ID, db }, async () => {
      await registry.getServiceMap();
      expect(await registry.sectionEnforcesLimit('PAS')).toBe(true);
    });
  });

  test('a section with only enforceAuthLimit=false services does not enforce', async () => {
    // An isolated section whose only service has the flag off.
    const db = fakeDb([{
      code: '__NOLIMIT__', category: 'GUIDE', name: '', label: '', accountNumber: '',
      color: '', timesheetSection: 'ZZTESTSECTION', sortOrder: 50, enforceAuthLimit: false,
    }]);

    await runWithTenant({ agencyId: AGENCY_ID, db }, async () => {
      await registry.getServiceMap();
      expect(await registry.sectionEnforcesLimit('ZZTESTSECTION')).toBe(false);
    });
  });
});
