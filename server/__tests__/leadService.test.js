const {
  statusToColumn,
  columnToStatus,
  LEAD_COLUMNS,
} = require('../src/services/leadService');

describe('statusToColumn', () => {
  test('maps both waiting statuses to the waiting column', () => {
    expect(statusToColumn('waiting_insurance')).toBe('waiting');
    expect(statusToColumn('waiting_docs')).toBe('waiting');
  });
  test('maps quoted and pending_start to the quoted column', () => {
    expect(statusToColumn('quoted')).toBe('quoted');
    expect(statusToColumn('pending_start')).toBe('quoted');
  });
  test('maps new and review to their own columns', () => {
    expect(statusToColumn('new')).toBe('new');
    expect(statusToColumn('review')).toBe('review');
  });
  test('converted has no board column', () => {
    expect(statusToColumn('converted')).toBeNull();
  });
});

describe('columnToStatus', () => {
  test('returns the primary status for a column', () => {
    expect(columnToStatus('waiting')).toBe('waiting_insurance');
    expect(columnToStatus('quoted')).toBe('quoted');
    expect(columnToStatus('new')).toBe('new');
    expect(columnToStatus('archived')).toBe('archived');
  });
});

describe('LEAD_COLUMNS', () => {
  test('has exactly 5 board columns', () => {
    expect(LEAD_COLUMNS).toHaveLength(5);
    expect(LEAD_COLUMNS.map(c => c.id)).toEqual(['new', 'review', 'waiting', 'quoted', 'archived']);
  });
});
