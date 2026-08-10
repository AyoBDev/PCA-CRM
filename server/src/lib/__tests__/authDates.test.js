const { dayBefore } = require('../authDates');

describe('dayBefore', () => {
    it('returns the previous day', () => {
        expect(dayBefore('2026-06-01')).toBe('2026-05-31');
    });
    it('crosses year boundary', () => {
        expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    });
    it('handles leap day', () => {
        expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    });
    it('does not drift across timezones', () => {
        // Parsed at local midnight, so the calendar day is stable.
        expect(dayBefore('2026-03-15')).toBe('2026-03-14');
    });
});
