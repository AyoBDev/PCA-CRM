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
