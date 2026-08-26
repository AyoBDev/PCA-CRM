const { tenantKey } = require('../storageService');
const { runWithTenant } = require('../../lib/tenantContext');

test('prefixes with agency id inside tenant context', async () => {
  await runWithTenant({ agencyId: 5, db: {} }, async () => {
    expect(tenantKey('admin-files/report.pdf')).toBe('agency/5/admin-files/report.pdf');
  });
});

test('returns key unchanged outside tenant context (platform/legacy)', () => {
  expect(tenantKey('admin-files/report.pdf')).toBe('admin-files/report.pdf');
});
