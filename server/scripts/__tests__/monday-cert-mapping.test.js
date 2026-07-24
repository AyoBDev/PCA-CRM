// server/scripts/__tests__/monday-cert-mapping.test.js
const m = require('../monday-cert-mapping');

describe('column maps', () => {
  test('FILE_COLUMN_MAP maps fixed cert columns to app cert types', () => {
    const byCol = Object.fromEntries(m.FILE_COLUMN_MAP.map(e => [e.column, e]));
    expect(byCol['TB/FILES'].certType).toBe('tb_test');
    expect(byCol['TB/FILES'].expirationColumn).toBe('Act Due TB/TB screening');
    expect(byCol['CPR/FILES'].certType).toBe('cpr');
    expect(byCol['CPR/FILES'].expirationColumn).toBe('Act  Due Date CPR');
    expect(byCol['TRAINING/FILES'].certType).toBe('annual_training');
    expect(byCol['NABS/FILES'].certType).toBe('background_check');
    expect(byCol['ID EXP DATE'].certType).toBe('id_expiration');
  });

  test('MIXED_COLUMN and OTHER_COLUMNS are defined', () => {
    expect(m.MIXED_COLUMN).toBe('TRAINING/CERTIFICATES');
    expect(m.OTHER_COLUMNS).toEqual(['NPPES COPIES', 'NPI']);
  });
});

describe('classifyTrainingFile', () => {
  test('routes culture files to cultural_competency', () => {
    expect(m.classifyTrainingFile('Cult_Connie Harris_2025.pdf')).toBe('cultural_competency');
    expect(m.classifyTrainingFile('Eloisa Culture.pdf')).toBe('cultural_competency');
  });
  test('routes infection files to infection_control', () => {
    expect(m.classifyTrainingFile('Eloisa Martinez_Infection.pdf')).toBe('infection_control');
    expect(m.classifyTrainingFile('Tiffany Davenport_Infection.pdf')).toBe('infection_control');
  });
  test('routes unmatched files to other', () => {
    expect(m.classifyTrainingFile('random-cert.pdf')).toBe('other');
    expect(m.classifyTrainingFile('')).toBe('other');
  });
});

describe('rankFiles', () => {
  const files = [
    { name: 'old.pdf', url: 'u1', created_at: '2023-01-01T00:00:00Z' },
    { name: 'newest.pdf', url: 'u2', created_at: '2025-06-01T00:00:00Z' },
    { name: 'mid.pdf', url: 'u3', created_at: '2024-03-01T00:00:00Z' },
  ];
  test('newest created_at becomes active', () => {
    const { active } = m.rankFiles(files);
    expect(active.name).toBe('newest.pdf');
  });
  test('remaining files are history, newest-first', () => {
    const { history } = m.rankFiles(files);
    expect(history.map(f => f.name)).toEqual(['mid.pdf', 'old.pdf']);
  });
  test('empty list yields null active and empty history', () => {
    expect(m.rankFiles([])).toEqual({ active: null, history: [] });
  });
  test('single file is active with no history', () => {
    const r = m.rankFiles([files[0]]);
    expect(r.active.name).toBe('old.pdf');
    expect(r.history).toEqual([]);
  });
});

describe('parseExcelDate', () => {
  // Expiration values are date-only and stored as DateTime (UTC) by Prisma.
  // Assert on UTC components so the stored calendar day is timezone-independent:
  // 2027-06-17 must persist and read back as 2027-06-17 in ANY server TZ
  // (Africa/Lagos UTC+1, US/Pacific UTC-7, etc.), not shift to the 16th/18th.
  test('decodes Excel serial number to correct UTC date', () => {
    const d = m.parseExcelDate(46555); // 2027-06-17 per export decode
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(5);  // June (0-indexed)
    expect(d.getUTCDate()).toBe(17);
    expect(d.toISOString().slice(0, 10)).toBe('2027-06-17');
  });
  test('parses ISO date string', () => {
    const d = m.parseExcelDate('2027-06-17');
    expect(d.getUTCFullYear()).toBe(2027);
  });
  test('parses ISO date string to the same UTC calendar day (TZ-safe)', () => {
    const d = m.parseExcelDate('2027-06-17');
    expect(d.toISOString().slice(0, 10)).toBe('2027-06-17'); // not 06-16 or 06-18
  });
  test('parses M/D/YYYY date string to the same UTC calendar day', () => {
    const d = m.parseExcelDate('6/17/2027');
    expect(d.toISOString().slice(0, 10)).toBe('2027-06-17');
  });
  test('returns null for blank or invalid', () => {
    expect(m.parseExcelDate('')).toBeNull();
    expect(m.parseExcelDate(null)).toBeNull();
    expect(m.parseExcelDate(undefined)).toBeNull();
    expect(m.parseExcelDate('not-a-date')).toBeNull();
  });
});

describe('matchEmployee', () => {
  const employees = [
    { id: 1, name: 'Angela Carpenter', email: 'angelacarpenter906@gmail.com' },
    { id: 2, name: 'Eloisa Martinez', email: 'eloisa.lol@live.com' },
  ];
  test('matches by name case-insensitively', () => {
    expect(m.matchEmployee({ name: 'angela carpenter', email: '' }, employees).id).toBe(1);
  });
  test('falls back to email when name does not match', () => {
    expect(m.matchEmployee({ name: 'Different Name', email: 'ELOISA.LOL@live.com' }, employees).id).toBe(2);
  });
  test('returns null when neither matches', () => {
    expect(m.matchEmployee({ name: 'Nobody', email: 'nobody@x.com' }, employees)).toBeNull();
  });
});

describe('buildCertPlan', () => {
  const columns = {
    'TB/FILES': { files: [
      { name: 'tb-old.pdf', url: 'a', created_at: '2023-01-01T00:00:00Z' },
      { name: 'tb-new.pdf', url: 'b', created_at: '2025-01-01T00:00:00Z' },
    ], value: 46555 },
    'Act Due TB/TB screening': { files: [], value: 46555 },
    'TRAINING/CERTIFICATES': { files: [
      { name: 'Cult_2025.pdf', url: 'c', created_at: '2025-02-01T00:00:00Z' },
      { name: 'Infection.pdf', url: 'd', created_at: '2024-02-01T00:00:00Z' },
    ], value: null },
    'NPI': { files: [{ name: 'npi.pdf', url: 'e', created_at: '2022-01-01T00:00:00Z' }], value: null },
  };

  test('produces tb_test with newest active and older history', () => {
    const plan = m.buildCertPlan(columns);
    const tb = plan.find(p => p.certType === 'tb_test');
    expect(tb.active.name).toBe('tb-new.pdf');
    expect(tb.history.map(f => f.name)).toEqual(['tb-old.pdf']);
    expect(tb.expirationDate.getFullYear()).toBe(2027); // 46555
  });

  test('splits mixed training column into cultural and infection', () => {
    const plan = m.buildCertPlan(columns);
    expect(plan.find(p => p.certType === 'cultural_competency').active.name).toBe('Cult_2025.pdf');
    expect(plan.find(p => p.certType === 'infection_control').active.name).toBe('Infection.pdf');
    expect(plan.find(p => p.certType === 'cultural_competency').expirationDate).toBeNull();
  });

  test('folds NPI into other with null expiration', () => {
    const plan = m.buildCertPlan(columns);
    const other = plan.find(p => p.certType === 'other');
    expect(other.active.name).toBe('npi.pdf');
    expect(other.expirationDate).toBeNull();
  });

  test('omits cert types with no files', () => {
    const plan = m.buildCertPlan({ 'CPR/FILES': { files: [], value: 46929 } });
    expect(plan.find(p => p.certType === 'cpr')).toBeUndefined();
  });
});
