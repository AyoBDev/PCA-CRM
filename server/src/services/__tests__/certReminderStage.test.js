const { computeStage, daysBetween, versionKeyFor } = require('../certReminderService');

test('computeStage: >30 days out is null (no stage yet)', () => {
  expect(computeStage(45)).toBeNull();
});
test('computeStage: 30..8 days out is the 30-day stage', () => {
  expect(computeStage(30)).toBe('reminder_30day');
  expect(computeStage(8)).toBe('reminder_30day');
});
test('computeStage: 7..1 days out is the 7-day stage', () => {
  expect(computeStage(7)).toBe('reminder_7day');
  expect(computeStage(1)).toBe('reminder_7day');
});
test('computeStage: 0 or past is the final stage', () => {
  expect(computeStage(0)).toBe('expired_final');
  expect(computeStage(-3)).toBe('expired_final');
});

test('daysBetween: whole-day difference, ignoring time of day', () => {
  const now = new Date('2026-09-01T18:00:00Z');
  const exp = new Date('2026-09-08T02:00:00Z');
  expect(daysBetween(now, exp)).toBe(7);
});
test('daysBetween: negative when expired', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  const exp = new Date('2026-09-08T00:00:00Z');
  expect(daysBetween(now, exp)).toBe(-2);
});

test('versionKeyFor: uses currentVersionKey when present', () => {
  expect(versionKeyFor({ currentVersionKey: '42' })).toBe('42');
});
test('versionKeyFor: falls back to v0', () => {
  expect(versionKeyFor({ currentVersionKey: null })).toBe('v0');
});
