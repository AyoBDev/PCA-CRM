const {
  buildLiveSandataMap,
  resolveShiftSandataId,
  buildSandataOwnerMap,
  classifyDrift,
  groupDrift,
} = require('../src/lib/sandataResolver');

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

describe('classifyDrift', () => {
  // Auth ownership: 'HEIDI' belongs to client 42, 'JAVIER' to client 99.
  const ownerMap = buildSandataOwnerMap([
    { clientId: 42, sandataClientId: 'HEIDI' },
    { clientId: 99, sandataClientId: 'JAVIER' },
  ]);

  test('blank stored value -> blank_fill_in', () => {
    expect(classifyDrift({ clientId: 42, storedValue: '' }, ownerMap)).toBe('blank_fill_in');
    expect(classifyDrift({ clientId: 42, storedValue: '   ' }, ownerMap)).toBe('blank_fill_in');
  });

  test("stored value that belongs to a DIFFERENT client -> cross_client", () => {
    // Heidi's shift carrying Javier's id.
    expect(classifyDrift({ clientId: 42, storedValue: 'JAVIER' }, ownerMap)).toBe('cross_client');
  });

  test('different non-blank value owned by no other client -> value_review', () => {
    expect(classifyDrift({ clientId: 42, storedValue: '0123456' }, ownerMap)).toBe('value_review');
  });

  test('value owned only by the SAME client (e.g. wrong service code) -> value_review, not cross_client', () => {
    // 'PCS-ID' belongs only to client 42; a 42 shift carrying it under a different
    // service code is a same-client mismatch to review, not cross-contamination.
    const sameClientMap = buildSandataOwnerMap([
      { clientId: 42, sandataClientId: 'PCS-ID' },
    ]);
    expect(classifyDrift({ clientId: 42, storedValue: 'PCS-ID' }, sameClientMap)).toBe('value_review');
  });
});

describe('groupDrift', () => {
  const mk = (shiftId, shiftDate, extra = {}) => ({
    shiftId, clientId: 42, clientName: 'Heidi', serviceCode: 'PCS',
    shiftDate, oldValue: 'JAVIER', newValue: 'HEIDI', category: 'cross_client', ...extra,
  });

  test('collapses shifts sharing client+code+old+new into one row', () => {
    const groups = groupDrift([
      mk(1, '2026-08-03'), mk(2, '2026-08-10'), mk(3, '2026-08-17'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupKey).toBe('42|PCS|JAVIER|HEIDI');
    expect(groups[0].shiftCount).toBe(3);
    expect(groups[0].firstDate).toBe('2026-08-03');
    expect(groups[0].lastDate).toBe('2026-08-17');
    expect(groups[0].shiftIds).toEqual([1, 2, 3]);
    expect(groups[0].category).toBe('cross_client');
  });

  test('keeps different old->new pairs as separate groups and sorts by client then code', () => {
    const groups = groupDrift([
      { shiftId: 9, clientId: 99, clientName: 'Zed', serviceCode: 'PCS', shiftDate: '2026-08-01', oldValue: '(blank)', newValue: 'Z1', category: 'blank_fill_in' },
      mk(1, '2026-08-03'),
      { shiftId: 5, clientId: 42, clientName: 'Heidi', serviceCode: 'S5130', shiftDate: '2026-08-02', oldValue: 'X', newValue: 'Y', category: 'value_review' },
    ]);
    expect(groups.map(g => g.groupKey)).toEqual([
      '42|PCS|JAVIER|HEIDI', '42|S5130|X|Y', '99|PCS|(blank)|Z1',
    ]);
  });
});
