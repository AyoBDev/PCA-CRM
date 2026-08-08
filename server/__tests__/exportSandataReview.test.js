jest.mock('../src/lib/prisma', () => ({
    shift: { findMany: jest.fn() },
    authorization: { findMany: jest.fn() },
    $disconnect: jest.fn(),
}));
jest.mock('fs', () => ({ mkdirSync: jest.fn(), writeFileSync: jest.fn() }));
jest.mock('xlsx', () => ({
    utils: { aoa_to_sheet: jest.fn(() => ({})), book_new: jest.fn(() => ({})), book_append_sheet: jest.fn() },
    writeFile: jest.fn(),
}));

const { buildAoa } = require('../prisma/export-sandata-review');

test('buildAoa emits a header row and one row per group with default decisions', () => {
    const groups = [
        { groupKey: '42|PCS|JAVIER|HEIDI', clientName: 'Heidi', serviceCode: 'PCS',
            oldValue: 'JAVIER', newValue: 'HEIDI', category: 'cross_client',
            shiftCount: 25, firstDate: '2026-08-03', lastDate: '2026-12-25' },
        { groupKey: '99|PCS|(blank)|Z1', clientName: 'Zed', serviceCode: 'PCS',
            oldValue: '(blank)', newValue: 'Z1', category: 'blank_fill_in',
            shiftCount: 5, firstDate: '2026-08-01', lastDate: '2026-09-01' },
        { groupKey: '7|S5130|X|Y', clientName: 'Amy', serviceCode: 'S5130',
            oldValue: 'X', newValue: 'Y', category: 'value_review',
            shiftCount: 3, firstDate: '2026-08-02', lastDate: '2026-08-16' },
    ];
    const aoa = buildAoa(groups);
    const header = aoa[0];
    expect(header).toEqual([
        'Client', 'Service', 'Current ID', 'Proposed ID', '# shifts', 'Date range',
        'Category', 'Owner decision', 'Correct ID', 'Notes', 'group_key',
    ]);
    const rows = aoa.slice(1);
    const heidi = rows.find(r => r[10] === '42|PCS|JAVIER|HEIDI');
    expect(heidi[7]).toBe('Use proposed');      // cross_client default
    const zed = rows.find(r => r[10] === '99|PCS|(blank)|Z1');
    expect(zed[7]).toBe('Use proposed');         // blank_fill_in default
    const amy = rows.find(r => r[10] === '7|S5130|X|Y');
    expect(amy[7]).toBe('');                      // value_review -> forced choice
    expect(amy[5]).toBe('2026-08-02 – 2026-08-16'); // date range formatting
});
