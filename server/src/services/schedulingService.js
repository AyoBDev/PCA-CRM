// Service color map for shift display
const SERVICE_COLOR_MAP = {
    PCS:   { color: '#3B82F6', label: 'PCA',             bg: '#EFF6FF' },
    S5125: { color: '#22C55E', label: 'Attendant Care',  bg: '#F0FDF4' },
    S5130: { color: '#8B5CF6', label: 'Homemaker',       bg: '#F5F3FF' },
    SDPC:  { color: '#F59E0B', label: 'SDPC',            bg: '#FFFBEB' },
    S5135: { color: '#EC4899', label: 'Companion',       bg: '#FDF2F8' },
    S5150: { color: '#06B6D4', label: 'Respite',         bg: '#ECFEFF' },
};

/**
 * Compute hours and units from start/end time strings (HH:MM).
 * Units = hours * 4, rounded to nearest integer.
 */
function computeShiftHours(startTime, endTime) {
    if (!startTime || !endTime) return { hours: 0, units: 0 };
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    // If end is before start, assume next day
    if (endMin <= startMin) endMin += 24 * 60;
    const diffMin = endMin - startMin;
    const hours = Math.round((diffMin / 60) * 100) / 100; // 2 decimal places
    const units = Math.round(hours * 4);
    return { hours, units };
}

/**
 * Detect overlapping shifts for the same employee on the same date.
 * Returns array of { shiftA: id, shiftB: id, employeeName, date }.
 */
/**
 * Get display name for an employee from a shift record.
 * Prefers linked user name, falls back to employeeName field.
 */
function getEmployeeDisplayName(shift) {
    return shift.employee?.name || shift.employeeName || '';
}

/**
 * Detect overlapping shifts for the same employee on the same date.
 * Groups by employeeId (if linked) or employeeName (if free-text).
 * Returns array of { shiftA: id, shiftB: id, employeeName, date }.
 */
function detectOverlaps(shifts) {
    const overlaps = [];
    const groups = {};
    for (const s of shifts) {
        // Group by employeeId if present, otherwise by normalized employeeName
        const empKey = s.employeeId ? `id_${s.employeeId}` : `name_${(s.employeeName || '').toLowerCase().trim()}`;
        if (!empKey || empKey === 'name_') continue; // skip if no employee info
        const key = `${empKey}_${new Date(s.shiftDate).toISOString().slice(0, 10)}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    }
    for (const key of Object.keys(groups)) {
        const group = groups[key];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];
                if (a.status === 'cancelled' || b.status === 'cancelled') continue;
                if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
                    overlaps.push({
                        shiftA: a.id,
                        shiftB: b.id,
                        employeeName: getEmployeeDisplayName(a),
                        date: new Date(a.shiftDate).toISOString().slice(0, 10),
                    });
                }
            }
        }
    }
    return overlaps;
}

function timesOverlap(startA, endA, startB, endB) {
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let sA = toMin(startA), eA = toMin(endA);
    let sB = toMin(startB), eB = toMin(endB);
    if (eA <= sA) eA += 24 * 60;
    if (eB <= sB) eB += 24 * 60;
    return sA < eB && sB < eA;
}

/**
 * Compute unit summary: per service code, how many authorized vs scheduled.
 * authorizations: array of { serviceCode, authorizedUnits }
 * shifts: array of shifts for one client
 */
function computeUnitSummary(shifts, authorizations) {
    const summary = {};
    for (const auth of authorizations) {
        const code = auth.serviceCode;
        if (!summary[code]) summary[code] = { authorized: 0, scheduled: 0, remaining: 0 };
        summary[code].authorized += auth.authorizedUnits || 0;
    }
    for (const s of shifts) {
        if (s.status === 'cancelled') continue;
        const code = s.serviceCode;
        if (!summary[code]) summary[code] = { authorized: 0, scheduled: 0, remaining: 0 };
        summary[code].scheduled += s.units || 0;
    }
    for (const code of Object.keys(summary)) {
        summary[code].remaining = summary[code].authorized - summary[code].scheduled;
    }
    return summary;
}

/**
 * Get week range (Sunday to Saturday) from a date string.
 */
function getWeekRange(dateStr) {
    // Use UTC to avoid timezone shifts that move the date by a day
    const d = dateStr ? new Date(dateStr + 'T00:00:00.000Z') : new Date();
    const day = d.getUTCDay(); // 0=Sun
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - day);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    return {
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
    };
}

/**
 * Enrich a shift with display fields (color info).
 */
function enrichShift(shift) {
    const colorInfo = SERVICE_COLOR_MAP[shift.serviceCode] || { color: '#6B7280', label: shift.serviceCode, bg: '#F3F4F6' };
    return {
        ...shift,
        serviceColor: colorInfo.color,
        serviceBg: colorInfo.bg,
        serviceLabel: colorInfo.label,
        displayEmployeeName: shift.employee?.name || shift.employeeName || '',
    };
}

module.exports = {
    SERVICE_COLOR_MAP,
    computeShiftHours,
    detectOverlaps,
    getEmployeeDisplayName,
    computeUnitSummary,
    getWeekRange,
    enrichShift,
};
