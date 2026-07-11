const { SERVICE_DEFAULTS, getDefault } = require('../serviceDefaults');

describe('serviceDefaults', () => {
  test('covers every known service code with a complete entry', () => {
    const required = ['PCS','SDPC','S5120','S5125','S5130','S5135','S5150',
      'TIMESHEETS','TIMESHEET_PCS','TIMESHEET_HOMEMAKER','TIMESHEET_RESPITE',
      'TIMESHEET_COMPANION','TIMESHEET_CHORE','COPE','PAS'];
    for (const code of required) {
      const d = SERVICE_DEFAULTS[code];
      expect(d).toBeDefined();
      expect(typeof d.category).toBe('string');
      expect(typeof d.timesheetSection).toBe('string');
      expect(typeof d.sortOrder).toBe('number');
    }
  });

  test('TIMESHEET_RESPITE maps to Respite section, account 71119, no auth limit', () => {
    const d = getDefault('TIMESHEET_RESPITE');
    expect(d.timesheetSection).toBe('Respite');
    expect(d.accountNumber).toBe('71119');
    expect(d.enforceAuthLimit).toBe(false);
  });

  test('every entry declares enforceAuthLimit as a boolean', () => {
    for (const code of Object.keys(SERVICE_DEFAULTS)) {
      expect(typeof SERVICE_DEFAULTS[code].enforceAuthLimit).toBe('boolean');
    }
  });

  test('real authorized services enforce the limit', () => {
    for (const code of ['PCS','SDPC','S5150','COPE','PAS']) {
      expect(SERVICE_DEFAULTS[code].enforceAuthLimit).toBe(true);
    }
  });

  test('getDefault returns undefined for unknown code', () => {
    expect(getDefault('NOPE')).toBeUndefined();
  });
});
