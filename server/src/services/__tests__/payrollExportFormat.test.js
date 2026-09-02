'use strict';

const {
    SHEET_COLUMNS,
    COLUMN_WIDTHS,
    COLORS,
    COL,
    buildExportModel,
    excelTimeFromHHMM,
    excelDurationFromMinutes,
    serviceCodeSortIndex,
} = require('../payrollExportFormat');

// ── Helpers ───────────────────────────────────────────────
const visit = (over = {}) => ({
    id: 1,
    clientName: 'ABAZYAN, HASMIK',
    employeeName: 'Abazyan, Manuk',
    service: 'Personal Care Services',
    serviceCode: 'PCS',
    visitDate: new Date('2026-08-23T00:00:00Z'),
    callInTime: '12:30',
    callOutTime: '19:30',
    durationMinutes: 420,
    visitStatus: 'Verified',
    finalPayableUnits: 28,
    unitsRaw: 28,
    voidFlag: false,
    voidReason: '',
    needsReview: false,
    reviewReason: '',
    notes: '',
    mergedInto: null,
    ...over,
});

const run = (visits, over = {}) => ({
    id: 1,
    name: 'Aug 23',
    periodStart: new Date('2026-08-23T00:00:00Z'),
    periodEnd: new Date('2026-08-29T00:00:00Z'),
    visits,
    ...over,
});

const rowsOf = (model) => model.rows;
const firstWhere = (model, fn) => model.rows.find(fn);

// ── Column / layout contract ──────────────────────────────
describe('sheet skeleton matches the agency Google Sheet', () => {
    test('nine columns in the agency order', () => {
        expect(SHEET_COLUMNS).toEqual([
            'Client', 'Employee Name', 'Services', 'Visit Date',
            'Call in', 'Call Out', 'Call Hours', 'Visit Status', 'Units',
        ]);
    });

    test('the nine printed column widths match the source sheet', () => {
        expect(COLUMN_WIDTHS.slice(0, 9)).toEqual([35.88, 59.88, 21.63, 13.38, 9.13, 11.13, 13.75, 14.25, 7.38]);
    });

    test('palette matches the source sheet', () => {
        expect(COLORS.headerGrey).toBe('FF999999');
        expect(COLORS.authMet).toBe('FF00FF00');
        expect(COLORS.authShort).toBe('FFFF0000');
        expect(COLORS.totalGreen).toBe('FFB7E1CD');
        expect(COLORS.annotationRed).toBe('FFFF0000');
    });

    test('row 1 is the header band, row 2 is the period label', () => {
        const m = buildExportModel(run([visit()]), {});
        expect(m.rows[0].kind).toBe('header');
        // The printed header band stops at Units; column J is left unlabelled.
        expect(m.rows[0].values.slice(0, 9)).toEqual(SHEET_COLUMNS);
        expect(m.rows[0].values[9]).toBe('');
        expect(m.rows[1].kind).toBe('period');
        expect(m.rows[1].values[0]).toBe('08/23/26-08/29/26');
    });
});

// ── Client blocks ─────────────────────────────────────────
describe('client blocks', () => {
    test('a client block is banner → visits → total → spacers', () => {
        const m = buildExportModel(run([visit()]), { 'abazyan hasmik': { PCS: 28 } });
        const kinds = m.rows.map((r) => r.kind);
        expect(kinds.slice(0, 6)).toEqual(['header', 'period', 'banner', 'visit', 'total', 'spacer']);
    });

    test('clients are ordered alphabetically', () => {
        const m = buildExportModel(run([
            visit({ id: 2, clientName: 'ZEBRA, ZOE' }),
            visit({ id: 1, clientName: 'ABAZYAN, HASMIK' }),
        ]), {});
        const names = m.rows.filter((r) => r.kind === 'visit').map((r) => r.values[0]);
        expect(names).toEqual(['ABAZYAN, HASMIK', 'ZEBRA, ZOE']);
    });

    test('total sums payable units, excluding void and needs-review rows', () => {
        const m = buildExportModel(run([
            visit({ id: 1, finalPayableUnits: 28 }),
            visit({ id: 2, finalPayableUnits: 20 }),
            visit({ id: 3, finalPayableUnits: 12, voidFlag: true }),
            visit({ id: 4, finalPayableUnits: 8, needsReview: true, reviewReason: 'missingCallOut' }),
        ]), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[8]).toBe(48);
    });

    test('total row is labelled and green in the Units column', () => {
        const m = buildExportModel(run([visit()]), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[5]).toBe('Total');
        expect(total.fills[8]).toBe(COLORS.totalGreen);
    });

    test('visits sort by service group then date then time-in', () => {
        const m = buildExportModel(run([
            visit({ id: 1, serviceCode: 'SDPC', visitDate: new Date('2026-08-23T00:00:00Z') }),
            visit({ id: 2, serviceCode: 'PCS',  visitDate: new Date('2026-08-25T00:00:00Z') }),
            visit({ id: 3, serviceCode: 'PCS',  visitDate: new Date('2026-08-23T00:00:00Z') }),
        ]), {});
        const ids = m.rows.filter((r) => r.kind === 'visit').map((r) => r.visitId);
        expect(ids).toEqual([3, 2, 1]);
    });
});

// ── Auth banner ───────────────────────────────────────────
describe('authorization banner', () => {
    test('green when reported units meet the authorization', () => {
        const m = buildExportModel(run([visit({ finalPayableUnits: 28 })]), { 'abazyan hasmik': { PCS: 28 } });
        const banner = firstWhere(m, (r) => r.kind === 'banner');
        const idx = banner.values.findIndex((v) => v === 'PCS 28');
        expect(idx).toBeGreaterThan(-1);
        expect(banner.fills[idx]).toBe(COLORS.authMet);
    });

    test('red when reported units fall short of the authorization', () => {
        const m = buildExportModel(run([visit({ finalPayableUnits: 20 })]), { 'abazyan hasmik': { PCS: 28 } });
        const banner = firstWhere(m, (r) => r.kind === 'banner');
        const idx = banner.values.findIndex((v) => v === 'PCS 28');
        expect(banner.fills[idx]).toBe(COLORS.authShort);
    });

    test('banner entries are right-aligned across the trailing columns and sorted by service order', () => {
        const m = buildExportModel(run([
            visit({ serviceCode: 'PCS' }),
            visit({ id: 2, serviceCode: 'S5130', service: 'Homemaker Service' }),
        ]), { 'abazyan hasmik': { S5130: 45, PCS: 93 } });
        const banner = firstWhere(m, (r) => r.kind === 'banner');
        const present = banner.values.filter(Boolean);
        expect(present).toEqual(['PCS 93', 'S5130 45']);
        // occupies the columns immediately left of Units (index 8)
        expect(banner.values[7]).toBe('S5130 45');
    });

    test('a client with no authorization gets no banner row', () => {
        const m = buildExportModel(run([visit()]), {});
        expect(m.rows.filter((r) => r.kind === 'banner')).toHaveLength(0);
    });

    test('the _records key from the auth snapshot is not treated as a service code', () => {
        const m = buildExportModel(run([visit()]), {
            'abazyan hasmik': { _records: [{ serviceCode: 'PCS', authorizedUnits: 28 }], PCS: 28 },
        });
        const banner = firstWhere(m, (r) => r.kind === 'banner');
        expect(banner.values.filter(Boolean)).toEqual(['PCS 28']);
    });
});

// ── Value formatting ──────────────────────────────────────
describe('cell values are real Excel types, not strings', () => {
    test('call-in/out are day fractions', () => {
        expect(excelTimeFromHHMM('12:30')).toBeCloseTo(0.520833333, 8);
        expect(excelTimeFromHHMM('19:30')).toBeCloseTo(0.8125, 8);
        expect(excelTimeFromHHMM('')).toBeNull();
    });

    test('call hours is a duration fraction', () => {
        expect(excelDurationFromMinutes(420)).toBeCloseTo(0.291666667, 8);
        expect(excelDurationFromMinutes(0)).toBeNull();
    });

    test('a visit row carries a Date object and numeric times', () => {
        const m = buildExportModel(run([visit()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[3]).toBeInstanceOf(Date);
        expect(typeof v.values[4]).toBe('number');
        expect(typeof v.values[6]).toBe('number');
        expect(v.values[8]).toBe(28);
    });

    test('call hours is derived from in/out when no stored duration exists', () => {
        const m = buildExportModel(run([visit({ durationMinutes: 0 })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[6]).toBeCloseTo(0.291666667, 8);
    });

    test('an incomplete visit leaves call-out and hours blank', () => {
        const m = buildExportModel(run([
            visit({ callOutTime: '', durationMinutes: 0, visitStatus: 'Incomplete', finalPayableUnits: 0, needsReview: true, reviewReason: 'missingCallOut' }),
        ]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[5]).toBe('');
        expect(v.values[6]).toBe('');
        expect(v.values[8]).toBe(0);
    });
});

// ── Annotations ───────────────────────────────────────────
describe('annotations', () => {
    test('a voided overnight visit is annotated in red', () => {
        const m = buildExportModel(run([
            visit({ voidFlag: true, voidReason: 'Overnight rule: call-out after 01:00' }),
        ]), {});
        const ann = firstWhere(m, (r) => r.kind === 'annotation');
        expect(ann.values.join(' ')).toContain('OVERNIGHT VOID');
        expect(ann.fonts.some((f) => f && f.color === COLORS.annotationRed)).toBe(true);
    });

    test('a daily-cap hit is annotated CLOCK-IN DAILY LIMIT', () => {
        const m = buildExportModel(run([
            visit({ voidReason: 'Reduced to 8: daily cap of 28 units (this client)' }),
        ]), {});
        const ann = firstWhere(m, (r) => r.kind === 'annotation');
        expect(ann.values.join(' ')).toContain('CLOCK-IN DAILY LIMIT');
    });

    test('a needs-review visit is annotated MISSING ON EVV', () => {
        const m = buildExportModel(run([
            visit({ needsReview: true, reviewReason: 'missingCallOut' }),
        ]), {});
        const ann = firstWhere(m, (r) => r.kind === 'annotation');
        expect(ann.values.join(' ')).toContain('MISSING ON EVV');
    });

    test('a visit note is carried through to the annotation area', () => {
        const m = buildExportModel(run([visit({ notes: 'START 5/12/26' })]), {});
        const ann = firstWhere(m, (r) => r.kind === 'annotation');
        expect(ann.values.join(' ')).toContain('START 5/12/26');
    });

    test('a clean run produces no annotation rows', () => {
        const m = buildExportModel(run([visit()]), {});
        expect(m.rows.filter((r) => r.kind === 'annotation')).toHaveLength(0);
    });

    test('annotations are de-duplicated per client', () => {
        const m = buildExportModel(run([
            visit({ id: 1, needsReview: true, reviewReason: 'missingCallOut' }),
            visit({ id: 2, needsReview: true, reviewReason: 'missingCallIn' }),
        ]), {});
        const texts = m.rows.filter((r) => r.kind === 'annotation').flatMap((r) => r.values.filter(Boolean));
        expect(texts.filter((t) => t === 'MISSING ON EVV')).toHaveLength(1);
    });
});

// ── Edge cases ────────────────────────────────────────────
describe('edge cases', () => {
    test('merged EVV rows are excluded from the sheet', () => {
        const m = buildExportModel(run([
            visit({ id: 1 }),
            visit({ id: 2, mergedInto: 1 }),
        ]), {});
        expect(m.rows.filter((r) => r.kind === 'visit')).toHaveLength(1);
    });

    test('a visit with no client name is grouped under a placeholder, sorted last', () => {
        const m = buildExportModel(run([
            visit({ id: 1, clientName: '' }),
            visit({ id: 2, clientName: 'ABAZYAN, HASMIK' }),
        ]), {});
        const names = m.rows.filter((r) => r.kind === 'visit').map((r) => r.values[0]);
        expect(names[names.length - 1]).toBe('(Unknown Client)');
    });

    test('a run with no visits still emits header and period rows', () => {
        const m = buildExportModel(run([]), {});
        expect(m.rows.map((r) => r.kind)).toEqual(['header', 'period']);
    });

    test('service code sort order follows the agency convention', () => {
        expect(serviceCodeSortIndex('PCS')).toBeLessThan(serviceCodeSortIndex('S5130'));
        expect(serviceCodeSortIndex('S5130')).toBeLessThan(serviceCodeSortIndex('SDPC'));
        expect(serviceCodeSortIndex('UNKNOWN')).toBeGreaterThan(serviceCodeSortIndex('SDPC'));
    });

    test('a null visit date does not crash and renders blank', () => {
        const m = buildExportModel(run([visit({ visitDate: null })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[3]).toBe('');
    });
});

// ── Void rows ─────────────────────────────────────────────
describe('void rows are highlighted with their reason in column J', () => {
    const voided = (over = {}) => visit({
        voidFlag: true,
        voidReason: 'No authorized units remaining (void)',
        finalPayableUnits: 0,
        ...over,
    });

    test('every cell of a void row carries the void highlight fill', () => {
        const m = buildExportModel(run([voided()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        for (let i = 0; i < SHEET_COLUMNS.length; i++) {
            expect(v.fills[i]).toBe(COLORS.voidRow);
        }
    });

    test('the reason is written in column J, immediately right of Units', () => {
        const m = buildExportModel(run([voided()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(COL.VOID_REASON).toBe(9);
        expect(v.values[COL.VOID_REASON]).toBe('No authorized units remaining (void)');
    });

    test('the reason text is red so it reads as an exception', () => {
        const m = buildExportModel(run([voided()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fonts[COL.VOID_REASON]).toMatchObject({ color: COLORS.annotationRed });
    });

    test('the overnight void reason is carried through verbatim', () => {
        const reason = 'Overnight > 01:00 AM (void); Clock Out on next calendar day';
        const m = buildExportModel(run([voided({ voidReason: reason })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[COL.VOID_REASON]).toBe(reason);
    });

    test('a void row still reports zero units', () => {
        const m = buildExportModel(run([voided({ finalPayableUnits: 20 })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[COL.UNITS]).toBe(0);
    });

    test('a void row with no stated reason is still highlighted, with column J blank', () => {
        const m = buildExportModel(run([voided({ voidReason: '' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.voidRow);
        expect(v.values[COL.VOID_REASON]).toBe('');
    });

    test('non-void rows are neither highlighted nor annotated in column J', () => {
        const m = buildExportModel(run([visit()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
        expect(v.values[COL.VOID_REASON]).toBe('');
    });

    test('void rows are excluded from the client total', () => {
        const m = buildExportModel(run([
            visit({ id: 1, finalPayableUnits: 28 }),
            voided({ id: 2, finalPayableUnits: 20 }),
        ]), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[COL.UNITS]).toBe(28);
    });

    test('every row is wide enough to hold column J', () => {
        const m = buildExportModel(run([voided()]), {});
        for (const row of m.rows) {
            expect(row.values.length).toBe(SHEET_COLUMNS.length + 1);
            expect(row.fills.length).toBe(SHEET_COLUMNS.length + 1);
            expect(row.fonts.length).toBe(SHEET_COLUMNS.length + 1);
        }
    });

    test('a width is provided for column J', () => {
        const m = buildExportModel(run([voided()]), {});
        expect(m.widths).toHaveLength(SHEET_COLUMNS.length + 1);
        expect(m.widths[COL.VOID_REASON]).toBeGreaterThan(20);
    });

    test('the void highlight is distinct from the auth-banner and total fills', () => {
        expect(COLORS.voidRow).not.toBe(COLORS.authShort);
        expect(COLORS.voidRow).not.toBe(COLORS.authMet);
        expect(COLORS.voidRow).not.toBe(COLORS.totalGreen);
    });
});
