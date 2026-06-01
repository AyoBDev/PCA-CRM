function isOverdue(timesheet) {
    if (timesheet.status !== 'draft') return false;
    const weekStart = new Date(timesheet.weekStart);
    const saturday = new Date(weekStart);
    saturday.setUTCDate(saturday.getUTCDate() + 6);
    saturday.setUTCHours(23, 59, 59, 999);
    return new Date() > saturday;
}

module.exports = { isOverdue };
