const { buildClientAuthMap } = require('../payrollController');

// The reported scenario: a client (Andranik Zadoyan) has a current SDPC auth and
// a SCHEDULED future SDPC renewal. The payroll banner's authorized-units total
// must reflect only the auth effective for the pay period — NOT the sum of both
// (which would show SDPC 56 instead of 28).
describe('buildClientAuthMap — future renewal must not double the authorized total', () => {
    const client = {
        clientName: 'Andranik Zadoyan',
        authorizations: [
            // current SDPC: Nov 20 2025 – Aug 30 2026, 28 units
            { serviceCode: 'SDPC', authorizedUnits: 28, manualStatus: 'active',
              authorizationStartDate: '2025-11-20', authorizationEndDate: '2026-08-30' },
            // scheduled renewal SDPC: Sep 1 2026 – Nov 13 2026, 28 units
            { serviceCode: 'SDPC', authorizedUnits: 28, manualStatus: 'active',
              authorizationStartDate: '2026-09-01', authorizationEndDate: '2026-11-13' },
            // an unrelated PCS auth to confirm other codes still map
            { serviceCode: 'PCS', authorizedUnits: 69, manualStatus: 'active',
              authorizationStartDate: '2026-04-14', authorizationEndDate: '2027-04-30' },
        ],
    };
    const norm = 'andranik zadoyan';

    it('period fully inside the current auth → only the current 28 units count', () => {
        const map = buildClientAuthMap([client], '2026-08-01', '2026-08-15');
        expect(map[norm].SDPC).toBe(28);
        expect(map[norm].PCS).toBe(69);
    });

    it('period fully inside the renewal → only the renewal 28 units count', () => {
        const map = buildClientAuthMap([client], '2026-09-05', '2026-09-19');
        expect(map[norm].SDPC).toBe(28);
    });

    it('never sums the two SDPC auths into 56 even when the period straddles the boundary', () => {
        // filterAuthsByWeek dedupes to one auth per code (oldest overlapping),
        // so a straddling period still yields a single SDPC figure, never 56.
        const map = buildClientAuthMap([client], '2026-08-20', '2026-09-10');
        expect(map[norm].SDPC).toBe(28);
    });

    it('no period set → falls back to "today", still excludes a not-yet-started renewal', () => {
        // The fallback uses new Date(), so pin "today" to a fixed date instead of
        // the wall clock — otherwise this test rots once the real date crosses the
        // renewal boundary (Sep 1 2026). With today = Aug 18 2026, the current auth
        // is effective and the renewal is still excluded.
        jest.useFakeTimers().setSystemTime(new Date('2026-08-18T12:00:00Z'));
        try {
            const map = buildClientAuthMap([client], null, null);
            expect(map[norm].SDPC).toBe(28);
        } finally {
            jest.useRealTimers();
        }
    });

    it('a manually inactivated auth is excluded regardless of dates', () => {
        const c2 = {
            clientName: 'Test Inactive',
            authorizations: [
                { serviceCode: 'SDPC', authorizedUnits: 28, manualStatus: 'inactive',
                  authorizationStartDate: '2026-01-01', authorizationEndDate: '2026-12-31' },
            ],
        };
        const map = buildClientAuthMap([c2], '2026-06-01', '2026-06-15');
        expect(map['inactive test'].SDPC).toBeUndefined();
    });
});
