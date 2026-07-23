// Candidate ranking — "who should work this shift?"
//
// Shared by two callers, deliberately owned by neither:
//   1. the callout replacement flow (strict mode) — eligible candidates only
//   2. normal shift creation (soft mode) — everyone, partitioned by eligibility
//
// THE CENTRAL RULE: availability outranks proximity. Distance is the weakest
// signal in this system. A caregiver 0.2 miles away who is already booked at
// that hour must never be shown above one who is free, or a scheduler skimming
// the list will double-book them. Eligible and ineligible candidates are
// therefore partitioned BEFORE any distance sorting, never blended.
//
// COST INVARIANT: this service reads cached coordinates and never geocodes.
// Calling geocodingService from here would put a metered API on the request
// path. Un-geocoded candidates are ranked last, never geocoded on demand.

const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');

// Compliance certifications that gate eligibility. The data model has no
// service-type qualification (certType holds compliance items like cpr/tb), so
// "can this person legally work?" is the honest filter available.
const REQUIRED_CERT_TYPES = ['cpr', 'tb', 'background_check'];

const WEIGHTS = {
    careTeam: 100,          // continuity of care — matters most to the client
    availabilityWindow: 40, // their stated working hours cover this shift
    proximity: 30,          // nearer is better, but never decisive on its own
    weeklyLoad: 20,         // spread work; a guard against overtime
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(time) {
    const [h, m] = String(time).split(':').map(Number);
    return h * 60 + m;
}

/**
 * Half-open interval overlap: a shift ending exactly when another starts is
 * adjacent, not overlapping. Mirrors schedulingService.timesOverlap.
 */
function timesOverlap(startA, endA, startB, endB) {
    let sA = toMinutes(startA), eA = toMinutes(endA);
    let sB = toMinutes(startB), eB = toMinutes(endB);
    if (eA <= sA) eA += 24 * 60;
    if (eB <= sB) eB += 24 * 60;
    return sA < eB && sB < eA;
}

function toDateKey(value) {
    if (!value) return '';
    return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
}

function getWeekBounds(dateStr) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start, end };
}

/**
 * Distances from the client to each employee, in miles, via PostGIS.
 * Returns a Map<employeeId, miles>. Employees without coordinates are simply
 * absent from the result rather than being given a fabricated distance.
 */
async function fetchDistances(client, employeeIds) {
    if (client.latitude == null || client.longitude == null) return new Map();
    if (employeeIds.length === 0) return new Map();

    const rows = await prisma.$queryRaw`
        SELECT id,
               ST_Distance(
                   location,
                   ST_SetSRID(ST_MakePoint(${client.longitude}, ${client.latitude}), 4326)::geography
               ) / 1609.344 AS "distanceMiles"
        FROM employees
        WHERE id IN (${Prisma.join(employeeIds)})
          AND location IS NOT NULL
    `;

    return new Map(rows.map(r => [Number(r.id), r.distanceMiles == null ? null : Number(r.distanceMiles)]));
}

/**
 * Rank employees for a shift.
 *
 * @param {object} request clientId, serviceCode, date, startTime, endTime, excludeEmployeeId
 * @param {object} [options] mode: 'strict'|'soft' (default 'strict'), limit (default 5)
 * @returns {Promise<{status: string, eligible: object[], ineligible: object[]}>}
 */
async function rankCandidates(request = {}, options = {}) {
    const { clientId, date, startTime, endTime, excludeEmployeeId } = request;
    const mode = options.mode || 'strict';
    const limit = options.limit ?? 5;

    const empty = { eligible: [], ineligible: [] };

    // Availability cannot be determined without a full time window. Ranking on
    // partial input would present a confident order built on facts not yet
    // established — worse than showing no ranking at all.
    if (!clientId || !date || !startTime || !endTime) {
        return { status: 'insufficient_input', ...empty };
    }

    const client = await prisma.client.findUnique({ where: { id: Number(clientId) } });
    if (!client) return { status: 'missing_client', ...empty };

    const employees = await prisma.employee.findMany({
        where: {
            active: true,
            archivedAt: null,
            ...(excludeEmployeeId ? { id: { not: Number(excludeEmployeeId) } } : {}),
        },
        include: { employeeAvailability: true },
    });
    if (employees.length === 0) return { status: 'ok', ...empty };

    const employeeIds = employees.map(e => e.id);
    const { start: weekStart, end: weekEnd } = getWeekBounds(date);
    const shiftDate = new Date(`${date}T00:00:00.000Z`);

    const [weekShifts, timeOff, careTeam, certifications, distances] = await Promise.all([
        prisma.shift.findMany({
            where: {
                employeeId: { in: employeeIds },
                archivedAt: null,
                shiftDate: { gte: weekStart, lte: weekEnd },
            },
        }),
        prisma.timeOffRequest.findMany({
            where: {
                employeeId: { in: employeeIds },
                status: 'approved',
                dateFrom: { lte: shiftDate },
                dateTo: { gte: shiftDate },
            },
        }),
        prisma.clientCareTeam.findMany({ where: { clientId: Number(clientId) } }),
        prisma.employeeCertification.findMany({
            where: { employeeId: { in: employeeIds }, certType: { in: REQUIRED_CERT_TYPES } },
        }),
        fetchDistances(client, employeeIds),
    ]);

    const careTeamIds = new Set(careTeam.map(m => m.employeeId));
    const timeOffIds = new Set(timeOff.map(t => t.employeeId));
    const targetDateKey = toDateKey(date);

    const expiredCertIds = new Set(
        certifications
            .filter(c => c.expirationDate && new Date(c.expirationDate) < shiftDate)
            .map(c => c.employeeId),
    );

    // Normalise proximity against the farthest known candidate. Padding the
    // denominator keeps the farthest real distance scoring strictly above zero,
    // so a known-but-distant candidate still outranks one with no location at
    // all (which scores zero for proximity).
    const knownDistances = [...distances.values()].filter(d => d != null);
    const maxDistance = knownDistances.length > 0
        ? Math.max(1, ...knownDistances) * 1.25
        : 1;

    const scored = employees.map((emp) => {
        const availability = emp.employeeAvailability;
        const conflicts = [];

        // --- hard filters ---
        const sameDayShifts = weekShifts.filter(s =>
            s.employeeId === emp.id
            && toDateKey(s.shiftDate) === targetDateKey
            && s.status !== 'cancelled',
        );
        if (sameDayShifts.some(s => timesOverlap(startTime, endTime, s.startTime, s.endTime))) {
            conflicts.push('already_scheduled');
        }
        if (timeOffIds.has(emp.id)) conflicts.push('time_off');
        if (expiredCertIds.has(emp.id)) conflicts.push('compliance_expired');

        const blackoutDates = Array.isArray(availability?.blackoutDates) ? availability.blackoutDates : [];
        if (blackoutDates.map(toDateKey).includes(targetDateKey)) conflicts.push('blackout_date');

        // Note: employeeAvailability.maxTravelDistance is NOT applied as a
        // mileage cap. Despite the column name it stores MINUTES (the
        // onboarding UI labels it "Max Travel Time"), so treating it as miles
        // would exclude the wrong people.

        // --- soft score ---
        const distanceMiles = distances.has(emp.id) ? distances.get(emp.id) : null;
        const notGeocoded = distanceMiles == null;

        const dayKey = DAY_KEYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
        const daySchedule = availability?.weeklySchedule?.[dayKey];
        const withinStatedHours = !!daySchedule?.available
            && toMinutes(daySchedule.start) <= toMinutes(startTime)
            && toMinutes(daySchedule.end) >= toMinutes(endTime);

        const weeklyHours = weekShifts
            .filter(s => s.employeeId === emp.id && s.status !== 'cancelled')
            .reduce((sum, s) => sum + (s.hours || 0), 0);

        const scoreBreakdown = {
            careTeam: careTeamIds.has(emp.id) ? WEIGHTS.careTeam : 0,
            availabilityWindow: withinStatedHours ? WEIGHTS.availabilityWindow : 0,
            // Un-geocoded candidates score zero for proximity, which sorts them
            // last among equals without ever marking them unavailable.
            proximity: notGeocoded ? 0 : WEIGHTS.proximity * (1 - Math.min(distanceMiles, maxDistance) / maxDistance),
            weeklyLoad: WEIGHTS.weeklyLoad * (1 - Math.min(weeklyHours, 40) / 40),
        };
        const score = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);

        return {
            employeeId: emp.id,
            employeeName: emp.name,
            // Included so the office can call or email a candidate directly.
            // Most callouts are handled by phone, and a ranked list is not much
            // use for that if the number has to be looked up elsewhere.
            phone: emp.phone || '',
            email: emp.email || '',
            distanceMiles,
            notGeocoded,
            onCareTeam: careTeamIds.has(emp.id),
            weeklyHours,
            conflicts,
            score,
            scoreBreakdown,
        };
    });

    const eligible = scored
        .filter(c => c.conflicts.length === 0)
        .sort((a, b) => b.score - a.score)
        .map((c, i) => ({ ...c, rank: i + 1 }));

    // Ineligible candidates are ordered by conflict reason, never by distance —
    // proximity must not resurface someone who cannot work the shift.
    const ineligible = scored
        .filter(c => c.conflicts.length > 0)
        .sort((a, b) => a.conflicts[0].localeCompare(b.conflicts[0]));

    if (mode === 'strict') {
        return { status: 'ok', eligible: eligible.slice(0, limit), ineligible: [] };
    }
    return { status: 'ok', eligible, ineligible };
}

module.exports = { rankCandidates, timesOverlap, REQUIRED_CERT_TYPES, WEIGHTS };
