// Tests the one-time shift Sandata-ID cleanup script's selection + write logic.
// prisma and fs are mocked so no DB or disk is touched.

jest.mock('../src/lib/prisma', () => ({
  shift: { findMany: jest.fn(), update: jest.fn() },
  authorization: { findMany: jest.fn() },
  $disconnect: jest.fn(),
}));
jest.mock('fs', () => ({ mkdirSync: jest.fn(), writeFileSync: jest.fn() }));

const prisma = require('../src/lib/prisma');
const { main } = require('../prisma/fix-shift-sandata-ids');

function shift(id, clientId, serviceCode, sandataClientId) {
  return {
    id, clientId, serviceCode, sandataClientId,
    shiftDate: new Date('2026-08-10T00:00:00.000Z'),
    client: { clientName: `Client ${clientId}` },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  prisma.shift.update.mockResolvedValue({});
});
afterEach(() => console.log.mockRestore());

test('dry run reports drift but writes nothing', async () => {
  prisma.shift.findMany.mockResolvedValue([
    shift(1, 42, 'PCS', 'JAVIER-999'), // drifted
    shift(2, 42, 'PCS', 'HEIDI-123'),  // already correct
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active' },
  ]);

  const summary = await main(false);

  expect(summary).toEqual({ scanned: 2, corrected: 0, pending: 1 });
  expect(prisma.shift.update).not.toHaveBeenCalled();
});

test('apply corrects only the drifted shift, to the live authorization value', async () => {
  prisma.shift.findMany.mockResolvedValue([
    shift(1, 42, 'PCS', 'JAVIER-999'), // drifted -> fix
    shift(2, 42, 'PCS', 'HEIDI-123'),  // correct -> skip
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active' },
  ]);

  const summary = await main(true);

  expect(summary).toEqual({ scanned: 2, corrected: 1 });
  expect(prisma.shift.update).toHaveBeenCalledTimes(1);
  expect(prisma.shift.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { sandataClientId: 'HEIDI-123' },
  });
});

test('never touches a shift when its client+code has no authorization id', async () => {
  prisma.shift.findMany.mockResolvedValue([
    shift(3, 42, 'S5150', 'ONLY-ON-SHIFT'),
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'S5150', sandataClientId: '', manualStatus: 'active' }, // blank id
  ]);

  const summary = await main(true);

  expect(summary).toEqual({ scanned: 1, corrected: 0 });
  expect(prisma.shift.update).not.toHaveBeenCalled();
});

test('is idempotent: a second apply run changes nothing', async () => {
  // After a prior apply, all shifts already match the live value.
  prisma.shift.findMany.mockResolvedValue([
    shift(1, 42, 'PCS', 'HEIDI-123'),
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active' },
  ]);

  const summary = await main(true);

  expect(summary).toEqual({ scanned: 1, corrected: 0 });
  expect(prisma.shift.update).not.toHaveBeenCalled();
});
