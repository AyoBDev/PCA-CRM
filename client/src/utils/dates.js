export function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric', month: 'numeric', day: 'numeric',
    });
}

export function daysClass(days) {
    if (days === null || days === undefined) return 'days-cell--positive';
    if (days < 0) return 'days-cell--expired';
    if (days <= 60) return 'days-cell--warning';
    return 'days-cell--positive';
}

export function getWeekRange(dateStr) {
    const d = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
    const day = d.getUTCDay();
    const sunday = new Date(d);
    sunday.setUTCDate(d.getUTCDate() - day);
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    return {
        weekStart: sunday.toISOString().split('T')[0],
        weekEnd: saturday.toISOString().split('T')[0],
    };
}
