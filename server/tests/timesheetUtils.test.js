const { isOverdue } = require('../src/lib/timesheetUtils');

describe('isOverdue', () => {
    it('returns true for draft timesheet whose week has passed', () => {
        const ts = { status: 'draft', weekStart: new Date('2026-05-18T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:00:00Z'));
        expect(isOverdue(ts)).toBe(true);
        jest.useRealTimers();
    });

    it('returns false for draft timesheet whose week has not ended', () => {
        const ts = { status: 'draft', weekStart: new Date('2026-05-25T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-05-28T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });

    it('returns false for submitted timesheet even if week passed', () => {
        const ts = { status: 'submitted', weekStart: new Date('2026-05-18T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });

    it('returns false for accepted timesheet', () => {
        const ts = { status: 'accepted', weekStart: new Date('2026-05-18T00:00:00Z') };
        jest.useFakeTimers().setSystemTime(new Date('2026-06-01T10:00:00Z'));
        expect(isOverdue(ts)).toBe(false);
        jest.useRealTimers();
    });
});
