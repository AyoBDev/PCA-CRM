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
        expect(kinds.slice(0, 6)).toEqual(['header', 'period', 'banner', 'visit', 'total', 'breakdown']);
    });

    test('clients are ordered alphabetically', () => {
        const m = buildExportModel(run([
            visit({ id: 2, clientName: 'ZEBRA, ZOE' }),
            visit({ id: 1, clientName: 'ABAZYAN, HASMIK' }),
        ]), {});
        const names = m.rows.filter((r) => r.kind === 'visit').map((r) => r.values[0]);
        expect(names).toEqual(['ABAZYAN, HASMIK', 'ZEBRA, ZOE']);
    });

    test('total sums the clocked units shown in the column above it', () => {
        const m = buildExportModel(run([
            visit({ id: 1, unitsRaw: 28, finalPayableUnits: 28 }),
            visit({ id: 2, unitsRaw: 20, finalPayableUnits: 20 }),
            visit({ id: 3, unitsRaw: 12, finalPayableUnits: 12, voidFlag: true }),
            visit({ id: 4, unitsRaw: 8, finalPayableUnits: 8, needsReview: true, reviewReason: 'missingCallOut' }),
        ]), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[8]).toBe(68);
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
            visit({ callOutTime: '', durationMinutes: 0, unitsRaw: 0, visitStatus: 'Incomplete', finalPayableUnits: 0, needsReview: true, reviewReason: 'missingCallOut' }),
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

    test('a void row shows the units that were clocked, not the zero it pays', () => {
        const m = buildExportModel(run([voided({ unitsRaw: 20, finalPayableUnits: 0 })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[COL.UNITS]).toBe(20);
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

    test('void rows contribute their clocked units to the column-I total', () => {
        const m = buildExportModel(run([
            visit({ id: 1, unitsRaw: 28, finalPayableUnits: 28 }),
            voided({ id: 2, unitsRaw: 20, finalPayableUnits: 0 }),
        ]), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[COL.UNITS]).toBe(48);
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

// ── Reduced rows ──────────────────────────────────────────
describe('rows reduced by a cap are shaded amber and state what was lost', () => {
    const reduced = (over = {}) => visit({
        voidFlag: false,
        unitsRaw: 23,
        finalPayableUnits: 6,
        voidReason: 'Reduced to 6: daily cap of 28 units (this client)',
        ...over,
    });

    test('a reduced row is shaded amber across the printed columns', () => {
        const m = buildExportModel(run([reduced()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        for (let i = 0; i < SHEET_COLUMNS.length; i++) {
            expect(v.fills[i]).toBe(COLORS.reducedRow);
        }
    });

    test('column J names the clocked and paid units', () => {
        const m = buildExportModel(run([reduced()]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 23 → 6: daily cap of 28 units (this client)');
    });

    test('a row zeroed by the daily cap is treated as reduced, not normal', () => {
        const m = buildExportModel(run([reduced({
            unitsRaw: 10,
            finalPayableUnits: 0,
            voidReason: 'Daily cap of 28 units already reached (this client)',
        })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.reducedRow);
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 10 → 0: Daily cap of 28 units already reached (this client)');
    });

    test('an authorization-balance reduction is shaded and explained too', () => {
        const m = buildExportModel(run([reduced({
            unitsRaw: 28,
            finalPayableUnits: 22,
            voidReason: 'Reduced to remaining authorized units (22)',
        })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.reducedRow);
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 28 → 22: remaining authorized units (22)');
    });

    test('the reduced shade is distinct from the void shade and the banner fills', () => {
        expect(COLORS.reducedRow).not.toBe(COLORS.voidRow);
        expect(COLORS.reducedRow).not.toBe(COLORS.authMet);
        expect(COLORS.reducedRow).not.toBe(COLORS.authShort);
        expect(COLORS.reducedRow).not.toBe(COLORS.totalGreen);
    });

    test('void wins over reduced when a row is both', () => {
        const m = buildExportModel(run([reduced({ voidFlag: true, voidReason: 'No authorized units remaining (void)' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.voidRow);
        expect(v.values[COL.VOID_REASON]).toBe('No authorized units remaining (void)');
    });

    test('a row paid in full is not shaded, even if it carries an unrelated reason', () => {
        const m = buildExportModel(run([visit({ unitsRaw: 28, finalPayableUnits: 28, voidReason: '' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
        expect(v.values[COL.VOID_REASON]).toBe('');
    });

    test('a reduced row shows its CLOCKED units and the total sums those', () => {
        const m = buildExportModel(run([
            visit({ id: 1, unitsRaw: 22, finalPayableUnits: 22, voidReason: '' }),
            reduced({ id: 2 }),  // 23 clocked, 6 paid
        ]), {});
        const rows = m.rows.filter((r) => r.kind === 'visit');
        expect(rows[1].values[COL.UNITS]).toBe(23);
        const total = firstWhere(m, (r) => r.kind === 'total');
        expect(total.values[COL.UNITS]).toBe(45);
    });

    test('a row whose clocked figure is missing is not flagged as reduced', () => {
        // Without a clocked figure there is no shortfall to report, and
        // inventing one would misstate what the caregiver worked.
        const m = buildExportModel(run([reduced({ unitsRaw: 0 })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
        expect(v.values[COL.VOID_REASON]).toBe('');
    });

    test('needs-review rows are not mistaken for reductions', () => {
        const m = buildExportModel(run([visit({
            needsReview: true, reviewReason: 'missingCallOut',
            unitsRaw: 0, finalPayableUnits: 0, voidReason: '',
        })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
    });
});

// ── Per-service breakdown ─────────────────────────────────
describe('each client block ends with a per-service clocked/payable breakdown', () => {
    const mixed = () => run([
        visit({ id: 1, serviceCode: 'PCS',   unitsRaw: 20, finalPayableUnits: 20, voidReason: '' }),
        visit({ id: 2, serviceCode: 'PCS',   unitsRaw: 21, finalPayableUnits: 0,
                voidReason: 'Daily cap of 28 units already reached (this client)' }),
        visit({ id: 3, serviceCode: 'S5130', unitsRaw: 30, finalPayableUnits: 30, voidReason: '' }),
    ]);

    test('a breakdown row is emitted per service code used by the client', () => {
        const m = buildExportModel(mixed(), {});
        const b = m.rows.filter((r) => r.kind === 'breakdown');
        expect(b).toHaveLength(2);
    });

    test('it states clocked and payable for that service', () => {
        const m = buildExportModel(mixed(), {});
        const pcs = m.rows.find((r) => r.kind === 'breakdown' && r.serviceCode === 'PCS');
        expect(pcs.values[COL.UNITS]).toBe(41);                       // 20 + 21 clocked
        expect(String(pcs.values[COL.VOID_REASON])).toContain('20');  // payable
        expect(String(pcs.values[COL.STATUS])).toContain('PCS');
    });

    test('a service with nothing reduced still reports both figures', () => {
        const m = buildExportModel(mixed(), {});
        const hm = m.rows.find((r) => r.kind === 'breakdown' && r.serviceCode === 'S5130');
        expect(hm.values[COL.UNITS]).toBe(30);
        expect(String(hm.values[COL.VOID_REASON])).toContain('30');
    });

    test('breakdown rows follow the Total row', () => {
        const m = buildExportModel(mixed(), {});
        const kinds = m.rows.map((r) => r.kind);
        expect(kinds.indexOf('breakdown')).toBeGreaterThan(kinds.indexOf('total'));
    });

    test('breakdown rows are ordered by the agency service order', () => {
        const m = buildExportModel(run([
            visit({ id: 1, serviceCode: 'SDPC', unitsRaw: 5, finalPayableUnits: 5, voidReason: '' }),
            visit({ id: 2, serviceCode: 'PCS',  unitsRaw: 5, finalPayableUnits: 5, voidReason: '' }),
        ]), {});
        const codes = m.rows.filter((r) => r.kind === 'breakdown').map((r) => r.serviceCode);
        expect(codes).toEqual(['PCS', 'SDPC']);
    });

    test('visits with no service code are grouped under a labelled bucket', () => {
        const m = buildExportModel(run([
            visit({ id: 1, serviceCode: '', unitsRaw: 9, finalPayableUnits: 9, voidReason: '' }),
        ]), {});
        const b = m.rows.filter((r) => r.kind === 'breakdown');
        expect(b).toHaveLength(1);
        expect(String(b[0].values[COL.STATUS])).toMatch(/no service|unspecified/i);
    });

    test('the clocked figures across breakdowns sum to the client Total', () => {
        const m = buildExportModel(mixed(), {});
        const total = firstWhere(m, (r) => r.kind === 'total');
        const sum = m.rows.filter((r) => r.kind === 'breakdown')
            .reduce((a, r) => a + r.values[COL.UNITS], 0);
        expect(sum).toBe(total.values[COL.UNITS]);
    });

    test('a service whose payable differs from clocked is visually flagged', () => {
        const m = buildExportModel(mixed(), {});
        const pcs = m.rows.find((r) => r.kind === 'breakdown' && r.serviceCode === 'PCS');
        const hm  = m.rows.find((r) => r.kind === 'breakdown' && r.serviceCode === 'S5130');
        expect(pcs.fonts[COL.VOID_REASON]).toMatchObject({ color: COLORS.annotationRed });
        expect(hm.fonts[COL.VOID_REASON]).not.toMatchObject({ color: COLORS.annotationRed });
    });

    test('a client with no visits produces no breakdown rows', () => {
        const m = buildExportModel(run([]), {});
        expect(m.rows.filter((r) => r.kind === 'breakdown')).toHaveLength(0);
    });
});

// ── Reductions detected arithmetically, not by reason text ─
describe('every row that lost units is flagged, whatever the stated reason', () => {
    const short = (over = {}) => visit({ voidFlag: false, needsReview: false, ...over });

    test('a single-visit cap with NO stored reason is still flagged', () => {
        // payrollService caps a >7hr visit at 28 units but does not persist a
        // reason, so reason-text matching missed these entirely.
        const m = buildExportModel(run([short({ unitsRaw: 33, finalPayableUnits: 28, voidReason: '' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.reducedRow);
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 33 → 28: capped at 28 units');
    });

    test('a late clock-out reduction is flagged', () => {
        const m = buildExportModel(run([short({ unitsRaw: 33, finalPayableUnits: 28, voidReason: 'Clock Out after 11:30 PM' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBe(COLORS.reducedRow);
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 33 → 28: Clock Out after 11:30 PM');
    });

    test('a next-day clock-out reduction is flagged', () => {
        const m = buildExportModel(run([short({ unitsRaw: 65, finalPayableUnits: 28, voidReason: 'Clock Out on next calendar day' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.values[COL.VOID_REASON]).toBe('Reduced 65 → 28: Clock Out on next calendar day');
    });

    test('a row paid in full is never flagged, even carrying a note', () => {
        const m = buildExportModel(run([short({ unitsRaw: 25, finalPayableUnits: 25, voidReason: 'Clock Out after 11:30 PM' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
        expect(v.values[COL.VOID_REASON]).toBe('');
    });

    test('a row paid MORE than clocked is not treated as reduced', () => {
        const m = buildExportModel(run([short({ unitsRaw: 10, finalPayableUnits: 12, voidReason: '' })]), {});
        const v = firstWhere(m, (r) => r.kind === 'visit');
        expect(v.fills[COL.CLIENT]).toBeNull();
    });
});

// ── PAYABLE line ──────────────────────────────────────────
describe('each client block ends with a PAYABLE total', () => {
    const block = () => run([
        visit({ id: 1, serviceCode: 'PCS', unitsRaw: 33, finalPayableUnits: 28, voidReason: '' }),
        visit({ id: 2, serviceCode: 'S5130', unitsRaw: 20, finalPayableUnits: 20, voidReason: '' }),
    ]);

    test('a payable row is emitted for the client', () => {
        const m = buildExportModel(block(), {});
        expect(m.rows.filter((r) => r.kind === 'payable')).toHaveLength(1);
    });

    test('it is labelled PAYABLE and carries the payable unit total', () => {
        const m = buildExportModel(block(), {});
        const p = firstWhere(m, (r) => r.kind === 'payable');
        expect(String(p.values[COL.OUT]) + String(p.values[COL.STATUS])).toMatch(/PAYABLE/);
        expect(p.values[COL.UNITS]).toBe(48);
    });

    test('it excludes void and needs-review rows', () => {
        const m = buildExportModel(run([
            visit({ id: 1, unitsRaw: 20, finalPayableUnits: 20, voidReason: '' }),
            visit({ id: 2, unitsRaw: 12, finalPayableUnits: 12, voidFlag: true, voidReason: 'No authorized units remaining (void)' }),
            visit({ id: 3, unitsRaw: 8, finalPayableUnits: 8, needsReview: true, reviewReason: 'missingCallOut' }),
        ]), {});
        const p = firstWhere(m, (r) => r.kind === 'payable');
        expect(p.values[COL.UNITS]).toBe(20);
    });

    test('it comes after the per-service breakdown', () => {
        const m = buildExportModel(block(), {});
        const kinds = m.rows.map((r) => r.kind);
        expect(kinds.lastIndexOf('payable')).toBeGreaterThan(kinds.lastIndexOf('breakdown'));
    });

    test('it is filled green like the Total so it reads as a figure that counts', () => {
        const m = buildExportModel(block(), {});
        const p = firstWhere(m, (r) => r.kind === 'payable');
        expect(p.fills[COL.UNITS]).toBe(COLORS.totalGreen);
    });

    test('the payable total equals the sum of the breakdown payable figures', () => {
        const m = buildExportModel(block(), {});
        const p = firstWhere(m, (r) => r.kind === 'payable');
        const sum = m.rows.filter((r) => r.kind === 'breakdown')
            .reduce((a, r) => a + (Number(String(r.values[COL.VOID_REASON]).match(/payable (\d+)/)?.[1]) || 0), 0);
        expect(p.values[COL.UNITS]).toBe(sum);
    });
});
