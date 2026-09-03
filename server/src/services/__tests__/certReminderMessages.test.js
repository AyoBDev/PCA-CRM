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

const { buildBatchMessage } = require('../certReminderMessages');

const items3 = [
  { certLabel: 'CPR', stage: 'expired_final', expDate: new Date('2026-08-15T00:00:00Z') },
  { certLabel: 'TB Test', stage: 'reminder_7day', expDate: new Date('2026-09-10T00:00:00Z') },
  { certLabel: 'First Aid', stage: 'reminder_30day', expDate: new Date('2026-10-03T00:00:00Z') },
];

test('batch message lists each cert with its own stage and date', () => {
  const m = buildBatchMessage('Jane Doe', items3);
  expect(m.body).toContain('Jane Doe');
  expect(m.body).toMatch(/CPR/);
  expect(m.body).toMatch(/expired on Aug 15, 2026/);
  expect(m.body).toMatch(/TB Test/);
  expect(m.body).toMatch(/expires in 7 days/);
  expect(m.body).toMatch(/First Aid/);
  expect(m.body).toMatch(/expires in 30 days/);
});

test('batch subject reflects the most-urgent stage and counts', () => {
  const m = buildBatchMessage('Jane Doe', items3);
  // 1 expired + 2 expiring
  expect(m.subject).toMatch(/expired/i);
  expect(m.subject).toMatch(/1/);
  expect(m.subject).toMatch(/2/);
});

test('block warning appears once iff any item is expired', () => {
  const withExpired = buildBatchMessage('Jane', items3);
  expect((withExpired.body.match(/Compliance Blocked/g) || []).length).toBe(1);
  const noExpired = buildBatchMessage('Jane', [
    { certLabel: 'TB Test', stage: 'reminder_7day', expDate: new Date('2026-09-10T00:00:00Z') },
  ]);
  expect(noExpired.body).not.toMatch(/Compliance Blocked/);
});

test('single-item batch matches the single-cert wording', () => {
  const item = { certLabel: 'CPR', stage: 'reminder_30day', expDate: new Date('2026-09-30T00:00:00Z') };
  const batch = buildBatchMessage('Jane Doe', [item]);
  const single = buildMessage('reminder_30day', { name: 'Jane Doe', certLabel: 'CPR', expDate: item.expDate });
  expect(batch.body).toBe(single.body);
  expect(batch.subject).toBe(single.subject);
});

test('unknown stage in an item throws', () => {
  expect(() => buildBatchMessage('Jane', [{ certLabel: 'X', stage: 'nope', expDate: new Date() }])).toThrow();
});
