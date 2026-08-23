const { getWeekSchedule } = require('../scheduleController');

function mockRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

function mockDb() {
  return { shift: { findMany: jest.fn() } };
}

beforeEach(() => jest.clearAllMocks());

test('week schedule query selects care-plan fields on the client', async () => {
  const db = mockDb();
  db.shift.findMany.mockResolvedValue([]);
  const req = { employee: { id: 7 }, query: { date: '2026-08-16' }, db };
  await getWeekSchedule(req, mockRes());

  const arg = db.shift.findMany.mock.calls[0][0];
  expect(arg.include.client.select).toMatchObject({
    clientName: true, address: true, phone: true, gateCode: true,
    mainServices: true, carePlanSchedule: true, caregiverRequirements: true,
  });
});
