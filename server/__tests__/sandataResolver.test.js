const { buildLiveSandataMap, resolveShiftSandataId } = require('../src/lib/sandataResolver');

describe('buildLiveSandataMap', () => {
  test('keys by clientId|serviceCode and trims the id', () => {
    const map = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: '  HEIDI-123 ', manualStatus: 'active' },
    ]);
    expect(map['42|PCS']).toBe('HEIDI-123');
  });

  test('ignores authorizations with a blank Sandata id', () => {
    const map = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'S5150', sandataClientId: '', manualStatus: 'active' },
      { clientId: 42, serviceCode: 'S5150', sandataClientId: '   ', manualStatus: 'active' },
    ]);
    expect(map['42|S5150']).toBeUndefined();
  });

  test('an active authorization wins over an inactive one for the same key', () => {
    const map = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'OLD', manualStatus: 'inactive' },
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'NEW', manualStatus: 'active' },
    ]);
    expect(map['42|PCS']).toBe('NEW');
  });

  test('treats null manualStatus as active', () => {
    const map = buildLiveSandataMap([
      { clientId: 7, serviceCode: 'PCS', sandataClientId: 'X', manualStatus: null },
    ]);
    expect(map['7|PCS']).toBe('X');
  });

  test('does not cross-match different clients or codes', () => {
    const map = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI', manualStatus: 'active' },
      { clientId: 99, serviceCode: 'PCS', sandataClientId: 'JAVIER', manualStatus: 'active' },
    ]);
    expect(map['42|PCS']).toBe('HEIDI');
    expect(map['99|PCS']).toBe('JAVIER');
    expect(map['42|S5130']).toBeUndefined();
  });
});

describe('resolveShiftSandataId', () => {
  const liveMap = { '42|PCS': 'HEIDI-123' };

  test('returns the live authorization id, overriding a stale shift copy', () => {
    const shift = { clientId: 42, serviceCode: 'PCS', sandataClientId: 'JAVIER-999' };
    expect(resolveShiftSandataId(shift, liveMap)).toBe('HEIDI-123');
  });

  test('falls back to the stored shift value when there is no live match', () => {
    const shift = { clientId: 42, serviceCode: 'S5150', sandataClientId: 'ONLY-ON-SHIFT' };
    expect(resolveShiftSandataId(shift, liveMap)).toBe('ONLY-ON-SHIFT');
  });

  test('returns empty string when neither source has a value', () => {
    const shift = { clientId: 42, serviceCode: 'S5150', sandataClientId: '' };
    expect(resolveShiftSandataId(shift, liveMap)).toBe('');
  });
});
