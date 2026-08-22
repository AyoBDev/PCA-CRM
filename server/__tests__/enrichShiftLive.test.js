const { enrichShiftLive } = require('../src/services/schedulingService');
const { buildLiveSandataMap } = require('../src/lib/sandataResolver');

const maps = buildLiveSandataMap([
  { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
]);

test('overwrites accountNumber and sandataClientId with resolved values', () => {
  const shift = { id: 1, clientId: 42, serviceCode: 'PCS', accountNumber: 'STALE', sandataClientId: 'STALE', client: { clientName: 'John Smith' } };
  const out = enrichShiftLive(shift, maps);
  expect(out.accountNumber).toBe('71040');
  expect(out.sandataClientId).toBe('955054');
  expect(out.serviceLabel).toBeDefined(); // still enriched like enrichShift
});

test('blanks both when the client has no matching authorization', () => {
  const shift = { id: 2, clientId: 999, serviceCode: 'S5150', accountNumber: 'STALE', sandataClientId: 'STALE', client: { clientName: 'Nobody' } };
  const out = enrichShiftLive(shift, maps);
  expect(out.accountNumber).toBe('');
  expect(out.sandataClientId).toBe('');
});
