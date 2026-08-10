const XLSX = require('xlsx');
const os = require('os');
const nodePath = require('path');

jest.mock('../src/lib/prisma', () => ({
    shift: { findMany: jest.fn(), update: jest.fn() },
    authorization: { findMany: jest.fn() },
    $disconnect: jest.fn(),
}));
// NOTE: fs is NOT mocked here — the cleanup writes a CSV report and we write real xlsx fixtures.

const prisma = require('../src/lib/prisma');
const { main, parseDecisionsFile } = require('../prisma/fix-shift-sandata-ids');

const shift = (id, clientId, serviceCode, sandataClientId) => ({
    id, clientId, serviceCode, sandataClientId,
    shiftDate: new Date('2026-08-10T00:00:00.000Z'),
    client: { clientName: `Client ${clientId}` },
});

function writeDecisions(rows) {
    const header = ['Client', 'Service', 'Current ID', 'Proposed ID', '# shifts', 'Date range',
        'Category', 'Owner decision', 'Correct ID', 'Notes', 'group_key'];
    const aoa = [header, ...rows.map(r => ['', '', '', '', '', '', '', r.decision, r.correctId || '', '', r.group_key])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Review');
    const p = nodePath.join(os.tmpdir(), `dec-${Date.now()}-${Math.random()}.xlsx`);
    XLSX.writeFile(wb, p);
    return p;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    prisma.shift.update.mockResolvedValue({});
});
afterEach(() => { console.log.mockRestore(); console.warn.mockRestore(); });

test('parseDecisionsFile keys by group_key with normalized decision', () => {
    const p = writeDecisions([{ group_key: '42|PCS|JAVIER|HEIDI', decision: 'Use Proposed' }]);
    const m = parseDecisionsFile(p);
    expect(m.get('42|PCS|JAVIER|HEIDI')).toEqual({ decision: 'use proposed', correctId: '' });
});

test('applies Use proposed and Enter correct ID; skips Keep current and unknown', async () => {
    prisma.shift.findMany.mockResolvedValue([
        shift(1, 42, 'PCS', 'JAVIER'),   // group 42|PCS|JAVIER|HEIDI -> Use proposed
        shift(2, 7, 'S5130', 'X'),       // group 7|S5130|X|Y        -> Enter correct ID = Z
        shift(3, 9, 'PCS', 'OLD'),       // group 9|PCS|OLD|NEW       -> Keep current
        shift(4, 5, 'PCS', 'HUH'),       // group 5|PCS|HUH|NEW2      -> unknown decision
    ]);
    prisma.authorization.findMany.mockResolvedValue([
        { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI', manualStatus: 'active' },
        { clientId: 7, serviceCode: 'S5130', sandataClientId: 'Y', manualStatus: 'active' },
        { clientId: 9, serviceCode: 'PCS', sandataClientId: 'NEW', manualStatus: 'active' },
        { clientId: 5, serviceCode: 'PCS', sandataClientId: 'NEW2', manualStatus: 'active' },
    ]);
    const p = writeDecisions([
        { group_key: '42|PCS|JAVIER|HEIDI', decision: 'Use proposed' },
        { group_key: '7|S5130|X|Y', decision: 'Enter correct ID', correctId: 'Z' },
        { group_key: '9|PCS|OLD|NEW', decision: 'Keep current' },
        { group_key: '5|PCS|HUH|NEW2', decision: 'nonsense' },
    ]);

    const summary = await main(true, null, p);

    expect(summary.corrected).toBe(2);
    const calls = prisma.shift.update.mock.calls.map(c => c[0]);
    expect(calls).toContainEqual({ where: { id: 1 }, data: { sandataClientId: 'HEIDI' } });
    expect(calls).toContainEqual({ where: { id: 2 }, data: { sandataClientId: 'Z' } });
    expect(prisma.shift.update).toHaveBeenCalledTimes(2);
});

test('Enter correct ID with blank Correct ID skips and never blanks the shift', async () => {
    prisma.shift.findMany.mockResolvedValue([shift(1, 42, 'PCS', 'JAVIER')]);
    prisma.authorization.findMany.mockResolvedValue([
        { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI', manualStatus: 'active' },
    ]);
    const p = writeDecisions([{ group_key: '42|PCS|JAVIER|HEIDI', decision: 'Enter correct ID', correctId: '' }]);
    const summary = await main(true, null, p);
    expect(summary.corrected).toBe(0);
    expect(prisma.shift.update).not.toHaveBeenCalled();
});
