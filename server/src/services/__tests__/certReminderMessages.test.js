const { buildMessage } = require('../certReminderMessages');

const base = { name: 'Jane Doe', certLabel: 'CPR', expDate: new Date('2026-09-30T00:00:00Z') };

test('30-day message names the caregiver and cert and states the 30-day requirement', () => {
  const m = buildMessage('reminder_30day', base);
  expect(m.body).toContain('Jane Doe');
  expect(m.body).toContain('CPR');
  expect(m.body).toMatch(/30 days/);
  expect(m.subject).toContain('CPR');
  expect(m.html).toContain('Jane Doe');
  expect(m.text).toContain('CPR');
});

test('7-day message asks to renew immediately and mentions one week', () => {
  const m = buildMessage('reminder_7day', base);
  expect(m.body).toMatch(/one week/i);
  expect(m.body).toMatch(/immediately/i);
  expect(m.body).toContain('Jane Doe');
});

test('final message states expiration today', () => {
  const m = buildMessage('expired_final', base);
  expect(m.body).toMatch(/expired/i);
  expect(m.title).toMatch(/expired/i);
  expect(m.body).toContain('CPR');
});

test('unknown stage throws', () => {
  expect(() => buildMessage('nope', base)).toThrow();
});
