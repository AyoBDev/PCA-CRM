function isOverdue(timesheet) {
    if (timesheet.status !== 'draft') return false;
    const weekStart = new Date(timesheet.weekStart);
    const saturday = new Date(weekStart);
    saturday.setUTCDate(saturday.getUTCDate() + 6);
    saturday.setUTCHours(23, 59, 59, 999);
    return new Date() > saturday;
}

function roundTo15(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    let rounded;
    if (m <= 7) rounded = 0;
    else if (m <= 22) rounded = 15;
    else if (m <= 37) rounded = 30;
    else if (m <= 52) rounded = 45;
    else { return `${String(h + 1).padStart(2, '0')}:00`; }
    return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const roundedIn = roundTo15(timeIn);
    const roundedOut = roundTo15(timeOut);
    const [hIn, mIn] = roundedIn.split(':').map(Number);
    const [hOut, mOut] = roundedOut.split(':').map(Number);
    const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function computeTotalHoursWithBlocks(timeIn, timeOut, timeBlocksJson) {
    let total = computeHours(timeIn, timeOut);
    try {
        const blocks = JSON.parse(timeBlocksJson || '[]');
        for (const b of blocks) total += computeHours(b.in, b.out);
    } catch {}
    return Math.round(total * 100) / 100;
}

function deriveTimesheetService(auth) {
    const code = auth.serviceCode;
    if (code === 'COPE' || code === 'PAS') {
        const name = (auth.serviceName || '').toLowerCase();
        if (name.includes('homemaker')) return 'Homemaker';
        if (name.includes('respite')) return 'Respite';
        if (name.includes('companion')) return 'Companion';
        return 'PAS';
    }
    if (code === 'PCS' || code === 'S5125' || code === 'TIMESHEET_PCS') return 'PAS';
    if (code === 'S5130' || code === 'S5120' || code === 'TIMESHEET_HOMEMAKER' || code === 'TIMESHEET_CHORE') return 'Homemaker';
    if (code === 'S5150' || code === 'TIMESHEET_RESPITE') return 'Respite';
    if (code === 'S5135' || code === 'TIMESHEET_COMPANION') return 'Companion';
    if (code === 'SDPC') return 'PAS';
    if (code === 'TIMESHEETS' || !code) {
        const name = (auth.serviceName || auth.serviceCategory || '').toLowerCase();
        if (name === 'pas' || name === 'pca' || (name.includes('personal') && name.includes('care'))) return 'PAS';
        if (name === 'hm' || name.includes('homemaker')) return 'Homemaker';
        if (name.includes('respite')) return 'Respite';
        if (name.includes('companion')) return 'Companion';
        if (name.includes('chore')) return 'Homemaker';
        return 'PAS';
    }
    return null;
}

const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Transfer', 'Eating/Feeding'];
const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding', 'Other'];
const RESPITE_ACTIVITIES = ['Companionship', 'Safety Supervision', 'Community Activities', 'Other Approved Respite Tasks'];
const COMPANION_ACTIVITIES = ['Companionship', 'Safety Supervision', 'Social Activities', 'Light Errands', 'Other'];

module.exports = {
    isOverdue,
    roundTo15,
    computeHours,
    computeTotalHoursWithBlocks,
    deriveTimesheetService,
    ADL_ACTIVITIES,
    IADL_ACTIVITIES,
    RESPITE_ACTIVITIES,
    COMPANION_ACTIVITIES,
};
