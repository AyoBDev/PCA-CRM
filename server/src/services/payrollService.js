'use strict';

// ── Constants ──────────────────────────────────────────────
const SERVICE_CODE_MAP = {
    'self direct': 'SDPC',
    'personal care': 'PCS',
    'homemaker': 'S5130',
    'attendant': 'S5125',
    'companion': 'S5135',
    'respite unskilled': 'S5150',
};

const CLIP_START    = 4 * 60 + 30;   // 04:30 in minutes
const CLIP_END      = 23 * 60 + 30;  // 23:30 in minutes
const OVERNIGHT_VOID = 60;           // 01:00 next day in minutes
const MAX_UNITS     = 28;            // 7 hours × 4 units/hr

// ── Time helpers ───────────────────────────────────────────

/**
 * Convert Excel integer serial number to JS Date (UTC midnight).
 */
function excelSerialToDate(serial) {
    // Excel epoch: Dec 30, 1899 UTC
    const MS_PER_DAY = 86400000;
    // Excel incorrectly treats 1900 as a leap year; adjust for serials > 59
    const adjusted = serial > 59 ? serial - 1 : serial;
    return new Date(Date.UTC(1899, 11, 30) + adjusted * MS_PER_DAY);
}

/**
 * Convert Excel fractional day decimal to total minutes of day.
 * e.g. 0.396 → 570 (09:30)
 */
function excelDecimalToMinutes(decimal) {
    return Math.round(decimal * 1440); // 1440 = 24 * 60
}

/**
 * Convert total minutes to "HH:MM" string.
 */
function minutesToHHMM(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440; // normalise to 0–1439
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

/**
 * Map service name string to service code.
 * Case-insensitive substring match.
 */
function mapServiceCode(serviceName) {
    if (!serviceName) return '';
    const lower = String(serviceName).toLowerCase();
    for (const [key, code] of Object.entries(SERVICE_CODE_MAP)) {
        if (lower.includes(key)) return code;
    }
    return '';
}

// ── Row parsing ────────────────────────────────────────────

/**
 * Convert a raw XLSX row object (with named keys from header mapping) into
 * a working visit record with computed fields.
 */
function parseRawRow(rawRow) {
    const visitStatus = String(rawRow.visitStatus || '').trim();
    const callInRaw   = Number(rawRow.callInRaw)   || 0;
    const callOutRaw  = Number(rawRow.callOutRaw)  || 0;
    const service     = String(rawRow.service      || '').trim();

    // visitDate: if it's an Excel serial integer, convert; if already a Date, use it
    let visitDate;
    const rawDate = rawRow.visitDate;
    if (rawDate instanceof Date) {
        visitDate = rawDate;
    } else if (typeof rawDate === 'number') {
        visitDate = excelSerialToDate(Math.floor(rawDate));
    } else {
        visitDate = new Date(rawDate);
    }

    const callInMinutes  = excelDecimalToMinutes(callInRaw  - Math.floor(callInRaw));
    const callOutMinutes = excelDecimalToMinutes(callOutRaw - Math.floor(callOutRaw));

    return {
        clientName:      String(rawRow.clientName    || '').trim(),
        employeeName:    String(rawRow.employeeName  || '').trim(),
        service,
        visitDate,
        visitStatus,
        callInRaw,
        callOutRaw,
        callHoursRaw:    Number(rawRow.callHoursRaw) || 0,
        unitsRaw:        parseInt(rawRow.unitsRaw)   || 0,

        serviceCode:     mapServiceCode(service),
        callInMinutes,
        callOutMinutes,
        callInTime:      minutesToHHMM(callInMinutes),
        callOutTime:     minutesToHHMM(callOutMinutes),

        isIncomplete:    visitStatus.toLowerCase() === 'incomplete',
        voidFlag:        false,
        voidReason:      '',
        overlapId:       '',
        finalPayableUnits: 0,
        durationMinutes: 0,
    };
}

// ── Processing rules ───────────────────────────────────────

/**
 * Apply time-clipping and overnight rules to a visit. Mutates in place.
 */
function applyTimeRules(v) {
    let inM  = v.callInMinutes;
    let outM = v.callOutMinutes;

    // 1. Clip early start
    if (inM < CLIP_START) inM = CLIP_START;

    // 2. Handle overnight (callOut before callIn after clipping)
    if (outM < inM) outM += 1440;

    // 3. Overnight visit that extends past 01:00 next day → void
    if (outM >= 1440 && (outM % 1440) > OVERNIGHT_VOID) {
        v.voidFlag   = true;
        v.voidReason = 'Overnight past 01:00';
        v.callInMinutes  = inM;
        v.callOutMinutes = outM;
        v.callInTime  = minutesToHHMM(inM);
        v.callOutTime = minutesToHHMM(outM % 1440);
        v.durationMinutes = 0;
        return;
    }

    // 4. Clip late end (same-day only)
    if (outM < 1440 && outM > CLIP_END) outM = CLIP_END;

    v.callInMinutes  = inM;
    v.callOutMinutes = outM;
    v.callInTime  = minutesToHHMM(inM);
    v.callOutTime = minutesToHHMM(outM % 1440);
    v.durationMinutes = outM - inM;
}

/**
 * Calculate payable units from duration. Returns { units, voidFlag, voidReason }.
 */
function calcUnits(durationMinutes) {
    const rounded = Math.round(durationMinutes / 15) * 15;
    const units   = rounded / 15;
    if (units > MAX_UNITS) {
        return { units: 0, voidFlag: true, voidReason: 'Over 16 hours' };
    }
    return { units, voidFlag: false, voidReason: '' };
}

/**
 * Detect overlapping visits for the same employee and void appropriately.
 * Mutates visits array in place.
 */
function detectOverlaps(visits) {
    // Group non-voided visits by employee
    const byEmployee = new Map();
    for (const v of visits) {
        if (v.voidFlag) continue;
        const key = v.employeeName;
        if (!byEmployee.has(key)) byEmployee.set(key, []);
        byEmployee.get(key).push(v);
    }

    let overlapCounter = 0;

    for (const group of byEmployee.values()) {
        // Sort by call-in time within each day
        group.sort((a, b) => {
            const da = a.visitDate instanceof Date ? a.visitDate.getTime() : new Date(a.visitDate).getTime();
            const db = b.visitDate instanceof Date ? b.visitDate.getTime() : new Date(b.visitDate).getTime();
            if (da !== db) return da - db;
            return a.callInMinutes - b.callInMinutes;
        });

        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];

                // Only compare same day
                const da = a.visitDate instanceof Date ? a.visitDate.toDateString() : new Date(a.visitDate).toDateString();
                const db = b.visitDate instanceof Date ? b.visitDate.toDateString() : new Date(b.visitDate).toDateString();
                if (da !== db) continue;

                // Skip already voided
                if (a.voidFlag || b.voidFlag) continue;

                // Overlap check (in minutes, accounting for overnight)
                const aIn  = a.callInMinutes;
                const aOut = a.callOutMinutes;
                const bIn  = b.callInMinutes;
                const bOut = b.callOutMinutes;

                const overlaps = aIn < bOut && bIn < aOut;
                if (!overlaps) continue;

                overlapCounter++;
                const oid = `O${overlapCounter}`;

                if (a.clientName === b.clientName) {
                    // Same client: void the later one
                    b.voidFlag   = true;
                    b.voidReason = 'Overlap: same employee same client';
                    b.overlapId  = oid;
                    a.overlapId  = oid;
                } else {
                    // Different clients: void both
                    a.voidFlag   = true;
                    a.voidReason = 'Overlap: same employee different clients';
                    b.voidFlag   = true;
                    b.voidReason = 'Overlap: same employee different clients';
                    a.overlapId  = oid;
                    b.overlapId  = oid;
                }
            }
        }
    }

    return visits;
}

/**
 * Apply daily cap of MAX_UNITS per (clientName, employeeName, date).
 * Mutates visits in place.
 */
function applyDailyCap(visits) {
    // Group by client + employee + date
    const groups = new Map();
    for (const v of visits) {
        if (v.voidFlag) continue;
        const dateStr = v.visitDate instanceof Date
            ? v.visitDate.toISOString().split('T')[0]
            : new Date(v.visitDate).toISOString().split('T')[0];
        const key = `${v.clientName}||${v.employeeName}||${dateStr}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
    }

    for (const group of groups.values()) {
        group.sort((a, b) => a.callInMinutes - b.callInMinutes);
        let running = 0;
        for (const v of group) {
            if (running >= MAX_UNITS) {
                v.voidFlag   = true;
                v.voidReason = 'Daily cap reached';
                v.finalPayableUnits = 0;
                continue;
            }
            const remaining = MAX_UNITS - running;
            if (v.finalPayableUnits > remaining) {
                v.voidReason        = 'Daily cap exceeded (reduced)';
                v.finalPayableUnits = remaining;
                running = MAX_UNITS;
            } else {
                running += v.finalPayableUnits;
            }
        }
    }
}

/**
 * Normalize a client name for fuzzy matching (sort tokens alphabetically).
 */
function normalizeName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .sort()
        .join(' ');
}

/**
 * Apply authorization balance deduction. Voids visits that exceed auth balance.
 * Mutates visits in place.
 *
 * @param {Array} visits
 * @param {Array} clientsWithAuths - result of prisma.client.findMany({ include: { authorizations: true } })
 */
function applyAuthCap(visits, clientsWithAuths) {
    // Build auth map: normClient||serviceCode → total authorized units
    const authMap = new Map();
    for (const client of clientsWithAuths) {
        const normClient = normalizeName(client.clientName);
        for (const auth of client.authorizations) {
            const key = `${normClient}||${auth.serviceCode}`;
            const current = authMap.get(key) || 0;
            authMap.set(key, current + auth.authorizedUnits);
        }
    }

    // Balance map starts equal to auth map
    const balanceMap = new Map(authMap);

    for (const v of visits) {
        if (v.voidFlag || !v.serviceCode) continue;
        const normClient = normalizeName(v.clientName);
        const key = `${normClient}||${v.serviceCode}`;

        if (!balanceMap.has(key)) {
            // No authorization found — mark as unauthorized but don't void
            v.isUnauthorized = true;
            continue;
        }

        const balance = balanceMap.get(key);
        if (balance <= 0) {
            v.voidFlag       = true;
            v.voidReason     = 'Auth balance exhausted';
            v.isUnauthorized = true;
            v.finalPayableUnits = 0;
        } else if (v.finalPayableUnits > balance) {
            v.finalPayableUnits = balance;
            v.voidReason        = 'Auth balance partially exhausted';
            balanceMap.set(key, 0);
        } else {
            balanceMap.set(key, balance - v.finalPayableUnits);
        }
    }
}

// ── Master function ────────────────────────────────────────

/**
 * Process raw XLSX rows through the full payroll pipeline.
 *
 * @param {Array} rawRows
 * @param {Array} clientsWithAuths
 * @returns {Array} processed visit objects ready for DB insert
 */
function processPayrollRows(rawRows, clientsWithAuths) {
    const visits = rawRows.map(parseRawRow);

    // Apply time rules to all visits
    visits.forEach(applyTimeRules);

    // Calc units for non-voided visits
    visits.forEach((v) => {
        if (!v.voidFlag) {
            const { units, voidFlag, voidReason } = calcUnits(v.durationMinutes);
            v.finalPayableUnits = units;
            if (voidFlag) {
                v.voidFlag   = true;
                v.voidReason = voidReason;
                v.finalPayableUnits = 0;
            }
        }
    });

    detectOverlaps(visits);
    applyDailyCap(visits);
    applyAuthCap(visits, clientsWithAuths);

    return visits;
}

module.exports = {
    processPayrollRows,
    excelSerialToDate,
    excelDecimalToMinutes,
    minutesToHHMM,
    mapServiceCode,
    parseRawRow,
    applyTimeRules,
    calcUnits,
    detectOverlaps,
    applyDailyCap,
    applyAuthCap,
};
