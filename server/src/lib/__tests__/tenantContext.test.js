const { runWithTenant, getTenantDb, getAgencyId, getImpersonatorId } = require('../tenantContext');

test('getAgencyId returns null outside a context', () => {
  expect(getAgencyId()).toBeNull();
});

test('getTenantDb throws outside a context', () => {
  expect(() => getTenantDb()).toThrow('No tenant context');
});

test('values are visible inside runWithTenant, including across await', async () => {
  const fakeDb = { tag: 'db-7' };
  await runWithTenant({ agencyId: 7, db: fakeDb, impersonatorId: 99 }, async () => {
    await new Promise((r) => setImmediate(r));
    expect(getAgencyId()).toBe(7);
    expect(getTenantDb()).toBe(fakeDb);
    expect(getImpersonatorId()).toBe(99);
  });
  expect(getAgencyId()).toBeNull();
});
