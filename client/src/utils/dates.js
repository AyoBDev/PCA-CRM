export function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    // Use UTC components to avoid timezone shift (dates stored as UTC midnight)
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
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

export function formatWeek(dateStr) {
    const s = new Date(dateStr + 'T00:00:00');
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
}
