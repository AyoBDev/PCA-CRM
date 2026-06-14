export function hhmm12(t) {
    if (!t || t === '00:00') return t;
    const [hh, mm] = t.split(':').map(Number);
    const period = hh < 12 ? 'AM' : 'PM';
    const h = hh % 12 || 12;
    return `${h}:${String(mm).padStart(2, '0')} ${period}`;
}

export function roundTo15(timeStr) {
    if (!timeStr) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const rounded = Math.round(m / 15) * 15;
    const finalH = rounded === 60 ? h + 1 : h;
    const finalM = rounded === 60 ? 0 : rounded;
    return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

export function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const [hIn, mIn] = timeIn.split(':').map(Number);
    const [hOut, mOut] = timeOut.split(':').map(Number);
    const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    return diff > 0 ? Math.round(diff / 15) * 0.25 : 0;
}

export function unitsToHours(units) {
    if (!units) return '—';
    return (units / 4).toFixed(1);
}
