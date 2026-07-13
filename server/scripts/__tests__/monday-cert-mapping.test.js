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
  test('decodes Excel serial number to correct date', () => {
    const d = m.parseExcelDate(46555); // 2027-06-17 per export decode
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(5);  // June (0-indexed)
    expect(d.getDate()).toBe(17);
  });
  test('parses ISO date string', () => {
    const d = m.parseExcelDate('2027-06-17');
    expect(d.getFullYear()).toBe(2027);
  });
  test('returns null for blank or invalid', () => {
    expect(m.parseExcelDate('')).toBeNull();
    expect(m.parseExcelDate(null)).toBeNull();
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
