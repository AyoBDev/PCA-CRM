export function hhmm12(t) {
    if (!t || t === '00:00') return t;
    const [hh, mm] = t.split(':').map(Number);
    const period = hh < 12 ? 'AM' : 'PM';
    const h = hh % 12 || 12;
    return `${h}:${String(mm).padStart(2, '0')} ${period}`;
}
