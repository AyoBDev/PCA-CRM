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
});
