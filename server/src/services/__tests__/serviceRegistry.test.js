const registry = require('../serviceRegistry');
const { SERVICE_DEFAULTS } = require('../../lib/serviceDefaults');

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
