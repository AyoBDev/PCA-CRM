// Returns the calendar day before dateStr ('YYYY-MM-DD'), as 'YYYY-MM-DD'.
// Parsed at local midnight so the date does not shift across UTC boundaries.
function dayBefore(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

module.exports = { dayBefore };
