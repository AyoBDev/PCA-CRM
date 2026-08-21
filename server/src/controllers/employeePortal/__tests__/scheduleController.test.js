jest.mock('../../../lib/prisma', () => ({
  shift: { findMany: jest.fn() },
}));
const prisma = require('../../../lib/prisma');
const { getWeekSchedule } = require('../scheduleController');

function mockRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => jest.clearAllMocks());

test('week schedule query selects care-plan fields on the client', async () => {
  prisma.shift.findMany.mockResolvedValue([]);
  const req = { employee: { id: 7 }, query: { date: '2026-08-16' } };
  await getWeekSchedule(req, mockRes());

  const arg = prisma.shift.findMany.mock.calls[0][0];
  expect(arg.include.client.select).toMatchObject({
    clientName: true, address: true, phone: true, gateCode: true,
    mainServices: true, carePlanSchedule: true, caregiverRequirements: true,
  });
});
