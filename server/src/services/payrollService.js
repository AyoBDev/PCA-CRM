'use strict';

// ── Constants ──────────────────────────────────────────────
const CLIP_START     = 4 * 60 + 30;   // 04:30 — minimum allowed start
const CLIP_END       = 23 * 60 + 30;  // 23:30 — maximum allowed end
const OVERNIGHT_VOID = 1 * 60;        // 01:00 next-day void threshold
const MAX_UNITS      = 28;            // 7 hours × 4 units/hr — daily cap

// Service name → code.  ALL terms must appear (case-insensitive substring).
const SERVICE_CODE_RULES = [
    { terms: ['self', 'directed'],  code: 'SDPC'  },
    { terms: ['self', 'direct'],    code: 'SDPC'  },
    { terms: ['seniorcare', 'direct'], code: 'SDPC' },
    { terms: ['personal', 'care'],  code: 'PCS'   },
    { terms: ['homemaker'],         code: 'S5130' },
    { terms: ['attendant'],         code: 'S5125' },
    { terms: ['companion'],         code: 'S5135' },
    { terms: ['respite'],           code: 'S5150' },
];

// ── Time helpers ───────────────────────────────────────────

/**
 * Parse a time value to total minutes of day.
 * Handles:
 *   - string "10:00 AM" / "05:01 PM" / "14:30"
 *   - Excel fractional-day decimal  0.375 = 09:00
 *   - Excel combined datetime decimal  45922.375
 */
function parseTimeToMinutes(val) {
    if (val === null || val === undefined || val === '') return 0;

    // String time: "10:00 AM", "5:01 PM", "14:30", "07:01"
    if (typeof val === 'string') {
        const s = val.trim();
        if (!s) return 0;
        const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
        if (!m) return 0;
        let hours   = parseInt(m[1], 10);
        const mins  = parseInt(m[2], 10);
        const ampm  = m[4] ? m[4].toUpperCase() : null;
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours  = 0;
        return hours * 60 + mins;
    }

    // Numeric: Excel decimal (pure fraction or datetime serial)
    if (typeof val === 'number') {
        const frac = val - Math.floor(val);
        return Math.round(frac * 1440);
    }

    return 0;
}

/**
 * Parse a date value to a JS Date (UTC midnight).
 * Handles:
 *   - string "MM/DD/YYYY" or "YYYY-MM-DD"
 *   - Excel integer serial
 *   - JS Date object
 */
function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;

    if (typeof val === 'string') {
        const s = val.trim();
        // MM/DD/YYYY
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) return new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]));
        // YYYY-MM-DD
        const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (ymd) return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]));
        // Fallback
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }

    if (typeof val === 'number') {
        // Excel serial → UTC date
        const adjusted = val > 59 ? val - 1 : val;
        return new Date(Date.UTC(1899, 11, 30) + Math.floor(adjusted) * 86400000);
    }

    return null;
}

/**
 * Convert total minutes (may exceed 1440 for overnight) to "HH:MM" string.
 */
function minutesToHHMM(minutes) {
    const m  = ((minutes % 1440) + 1440) % 1440;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

/**
 * Map service name to service code.
 */
function mapServiceCode(serviceName) {
    if (!serviceName) return '';
    const lower = String(serviceName).toLowerCase();
    for (const rule of SERVICE_CODE_RULES) {
        if (rule.terms.every((t) => lower.includes(t))) return rule.code;
    }
    return '';
}

/**
 * Normalize a name for fuzzy matching — strip punctuation, lowercase, sort tokens.
 * "Smith, John" === "John Smith" === "SMITH JOHN"
 */
function normalizeName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

// ── Row filtering ──────────────────────────────────────────

/**
 * Returns true if this row should enter the processing pipeline.
 * Rows flagged needsReview are saved to the DB but excluded from unit calculation
 * until an admin fixes the missing fields.
 * Also skips totals, broken-data markers, and incomplete visits.
 */
function isProcessableRow(rawRow) {
    if (rawRow.needsReview)                return false;

    const client = String(rawRow.clientName   || '').trim();
    const status = String(rawRow.visitStatus  || '').trim().toLowerCase();

    if (client.toUpperCase() === 'TOTAL')  return false;
    if (/broken\s*data/i.test(client))     return false;
    if (status === 'incomplete')           return false;  // GAS skips incomplete

    return true;
}

// ── Row parsing ────────────────────────────────────────────

function parseRawRow(rawRow) {
    const visitStatus    = String(rawRow.visitStatus   || '').trim();
    const service        = String(rawRow.service       || '').trim();
    const visitDate      = parseDate(rawRow.visitDate);
    const callInMinutes  = parseTimeToMinutes(rawRow.callInRaw);
    const callOutMinutes = parseTimeToMinutes(rawRow.callOutRaw);

    return {
        clientName:        String(rawRow.clientName   || '').trim(),
        employeeName:      String(rawRow.employeeName || '').trim(),
        service,
        visitDate,
        visitStatus,
        callInRaw:         rawRow.callInRaw,
        callOutRaw:        rawRow.callOutRaw,
        callHoursRaw:      rawRow.callHoursRaw || '',
        unitsRaw:          parseInt(rawRow.unitsRaw) || 0,

        serviceCode:       mapServiceCode(service),
        callInMinutes,
        callOutMinutes,
        callInTime:        minutesToHHMM(callInMinutes),
        callOutTime:       minutesToHHMM(callOutMinutes),

        isIncomplete:      visitStatus.toLowerCase() === 'incomplete',
        voidFlag:          false,
        voidReason:        '',
        overlapId:         '',
        finalPayableUnits: 0,
        durationMinutes:   0,
    };
}

// ── Processing rules ───────────────────────────────────────

/**
 * Apply time-clipping and overnight-void rules. Mutates v in place.
 *
 * Order matches GAS:
 *   1. Detect overnight (callOut <= callIn) → add 1440
 *   2. Overnight ending past 01:00 next day → void
 *   3. Clip start to 04:30
 *   4. Clip end to 23:30 (same-day only)
 *   5. Compute durationMinutes
 */
function applyTimeRules(v) {
    let inM  = v.callInMinutes;
    let outM = v.callOutMinutes;

    // 1. Overnight detection
    if (outM <= inM) outM += 1440;

    // 2. Overnight void: ends after 01:00 next day
    if (outM >= 1440 && (outM % 1440) > OVERNIGHT_VOID) {
        v.voidFlag        = true;
        v.voidReason      = 'Overnight > 01:00 AM (void)';
        v.callInMinutes   = inM;
        v.callOutMinutes  = outM;
        v.callInTime      = minutesToHHMM(inM);
        v.callOutTime     = minutesToHHMM(outM % 1440);
        v.durationMinutes = 0;
        return;
    }

    // 3. Clip start
    if (inM < CLIP_START) inM = CLIP_START;

    // 4. Clip end (same-day only)
    if (outM < 1440 && outM > CLIP_END) outM = CLIP_END;

    v.callInMinutes   = inM;
    v.callOutMinutes  = outM;
    v.callInTime      = minutesToHHMM(inM);
    v.callOutTime     = minutesToHHMM(outM % 1440);
    v.durationMinutes = Math.max(0, outM - inM);
}

/**
 * Calculate payable units from duration.
 * Rounds to nearest 15-min block.
 * If the single visit exceeds MAX_UNITS, cap it at MAX_UNITS and record a note.
 * Never voids on its own — that is the daily-cap step's job.
 */
function calcUnits(durationMinutes) {
    const rounded = Math.round(durationMinutes / 15) * 15;
    const units   = rounded / 15;
    if (units > MAX_UNITS) {
        return { units: MAX_UNITS, voidFlag: false, voidReason: `Capped at ${MAX_UNITS} units (single visit > 7 hrs)` };
    }
    return { units, voidFlag: false, voidReason: '' };
}

/**
 * Detect overlapping visits for the same employee on the same day.
 * Same client  → void later row only.
 * Diff clients → void both rows.
 * Uses sliding active-window approach matching GAS.
 */
function detectOverlaps(visits) {
    const byEmployee = new Map();
    for (const v of visits) {
        if (v.voidFlag) continue;
        if (!byEmployee.has(v.employeeName)) byEmployee.set(v.employeeName, []);
        byEmployee.get(v.employeeName).push(v);
    }

    let overlapCounter = 0;

    for (const group of byEmployee.values()) {
        group.sort((a, b) => {
            const da = a.visitDate instanceof Date ? a.visitDate.getTime() : new Date(a.visitDate).getTime();
            const db = b.visitDate instanceof Date ? b.visitDate.getTime() : new Date(b.visitDate).getTime();
            if (da !== db) return da - db;
            return a.callInMinutes - b.callInMinutes;
        });

        const active = [];
        for (const cur of group) {
            // Prune visits that ended before current starts
            const still = active.filter((x) => x.callOutMinutes > cur.callInMinutes);

            for (const prev of still) {
                const dp = prev.visitDate instanceof Date ? prev.visitDate.toISOString().split('T')[0] : new Date(prev.visitDate).toISOString().split('T')[0];
                const dc = cur.visitDate  instanceof Date ? cur.visitDate.toISOString().split('T')[0]  : new Date(cur.visitDate).toISOString().split('T')[0];
                if (dp !== dc) continue;
                if (prev.voidFlag || cur.voidFlag) continue;

                const overlaps = prev.callInMinutes < cur.callOutMinutes && cur.callInMinutes < prev.callOutMinutes;
                if (!overlaps) continue;

                overlapCounter++;
                const oid = `O${overlapCounter}`;

                if (normalizeName(prev.clientName) === normalizeName(cur.clientName)) {
                    cur.voidFlag   = true;
                    cur.voidReason = 'Overlap: same employee same client (void later row)';
                    cur.overlapId  = oid;
                    prev.overlapId = oid;
                } else {
                    prev.voidFlag   = true;
                    prev.voidReason = 'Overlap: same employee different clients (void both)';
                    cur.voidFlag    = true;
                    cur.voidReason  = 'Overlap: same employee different clients (void both)';
                    prev.overlapId  = oid;
                    cur.overlapId   = oid;
                }
            }

            active.push(cur);
        }
    }

    return visits;
}

/**
 * Apply daily cap of 28 units per (employee, date).
 * Processes entries in call-in order (earliest first).
 * - Earlier entries keep their full units.
 * - The entry that pushes the total over 28 is reduced so the day totals exactly 28.
 * - Any entries after the cap is reached get 0 units (but are NOT voided —
 *   they remain visible with finalPayableUnits = 0 and a note explaining why).
 */
function applyDailyCap(visits) {
    const groups = new Map();
    for (const v of visits) {
        if (v.voidFlag) continue;
        const dateStr = v.visitDate instanceof Date
            ? v.visitDate.toISOString().split('T')[0]
            : new Date(v.visitDate).toISOString().split('T')[0];
        // Cap is per employee per day (across all clients they worked that day)
        const key = `${normalizeName(v.employeeName)}||${dateStr}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
    }

    for (const group of groups.values()) {
        group.sort((a, b) => a.callInMinutes - b.callInMinutes);
        let running = 0;
        for (const v of group) {
            if (running >= MAX_UNITS) {
                // Cap already full — this entry pays nothing but is not voided
                v.finalPayableUnits = 0;
                v.voidReason        = `Daily cap of ${MAX_UNITS} units already reached`;
                continue;
            }
            const remaining = MAX_UNITS - running;
            if (v.finalPayableUnits > remaining) {
                // This entry puts us over — reduce it to whatever remains
                v.finalPayableUnits = remaining;
                v.voidReason        = `Reduced to ${remaining}: daily cap of ${MAX_UNITS} units`;
                running             = MAX_UNITS;
            } else {
                running += v.finalPayableUnits;
            }
        }
    }
}

/**
 * Deduct finalPayableUnits against authorization balances from the DB.
 * No auth found    → mark isUnauthorized, keep payable (matches GAS continue).
 * Balance = 0      → void with "No authorized units remaining (void)".
 * Partial balance  → reduce, reason includes remaining count.
 */
function applyAuthCap(visits, clientsWithAuths) {
    const authMap = new Map();
    for (const client of clientsWithAuths) {
        const normClient = normalizeName(client.clientName);
        for (const auth of client.authorizations) {
            const key = `${normClient}||${auth.serviceCode}`;
            authMap.set(key, (authMap.get(key) || 0) + auth.authorizedUnits);
        }
    }

    const balanceMap = new Map(authMap);

    for (const v of visits) {
        if (v.voidFlag || !v.serviceCode) continue;

        // DB stores PCAs (employees) as clients — match against employeeName
        const key = `${normalizeName(v.employeeName)}||${v.serviceCode}`;

        if (!balanceMap.has(key)) {
            v.isUnauthorized = true;
            continue;
        }

        const balance = balanceMap.get(key);

        if (!isFinite(balance) || balance <= 0) {
            v.voidFlag          = true;
            v.voidReason        = 'No authorized units remaining (void)';
            v.isUnauthorized    = true;
            v.finalPayableUnits = 0;
        } else if (v.finalPayableUnits > balance) {
            v.voidReason        = `Reduced to remaining authorized units (${balance})`;
            v.finalPayableUnits = balance;
            balanceMap.set(key, 0);
        } else {
            balanceMap.set(key, balance - v.finalPayableUnits);
        }
    }
}

// ── Master pipeline ────────────────────────────────────────

function processPayrollRows(rawRows, clientsWithAuths) {
    // needsReview rows bypass the pipeline — saved as-is with zeroed computed fields
    const reviewRows = rawRows.filter((r) => !isProcessableRow(r)).map((r) => ({
        clientName:        String(r.clientName   || '').trim(),
        employeeName:      String(r.employeeName || '').trim(),
        service:           String(r.service      || '').trim(),
        visitDate:         r.visitDate || null,
        callInRaw:         r.callInRaw,
        callOutRaw:        r.callOutRaw,
        callHoursRaw:      r.callHoursRaw || 0,
        visitStatus:       String(r.visitStatus  || '').trim(),
        unitsRaw:          parseInt(r.unitsRaw) || 0,
        serviceCode:       '',
        callInTime:        '',
        callOutTime:       '',
        callInMinutes:     0,
        callOutMinutes:    0,
        durationMinutes:   0,
        finalPayableUnits: 0,
        voidFlag:          false,
        voidReason:        '',
        overlapId:         '',
        isIncomplete:      false,
        isUnauthorized:    false,
        needsReview:       r.needsReview  || false,
        reviewReason:      r.reviewReason || '',
    }));

    const visits = rawRows.filter(isProcessableRow).map(parseRawRow);

    visits.forEach(applyTimeRules);

    visits.forEach((v) => {
        if (v.voidFlag) return;
        const { units, voidFlag, voidReason } = calcUnits(v.durationMinutes);
        v.finalPayableUnits = units;
        if (voidFlag) {
            v.voidFlag          = true;
            v.voidReason        = voidReason;
            v.finalPayableUnits = 0;
        }
    });

    detectOverlaps(visits);
    applyDailyCap(visits);
    applyAuthCap(visits, clientsWithAuths);

    return [...visits, ...reviewRows];
}

module.exports = {
    processPayrollRows,
    parseTimeToMinutes,
    parseDate,
    minutesToHHMM,
    mapServiceCode,
    normalizeName,
    isProcessableRow,
    parseRawRow,
    applyTimeRules,
    calcUnits,
    detectOverlaps,
    applyDailyCap,
    applyAuthCap,
};
