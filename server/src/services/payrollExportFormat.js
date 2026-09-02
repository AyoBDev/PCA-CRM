'use strict';

/**
 * Payroll export — agency Google-Sheet format.
 *
 * This module is the single source of truth for the SHAPE of the exported
 * payroll sheet. It is pure: it takes a payroll run + auth map and returns a
 * renderer-agnostic model (rows with values, fills and fonts). The controller
 * hands that model to ExcelJS.
 *
 * The format mirrors the sheet the agency builds by hand in Google Sheets:
 *
 *   row 1        header band (grey)
 *   row 2        pay-period label (grey)
 *   per client:  auth banner → visit rows → Total row → annotations → spacers
 *
 * Colors, widths and column order were taken from the agency's own workbook.
 */

const { normalizeName } = require('./payrollService');

// ── Layout constants (lifted from the agency workbook) ────
const SHEET_COLUMNS = [
    'Client', 'Employee Name', 'Services', 'Visit Date',
    'Call in', 'Call Out', 'Call Hours', 'Visit Status', 'Units',
];

// Column J sits beyond the agency's 9 printed columns and carries the reason a
// row was voided. It is intentionally outside SHEET_COLUMNS: the header band
// stops at Units, matching the hand-built sheet.
const VOID_REASON_WIDTH = 46;

const COLUMN_WIDTHS = [35.88, 59.88, 21.63, 13.38, 9.13, 11.13, 13.75, 14.25, 7.38, VOID_REASON_WIDTH];

const COLORS = {
    headerGrey:     'FF999999',
    authMet:        'FF00FF00',
    authShort:      'FFFF0000',
    totalGreen:     'FFB7E1CD',
    annotationRed:  'FFFF0000',
    // Void rows are washed a light red so they read as struck-out at a glance
    // without competing with the saturated red used for a short authorization.
    voidRow:        'FFF4CCCC',
    // Rows that were paid but capped — a lighter amber, so a partly-paid row is
    // visibly different from a fully-excluded (void) one.
    reducedRow:     'FFFCE5CD',
};

const NUM_FMT = {
    date:     'm/d/yy',
    time:     'h:mm am/pm',
    duration: '[hh]:mm',
};

// Number of blank rows between one client block and the next, matching the
// breathing room in the hand-built sheet.
const SPACER_ROWS = 4;

const COL = { CLIENT: 0, EMPLOYEE: 1, SERVICE: 2, DATE: 3, IN: 4, OUT: 5, HOURS: 6, STATUS: 7, UNITS: 8, VOID_REASON: 9 };

// Rows are one cell wider than the printed header so column J always exists.
const ROW_WIDTH = SHEET_COLUMNS.length + 1;

// Agency display order for service codes (same convention as the payroll UI).
const SERVICE_CODE_SORT_ORDER = { PCS: 0, S5130: 1, S5125: 2, S5150: 3, S5135: 4, SDPC: 5, S5120: 6 };

const UNKNOWN_CLIENT = '(Unknown Client)';

// Bucket for visits that carry no service code (EVV rows often arrive without one).
const NO_SERVICE_CODE = '(none)';

/** Sort index for a service code; unknown codes sort last. */
function serviceCodeSortIndex(code) {
    const key = String(code || '').toUpperCase().trim();
    return SERVICE_CODE_SORT_ORDER[key] ?? 50;
}

/** "HH:MM" → Excel day fraction (0–1). Blank/invalid → null. */
function excelTimeFromHHMM(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return (h * 60 + min) / 1440;
}

/** Duration in minutes → Excel day fraction. Zero/invalid → null. */
function excelDurationFromMinutes(minutes) {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 1440;
}

/** Format a Date as the MM/DD/YY used in the period label. */
function shortDate(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(dt.getUTCMonth() + 1)}/${p(dt.getUTCDate())}/${String(dt.getUTCFullYear()).slice(-2)}`;
}

/** "08/23/26-08/29/26" period label. */
function periodLabel(run) {
    const a = shortDate(run.periodStart);
    const b = shortDate(run.periodEnd);
    if (!a && !b) return '';
    return `${a}-${b}`;
}

/**
 * Derive the red annotations for a client block from what the system knows,
 * plus any note the reviewer typed on a visit. De-duplicated, stable order.
 */
function deriveAnnotations(visits) {
    const out = [];
    const seen = new Set();
    const add = (text) => {
        const t = String(text || '').trim();
        if (!t || seen.has(t)) return;
        seen.add(t);
        out.push(t);
    };

    for (const v of visits) {
        const reason = String(v.voidReason || '');
        if (/overnight/i.test(reason)) add(v.voidFlag ? 'OVERNIGHT VOID' : 'OVERNIGHT');
        if (/daily cap/i.test(reason)) add('CLOCK-IN DAILY LIMIT');
        if (/no authorized units|authorized units/i.test(reason)) add('OVER AUTHORIZED UNITS');
        if (v.needsReview) add('MISSING ON EVV');
        if (v.notes) add(String(v.notes).trim());
    }
    return out;
}

/**
 * Was this row paid less than it clocked?
 *
 * Detected ARITHMETICALLY (clocked > payable) rather than by matching the
 * stored reason text. payrollService does not persist a reason for every
 * reduction — a visit over 7 hours is capped at 28 units by calcUnits with its
 * reason discarded — so reason-matching silently missed those rows. In one real
 * run that was 60 rows losing 384 units with no marking at all.
 */
function isReducedRow(v) {
    if (v.voidFlag || v.needsReview) return false;
    const raw = Number(v.unitsRaw);
    const paid = Number(v.finalPayableUnits) || 0;
    return Number.isFinite(raw) && raw > paid;
}

/**
 * Restate a reduction as "Reduced <clocked> → <paid>: <cause>" so the sheet
 * keeps the figure the caregiver actually clocked alongside why it was cut.
 * Falls back to naming the single-visit cap when no reason was stored.
 */
function reductionText(v) {
    const reason = String(v.voidReason || '').trim();
    const raw = Number(v.unitsRaw);
    const paid = Number(v.finalPayableUnits) || 0;

    const cause = reason
        ? reason
            .replace(/^reduced to remaining authorized units/i, 'remaining authorized units')
            .replace(/^reduced to \d+:\s*/i, '')
        // No reason stored: this is calcUnits' single-visit ceiling.
        : `capped at ${paid} units`;

    return `Reduced ${raw} \u2192 ${paid}: ${cause}`;
}

/** Blank row template. */
const blankValues = () => new Array(ROW_WIDTH).fill('');
const blankMap    = () => new Array(ROW_WIDTH).fill(null);

function makeRow(kind, values, opts = {}) {
    return {
        kind,
        values,
        fills: opts.fills || blankMap(),
        fonts: opts.fonts || blankMap(),
        numFmts: opts.numFmts || blankMap(),
        alignments: opts.alignments || blankMap(),
        ...(opts.visitId !== undefined ? { visitId: opts.visitId } : {}),
        ...(opts.serviceCode !== undefined ? { serviceCode: opts.serviceCode } : {}),
    };
}

/**
 * Build the full export model for a payroll run.
 *
 * @param {Object} run      payroll run with `visits` included
 * @param {Object} authMap  normalizedClientName → { [serviceCode]: units, _records? }
 * @returns {{ columns, widths, rows }}
 */
function buildExportModel(run, authMap = {}) {
    const rows = [];

    // ── Row 1: header band ────────────────────────────────
    const headerValues = blankValues();
    SHEET_COLUMNS.forEach((label, i) => { headerValues[i] = label; });
    const headerFills = blankMap();
    const headerFonts = blankMap();
    SHEET_COLUMNS.forEach((_, i) => {
        headerFills[i] = COLORS.headerGrey;
        headerFonts[i] = { bold: true, size: 15 };
    });
    rows.push(makeRow('header', headerValues, { fills: headerFills, fonts: headerFonts }));

    // ── Row 2: pay-period label ───────────────────────────
    const period = blankValues();
    period[COL.CLIENT] = periodLabel(run);
    const periodFills = blankMap();
    const periodFonts = blankMap();
    SHEET_COLUMNS.forEach((_, i) => {
        periodFills[i] = COLORS.headerGrey;
        periodFonts[i] = { bold: true, size: 18 };
    });
    rows.push(makeRow('period', period, { fills: periodFills, fonts: periodFonts }));

    // ── Group visits by client (skip merged-away EVV rows) ─
    const groups = new Map();
    for (const v of run.visits || []) {
        if (v.mergedInto != null) continue;
        const name = (v.clientName || '').trim() || UNKNOWN_CLIENT;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(v);
    }

    // Alphabetical, with the unknown bucket last.
    const clientNames = [...groups.keys()].sort((a, b) => {
        if (a === UNKNOWN_CLIENT) return 1;
        if (b === UNKNOWN_CLIENT) return -1;
        return a.localeCompare(b);
    });

    for (const clientName of clientNames) {
        const visits = groups.get(clientName).slice().sort((a, b) => {
            const s = serviceCodeSortIndex(a.serviceCode) - serviceCodeSortIndex(b.serviceCode);
            if (s !== 0) return s;
            const da = a.visitDate ? new Date(a.visitDate).getTime() : 0;
            const db = b.visitDate ? new Date(b.visitDate).getTime() : 0;
            if (da !== db) return da - db;
            return String(a.callInTime || '').localeCompare(String(b.callInTime || ''));
        });

        // ── Auth banner ───────────────────────────────────
        const auth = authMap[normalizeName(clientName)] || {};
        const codes = Object.keys(auth)
            .filter((k) => k !== '_records' && Number(auth[k]) > 0)
            .sort((a, b) => serviceCodeSortIndex(a) - serviceCodeSortIndex(b));

        if (codes.length > 0) {
            // Reported units per code — everything that actually counted.
            const reported = {};
            for (const v of visits) {
                if (v.voidFlag || v.needsReview) continue;
                const code = String(v.serviceCode || '').toUpperCase().trim();
                if (!code) continue;
                reported[code] = (reported[code] || 0) + (v.finalPayableUnits || 0);
            }

            const values = blankValues();
            const fills  = blankMap();
            const fonts  = blankMap();
            const alignments = blankMap();

            // Right-aligned, occupying the columns immediately left of Units.
            const startCol = Math.max(0, COL.UNITS - codes.length);
            codes.forEach((code, i) => {
                const col = startCol + i;
                values[col] = `${code} ${auth[code]}`;
                fills[col]  = (reported[code] || 0) >= Number(auth[code]) ? COLORS.authMet : COLORS.authShort;
                fonts[col]  = { bold: true, size: 15 };
                alignments[col] = { horizontal: 'right' };
            });
            rows.push(makeRow('banner', values, { fills, fonts, alignments }));
        }

        // ── Visit rows ────────────────────────────────────
        for (const v of visits) {
            const values = blankValues();
            const numFmts = blankMap();

            values[COL.CLIENT]   = v.clientName || clientName;
            values[COL.EMPLOYEE] = v.employeeName || '';
            values[COL.SERVICE]  = v.service || '';

            const d = v.visitDate ? new Date(v.visitDate) : null;
            if (d && !isNaN(d.getTime())) {
                values[COL.DATE] = d;
                numFmts[COL.DATE] = NUM_FMT.date;
            } else {
                values[COL.DATE] = '';
            }

            const tin  = excelTimeFromHHMM(v.callInTime);
            const tout = excelTimeFromHHMM(v.callOutTime);
            if (tin !== null)  { values[COL.IN]  = tin;  numFmts[COL.IN]  = NUM_FMT.time; }
            if (tout !== null) { values[COL.OUT] = tout; numFmts[COL.OUT] = NUM_FMT.time; }

            // Call Hours: prefer the stored duration; otherwise derive Out − In
            // (matching how the hand-built sheet computes the column).
            let dur = excelDurationFromMinutes(v.durationMinutes);
            if (dur === null && tin !== null && tout !== null) {
                const span = tout >= tin ? tout - tin : (1 - tin) + tout; // wrap past midnight
                dur = span > 0 ? span : null;
            }
            if (dur !== null) { values[COL.HOURS] = dur; numFmts[COL.HOURS] = NUM_FMT.duration; }

            values[COL.STATUS] = v.visitStatus || '';
            // Column I carries the units the caregiver actually CLOCKED, so the
            // sheet never silently shrinks a visit. What is payable after caps
            // is stated in column J and summarised per service below the Total.
            values[COL.UNITS]  = Number(v.unitsRaw) || 0;

            // A voided row is washed across the printed columns and states why
            // in column J, so a reviewer can see the exclusion and its cause
            // without cross-referencing anything.
            const fills = blankMap();
            const fonts = blankMap();
            if (v.voidFlag) {
                for (let i = 0; i < SHEET_COLUMNS.length; i++) fills[i] = COLORS.voidRow;
                values[COL.VOID_REASON] = String(v.voidReason || '').trim();
                fonts[COL.VOID_REASON] = { color: COLORS.annotationRed };
            } else if (isReducedRow(v)) {
                for (let i = 0; i < SHEET_COLUMNS.length; i++) fills[i] = COLORS.reducedRow;
                values[COL.VOID_REASON] = reductionText(v);
                fonts[COL.VOID_REASON] = { color: COLORS.annotationRed };
            }

            rows.push(makeRow('visit', values, { fills, fonts, numFmts, visitId: v.id }));
        }

        // ── Total row ─────────────────────────────────────
        // The Total adds up the column above it — clocked units — so the sheet
        // reconciles visually. The payable figure per service is broken out
        // immediately below.
        const total = visits.reduce((sum, v) => sum + (Number(v.unitsRaw) || 0), 0);

        const tValues = blankValues();
        tValues[COL.OUT]   = 'Total';
        tValues[COL.UNITS] = total;
        const tFills = blankMap();
        tFills[COL.UNITS] = COLORS.totalGreen;
        const tAlign = blankMap();
        tAlign[COL.UNITS] = { horizontal: 'right' };
        rows.push(makeRow('total', tValues, { fills: tFills, alignments: tAlign }));

        // ── Per-service clocked vs payable breakdown ──────
        // A client's units are capped per service, so one blended total hides
        // where the reduction landed. One row per service code states both.
        const byService = new Map();
        for (const v of visits) {
            const code = String(v.serviceCode || '').toUpperCase().trim() || NO_SERVICE_CODE;
            if (!byService.has(code)) byService.set(code, { clocked: 0, payable: 0 });
            const acc = byService.get(code);
            acc.clocked += Number(v.unitsRaw) || 0;
            acc.payable += (v.voidFlag || v.needsReview) ? 0 : (Number(v.finalPayableUnits) || 0);
        }

        const serviceCodes = [...byService.keys()].sort(
            (a, b) => serviceCodeSortIndex(a) - serviceCodeSortIndex(b)
        );

        for (const code of serviceCodes) {
            const { clocked, payable } = byService.get(code);
            const values = blankValues();
            const fonts  = blankMap();
            const alignments = blankMap();

            values[COL.STATUS] = code === NO_SERVICE_CODE ? 'No service code' : code;
            values[COL.UNITS]  = clocked;
            values[COL.VOID_REASON] = clocked === payable
                ? `payable ${payable}`
                : `payable ${payable} (−${clocked - payable} capped)`;

            fonts[COL.STATUS] = { bold: true };
            fonts[COL.UNITS]  = { bold: true };
            // Flag the services where the payable figure diverges from clocked.
            fonts[COL.VOID_REASON] = clocked === payable
                ? { bold: true }
                : { bold: true, color: COLORS.annotationRed };
            alignments[COL.UNITS] = { horizontal: 'right' };

            rows.push(makeRow('breakdown', values, { fonts, alignments, serviceCode: code }));
        }

        // ── PAYABLE line ─────────────────────────────────
        // The Total above sums CLOCKED units, which is not what the agency
        // pays. State the payable figure explicitly so the block cannot be
        // misread as an amount owed.
        const payable = visits
            .filter((v) => !v.voidFlag && !v.needsReview)
            .reduce((sum, v) => sum + (Number(v.finalPayableUnits) || 0), 0);

        const pValues = blankValues();
        pValues[COL.STATUS] = 'PAYABLE';
        pValues[COL.UNITS]  = payable;
        const pFills = blankMap();
        pFills[COL.UNITS] = COLORS.totalGreen;
        const pFonts = blankMap();
        pFonts[COL.STATUS] = { bold: true };
        pFonts[COL.UNITS]  = { bold: true };
        const pAlign = blankMap();
        pAlign[COL.UNITS] = { horizontal: 'right' };
        rows.push(makeRow('payable', pValues, { fills: pFills, fonts: pFonts, alignments: pAlign }));

        // ── Annotations (red, in the spacer area) ─────────
        const notes = deriveAnnotations(visits);
        for (const note of notes) {
            const values = blankValues();
            values[COL.STATUS] = note;
            const fonts = blankMap();
            fonts[COL.STATUS] = { color: COLORS.annotationRed, bold: true };
            rows.push(makeRow('annotation', values, { fonts }));
        }

        // ── Spacers before the next client ────────────────
        for (let i = 0; i < SPACER_ROWS; i++) rows.push(makeRow('spacer', blankValues()));
    }

    return { columns: SHEET_COLUMNS.slice(), widths: COLUMN_WIDTHS.slice(), rows };
}

module.exports = {
    SHEET_COLUMNS,
    COLUMN_WIDTHS,
    ROW_WIDTH,
    COLORS,
    NUM_FMT,
    SPACER_ROWS,
    COL,
    buildExportModel,
    excelTimeFromHHMM,
    excelDurationFromMinutes,
    serviceCodeSortIndex,
    periodLabel,
    deriveAnnotations,
    isReducedRow,
    reductionText,
};
