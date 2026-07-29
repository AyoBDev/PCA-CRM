// Shared formatting helpers for offer channels, so the shift a caregiver sees
// reads identically whether it arrives by portal, email or (later) SMS.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14:30" or a Date -> "2:30 PM". */
function hhmm12(value) {
    if (!value) return '';
    let h, m;
    if (value instanceof Date) {
        h = value.getUTCHours();
        m = value.getUTCMinutes();
    } else {
        [h, m] = String(value).split(':').map(Number);
    }
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** A Date -> "Monday, Aug 3". */
function formatShiftDate(date) {
    const d = date instanceof Date ? date : new Date(`${date}T00:00:00.000Z`);
    return `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Monday, Aug 3, 9:00 AM - 1:00 PM". */
function formatShiftLine(shift) {
    return `${formatShiftDate(shift.shiftDate)}, ${hhmm12(shift.startTime)} - ${hhmm12(shift.endTime)}`;
}

/** Public URL a caregiver opens to accept or decline. */
function offerUrl(offer) {
    const base = process.env.APP_URL || 'https://nvbestpca.com';
    return `${base}/shift-offers/${offer.token}`;
}

module.exports = { hhmm12, formatShiftDate, formatShiftLine, offerUrl };
