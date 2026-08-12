const {
  buildLiveSandataMap,
  resolveShiftAccountNumber,
  resolveShiftSandataId,
  buildSandataOwnerMap,
  classifyDrift,
  groupDrift,
} = require('../src/lib/sandataResolver');

describe('buildLiveSandataMap', () => {
  const auths = [
    { clientId: 42, serviceCode: 'PCS',   accountNumber: '71040', sandataClientId: '955054', manualStatus: 'active' },
    { clientId: 42, serviceCode: 'S5130', accountNumber: '71120', sandataClientId: '155788', manualStatus: 'active' },
  ];

  test('accountByClientService keys clientId|serviceCode -> accountNumber', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.accountByClientService['42|PCS']).toBe('71040');
    expect(m.accountByClientService['42|S5130']).toBe('71120');
  });

  test('sandataByClientAccount keys clientId|accountNumber -> id', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.sandataByClientAccount['42|71040']).toBe('955054');
    expect(m.sandataByClientAccount['42|71120']).toBe('155788');
  });

  test('sandataByClientService keys clientId|serviceCode -> id', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.sandataByClientService['42|PCS']).toBe('955054');
  });

  test('name maps use normalizeName (sorted tokens) from payrollService', () => {
    const m = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'Smith, John', manualStatus: 'active' },
    ]);
    expect(m.accountByNameService['john smith|PCS']).toBe('71040');
    expect(m.sandataByNameService['john smith|PCS']).toBe('955054');
  });

  test('reads clientName from shift.client.clientName when present', () => {
    const m = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', client: { clientName: 'John Smith' }, manualStatus: 'active' },
    ]);
    expect(m.sandataByNameService['john smith|PCS']).toBe('955054');
  });

  test('trims values and ignores blank targets', () => {
    const m = buildLiveSandataMap([
      { clientId: 1, serviceCode: 'PCS', accountNumber: '  71040 ', sandataClientId: '  X ', manualStatus: 'active' },
      { clientId: 2, serviceCode: 'PCS', accountNumber: '', sandataClientId: '', manualStatus: 'active' },
    ]);
    expect(m.accountByClientService['1|PCS']).toBe('71040');
    expect(m.sandataByClientAccount['1|71040']).toBe('X');
    expect(m.accountByClientService['2|PCS']).toBeUndefined();
    expect(m.sandataByClientService['2|PCS']).toBeUndefined();
  });

  test('active auth wins over inactive for the same key (both dimensions)', () => {
    const m = buildLiveSandataMap([
      { clientId: 7, serviceCode: 'PCS', accountNumber: '111', sandataClientId: 'OLD', manualStatus: 'inactive' },
      { clientId: 7, serviceCode: 'PCS', accountNumber: '222', sandataClientId: 'NEW', manualStatus: 'active' },
    ]);
    expect(m.accountByClientService['7|PCS']).toBe('222');
    expect(m.sandataByClientService['7|PCS']).toBe('NEW');
  });

  test('treats null manualStatus as active', () => {
    const m = buildLiveSandataMap([
      { clientId: 7, serviceCode: 'PCS', accountNumber: '111', sandataClientId: 'X', manualStatus: null },
    ]);
    expect(m.accountByClientService['7|PCS']).toBe('111');
  });
});

describe('resolveShiftAccountNumber', () => {
  const maps = buildLiveSandataMap([
    { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
  ]);

  test('resolves by clientId|serviceCode', () => {
    expect(resolveShiftAccountNumber({ clientId: 42, serviceCode: 'PCS' }, maps)).toBe('71040');
  });

  test('falls back to name|serviceCode when clientId does not match', () => {
    const shift = { clientId: 999, serviceCode: 'PCS', client: { clientName: 'Smith, John' } };
    expect(resolveShiftAccountNumber(shift, maps)).toBe('71040');
  });

  test('returns empty string when nothing matches (never the stored value)', () => {
    const shift = { clientId: 999, serviceCode: 'S5150', accountNumber: 'STORED', client: { clientName: 'Nobody' } };
    expect(resolveShiftAccountNumber(shift, maps)).toBe('');
  });
});

describe('resolveShiftSandataId', () => {
  const maps = buildLiveSandataMap([
    { clientId: 42, serviceCode: 'PCS',   accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
    { clientId: 42, serviceCode: 'S5130', accountNumber: '71120', sandataClientId: '155788', clientName: 'John Smith', manualStatus: 'active' },
  ]);

  test('primary: clientId|derivedAccount wins', () => {
    const shift = { clientId: 42, serviceCode: 'PCS', sandataClientId: 'STALE' };
    expect(resolveShiftSandataId(shift, '71040', maps)).toBe('955054');
  });

  test('two accounts: derived account selects the matching Sandata id', () => {
    const shift = { clientId: 42, serviceCode: 'S5130' };
    expect(resolveShiftSandataId(shift, '71120', maps)).toBe('155788');
  });

  test('blank derived account skips primary, falls to clientId|serviceCode', () => {
    const shift = { clientId: 42, serviceCode: 'PCS' };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('955054');
  });

  test('falls to name|serviceCode when clientId does not match', () => {
    const shift = { clientId: 999, serviceCode: 'PCS', client: { clientName: 'Smith, John' } };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('955054');
  });

  test('returns empty string when nothing matches (never the stored value)', () => {
    const shift = { clientId: 999, serviceCode: 'S5150', sandataClientId: 'STORED', client: { clientName: 'Nobody' } };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('');
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
