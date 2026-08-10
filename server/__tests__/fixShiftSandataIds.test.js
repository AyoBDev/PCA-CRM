// Tests the one-time shift Sandata-ID cleanup script's selection, classification,
// --only filtering and write logic. prisma and fs are mocked so no DB or disk is
// touched. `only` is passed explicitly (never left to read jest's process.argv).

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

  const summary = await main(false, null);

  expect(summary.scanned).toBe(2);
  expect(summary.corrected).toBe(0);
  expect(summary.pending).toBe(1);
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

  const summary = await main(true, null);

  expect(summary.corrected).toBe(1);
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

  const summary = await main(true, null);

  expect(summary.corrected).toBe(0);
  expect(prisma.shift.update).not.toHaveBeenCalled();
});

test('is idempotent: a second apply run changes nothing', async () => {
  prisma.shift.findMany.mockResolvedValue([
    shift(1, 42, 'PCS', 'HEIDI-123'),
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active' },
  ]);

  const summary = await main(true, null);

  expect(summary.corrected).toBe(0);
  expect(prisma.shift.update).not.toHaveBeenCalled();
});

describe('classification + --only filter', () => {
  // Fixture with one of each category:
  //   shift 1 (client 42): stored JAVIER (owned by client 99) -> cross_client
  //   shift 2 (client 42): stored ''                          -> blank_fill_in
  //   shift 3 (client 42): stored 0123456 (owned by nobody)   -> value_review
  // Client 42's PCS auth id is HEIDI-123 (the correct value for all three).
  function fixture() {
    prisma.shift.findMany.mockResolvedValue([
      shift(1, 42, 'PCS', 'JAVIER'),
      shift(2, 42, 'PCS', ''),
      shift(3, 42, 'PCS', '0123456'),
    ]);
    prisma.authorization.findMany.mockResolvedValue([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active' },
      { clientId: 99, serviceCode: 'PCS', sandataClientId: 'JAVIER', manualStatus: 'active' },
    ]);
  }

  test('counts each category', async () => {
    fixture();
    const summary = await main(false, null);
    expect(summary.counts).toEqual({ blank_fill_in: 1, cross_client: 1, value_review: 1 });
    expect(summary.pending).toBe(3); // no filter -> all selected
  });

  test('--only=cross_client applies ONLY the cross-client shift', async () => {
    fixture();
    const summary = await main(true, ['cross_client']);
    expect(summary.corrected).toBe(1);
    expect(prisma.shift.update).toHaveBeenCalledTimes(1);
    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sandataClientId: 'HEIDI-123' },
    });
  });

  test('--only=blank_fill_in,cross_client applies both, leaves value_review untouched', async () => {
    fixture();
    const summary = await main(true, ['blank_fill_in', 'cross_client']);
    expect(summary.corrected).toBe(2);
    const updatedIds = prisma.shift.update.mock.calls.map(c => c[0].where.id).sort();
    expect(updatedIds).toEqual([1, 2]);
  });

  test('--only=value_review applies only the review shift', async () => {
    fixture();
    const summary = await main(true, ['value_review']);
    expect(summary.corrected).toBe(1);
    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { sandataClientId: 'HEIDI-123' },
    });
  });
});
