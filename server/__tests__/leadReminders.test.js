const { TERMINAL_OUTCOMES, STALE_WARN_DAYS, STUCK_DAYS, isTerminalOutcome, classifyLeadForReminders } = require('../src/services/leadService');

describe('contact outcome constants', () => {
  test('terminal outcomes are the three closing ones', () => {
    expect(TERMINAL_OUTCOMES.sort()).toEqual(['reached_not_interested', 'went_elsewhere', 'wrong_number']);
  });
  test('isTerminalOutcome true for terminal, false otherwise', () => {
    expect(isTerminalOutcome('wrong_number')).toBe(true);
    expect(isTerminalOutcome('no_answer')).toBe(false);
    expect(isTerminalOutcome('')).toBe(false);
  });
  test('thresholds have the agreed values', () => {
    expect(STALE_WARN_DAYS).toBe(7);
    expect(STUCK_DAYS).toBe(7);
  });
});

const { DORMANT_DAYS } = require('../src/services/leadService');

const DAY = 86400000;
const now = new Date('2026-08-02T12:00:00Z');
function lead(over = {}) {
  return {
    status: 'review',
    followUpDate: null,
    updatedAt: new Date(now.getTime() - 1 * DAY),
    createdAt: new Date(now.getTime() - 1 * DAY),
    contactCount: 1,
    convertedAt: null,
    ...over,
  };
}

describe('classifyLeadForReminders', () => {
  test('follow-up due today or earlier -> due', () => {
    expect(classifyLeadForReminders(lead({ followUpDate: now }), { now })).toContain('due');
    expect(classifyLeadForReminders(lead({ followUpDate: new Date(now.getTime() - 2 * DAY) }), { now })).toContain('due');
  });
  test('follow-up in the future -> not due', () => {
    expect(classifyLeadForReminders(lead({ followUpDate: new Date(now.getTime() + 2 * DAY) }), { now })).not.toContain('due');
  });
  test('inactive within the stale warning window -> stale_soon', () => {
    const updatedAt = new Date(now.getTime() - 85 * DAY); // 85 days: between 83 (90-7) and 90
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).toContain('stale_soon');
  });
  test('inactive but not yet in the warning window -> not stale_soon', () => {
    const updatedAt = new Date(now.getTime() - 10 * DAY);
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).not.toContain('stale_soon');
  });
  test('new status, older than 24h, zero contacts -> new_untouched', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 2 * DAY), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).toContain('new_untouched');
  });
  test('new status with a contact logged -> not new_untouched', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 2 * DAY), contactCount: 1 });
    expect(classifyLeadForReminders(l, { now })).not.toContain('new_untouched');
  });
  test('non-new stage older than STUCK_DAYS -> stuck', () => {
    const l = lead({ status: 'review', updatedAt: new Date(now.getTime() - 8 * DAY) });
    expect(classifyLeadForReminders(l, { now })).toContain('stuck');
  });
  test('new stage is never counted as stuck (has its own bucket)', () => {
    const l = lead({ status: 'new', updatedAt: new Date(now.getTime() - 30 * DAY), createdAt: new Date(now.getTime() - 30 * DAY), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).not.toContain('stuck');
  });
  test('archived or converted -> empty', () => {
    expect(classifyLeadForReminders(lead({ status: 'archived' }), { now })).toEqual([]);
    expect(classifyLeadForReminders(lead({ convertedAt: now }), { now })).toEqual([]);
  });

  // Boundary tests for stale_soon: window is [83, 90) days
  test('stale_soon boundary: exactly 83 days inactive (lower bound, inclusive)', () => {
    const updatedAt = new Date(now.getTime() - 83 * DAY);
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).toContain('stale_soon');
  });
  test('stale_soon boundary: exactly 82 days inactive (below window, exclusive)', () => {
    const updatedAt = new Date(now.getTime() - 82 * DAY);
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).not.toContain('stale_soon');
  });
  test('stale_soon boundary: exactly 90 days inactive (upper bound, exclusive — becomes dormant)', () => {
    const updatedAt = new Date(now.getTime() - 90 * DAY);
    expect(classifyLeadForReminders(lead({ updatedAt }), { now })).not.toContain('stale_soon');
  });

  // Boundary tests for stuck: strict > 7 days
  test('stuck boundary: exactly 7 days with non-new status (exclusive)', () => {
    const l = lead({ status: 'review', updatedAt: new Date(now.getTime() - 7 * DAY) });
    expect(classifyLeadForReminders(l, { now })).not.toContain('stuck');
  });
  test('stuck boundary: exactly 8 days with non-new status (inclusive)', () => {
    const l = lead({ status: 'review', updatedAt: new Date(now.getTime() - 8 * DAY) });
    expect(classifyLeadForReminders(l, { now })).toContain('stuck');
  });

  // Boundary tests for new_untouched: strict > 24 hours
  test('new_untouched boundary: 23 hours old, status new, zero contacts (exclusive)', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 23 * 3600000), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).not.toContain('new_untouched');
  });
  test('new_untouched boundary: 25 hours old, status new, zero contacts (inclusive)', () => {
    const l = lead({ status: 'new', createdAt: new Date(now.getTime() - 25 * 3600000), contactCount: 0 });
    expect(classifyLeadForReminders(l, { now })).toContain('new_untouched');
  });

  // Boundary test for due: follow-up on same calendar day
  test('due boundary: follow-up date on same day as now (inclusive)', () => {
    // Create a follow-up date for "today" at 15:30 (3:30 PM)
    const todayLate = new Date(now);
    todayLate.setHours(15, 30, 0, 0);
    expect(classifyLeadForReminders(lead({ followUpDate: todayLate }), { now })).toContain('due');
  });
});

const { matchesOwner } = require('../src/services/leadService');

describe('matchesOwner', () => {
  const user = { name: 'Grace Intake', role: 'user' };
  const admin = { name: 'Boss', role: 'admin' };
  test('matches by assignedTo (case-insensitive, trimmed)', () => {
    expect(matchesOwner({ assignedTo: '  grace intake ', createdBy: '' }, user)).toBe(true);
  });
  test('matches by createdBy', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: 'Grace Intake' }, user)).toBe(true);
  });
  test('non-owner user does not match', () => {
    expect(matchesOwner({ assignedTo: 'Someone Else', createdBy: 'Another' }, user)).toBe(false);
  });
  test('admin also matches unowned leads', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: '' }, admin)).toBe(true);
  });
  test('non-admin does NOT match unowned leads', () => {
    expect(matchesOwner({ assignedTo: '', createdBy: '' }, user)).toBe(false);
  });
});
