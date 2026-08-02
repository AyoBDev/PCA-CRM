const { TERMINAL_OUTCOMES, STALE_WARN_DAYS, STUCK_DAYS, isTerminalOutcome } = require('../src/services/leadService');

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
