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

export function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(d, t) {
    const date = formatDate(d);
    if (!t) return date;
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 || 12;
    return `${date} at ${hr12}:${m} ${ampm}`;
}

export function getSunday(date) {
    const d = date ? new Date(date + 'T00:00:00Z') : new Date();
    const day = d.getUTCDay();
    const sunday = new Date(d);
    sunday.setUTCDate(d.getUTCDate() - day);
    return sunday.toISOString().split('T')[0];
}

export function toLocalDateStr(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        if (d.includes('T')) return d.split('T')[0];
        return d;
    }
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
}
