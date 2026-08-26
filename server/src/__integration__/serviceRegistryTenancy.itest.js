// Proves serviceRegistry's per-agency cache/DB-read isolation against a real
// Postgres instance (RLS included), not mocks. Two agencies define the same
// service code ("PCS") with different display metadata; each must see only
// its own row through getServiceMap/getServiceMapSync/deriveTimesheetSection,
// even when both are read within the same process (the module-level cache is
// a Map keyed by agencyId, not a single shared value).
const { createAgencyWithAdmin, cleanupAgencies, systemPrisma } = require('./helpers');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const registry = require('../services/serviceRegistry');

let A, B;

beforeAll(async () => {
  A = await createAgencyWithAdmin('svc-reg-a');
  B = await createAgencyWithAdmin('svc-reg-b');

  // Same code, deliberately different metadata per agency.
  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () =>
    tenantClient(A.agency.id).service.create({
      data: {
        category: 'EVV', code: 'PCS', name: 'Agency A Personal Care',
        label: 'A-PCS', color: '#111111', timesheetSection: 'PAS',
        sortOrder: 1, enforceAuthLimit: true,
      },
    })
  );
  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () =>
    tenantClient(B.agency.id).service.create({
      data: {
        category: 'EVV', code: 'PCS', name: 'Agency B Personal Care',
        label: 'B-PCS', color: '#222222', timesheetSection: 'Homemaker',
        sortOrder: 2, enforceAuthLimit: false,
      },
    })
  );
});

afterAll(async () => {
  await cleanupAgencies(['svc-reg-a', 'svc-reg-b']);
  await systemPrisma.$disconnect();
});

afterEach(() => registry.invalidateAll());

test('two agencies with the same service code see only their own metadata via getServiceMap', async () => {
  const mapA = await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  const mapB = await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () => registry.getServiceMap());

  expect(mapA.PCS.name).toBe('Agency A Personal Care');
  expect(mapA.PCS.color).toBe('#111111');
  expect(mapA.PCS.timesheetSection).toBe('PAS');

  expect(mapB.PCS.name).toBe('Agency B Personal Care');
  expect(mapB.PCS.color).toBe('#222222');
  expect(mapB.PCS.timesheetSection).toBe('Homemaker');
});

test('loading one agency after another does not clobber the first (per-agency cache, not a single slot)', async () => {
  const firstA = await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  expect(firstA.PCS.name).toBe('Agency A Personal Care');

  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () => registry.getServiceMap());

  const secondA = await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  expect(secondA.PCS.name).toBe('Agency A Personal Care');
});

test('getServiceMapSync reflects each agency once its map has been loaded', async () => {
  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () => registry.getServiceMap());

  expect(registry.getServiceMapSync(A.agency.id).PCS.name).toBe('Agency A Personal Care');
  expect(registry.getServiceMapSync(B.agency.id).PCS.name).toBe('Agency B Personal Care');
});

test('deriveTimesheetSection resolves per-agency DB overrides, not the shared default', async () => {
  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () => registry.getServiceMap());

  // Agency A's PCS row overrides the section to PAS (matches the default);
  // Agency B's overrides it to Homemaker — the divergent case that proves the
  // registry is reading each agency's own row, not falling back to defaults.
  expect(registry.deriveTimesheetSection('PCS', '', A.agency.id)).toBe('PAS');
  expect(registry.deriveTimesheetSection('PCS', '', B.agency.id)).toBe('Homemaker');
});

test('sectionEnforcesLimit is agency-scoped', async () => {
  // 'PAS' is a real section with default-fallback codes (PCS, SDPC, ...) that
  // enforce, so both agencies read true there regardless of the PCS override
  // above — a positive control that the section-level aggregation still works
  // per agency. The interesting isolation case is a section that exists ONLY
  // as a DB override with no SERVICE_DEFAULTS entry at all: agency A's row
  // enforces, agency B's identically-named section does not, and neither
  // agency may see the other's row while computing it.
  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () =>
    tenantClient(A.agency.id).service.create({
      data: {
        category: 'GUIDE', code: 'ZZ_A_ONLY', timesheetSection: 'ZZTESTSECTION',
        enforceAuthLimit: true,
      },
    })
  );
  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () =>
    tenantClient(B.agency.id).service.create({
      data: {
        category: 'GUIDE', code: 'ZZ_B_ONLY', timesheetSection: 'ZZTESTSECTION',
        enforceAuthLimit: false,
      },
    })
  );
  registry.invalidateAll();

  const enforcesA = await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, async () => {
    await registry.getServiceMap();
    return registry.sectionEnforcesLimit('ZZTESTSECTION');
  });
  const enforcesB = await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, async () => {
    await registry.getServiceMap();
    return registry.sectionEnforcesLimit('ZZTESTSECTION');
  });

  expect(enforcesA).toBe(true);
  // If agency B's read ever saw agency A's ZZ_A_ONLY row (enforceAuthLimit:
  // true), this would wrongly come back true too.
  expect(enforcesB).toBe(false);
});

test('invalidate() inside one agency\'s tenant context does not evict the other agency\'s cache', async () => {
  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, () => registry.getServiceMap());
  await runWithTenant({ agencyId: B.agency.id, db: tenantClient(B.agency.id) }, () => registry.getServiceMap());

  await runWithTenant({ agencyId: A.agency.id, db: tenantClient(A.agency.id) }, async () => {
    registry.invalidate();
  });

  // B's cached map must still be intact (no re-fetch needed to prove this —
  // getServiceMapSync only ever reads the cache).
  expect(registry.getServiceMapSync(B.agency.id).PCS.name).toBe('Agency B Personal Care');
});
