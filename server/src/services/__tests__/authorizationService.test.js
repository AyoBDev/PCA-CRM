const {
    computeDaysToExpire,
    getReminderWindow,
    computeStatus,
    enrichAuthorization,
    enrichClient,
} = require('../authorizationService');

// Helper: create a date N days from "today" (UTC)
function daysFromNow(n) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d;
}

// ── computeDaysToExpire ────────────────────────
describe('computeDaysToExpire', () => {
    test('returns 0 for today', () => {
        expect(computeDaysToExpire(new Date())).toBe(0);
    });

    test('returns positive for future dates', () => {
        expect(computeDaysToExpire(daysFromNow(10))).toBe(10);
    });

    test('returns negative for past dates', () => {
        expect(computeDaysToExpire(daysFromNow(-5))).toBe(-5);
    });

    test('handles string dates', () => {
        const future = daysFromNow(30).toISOString();
        expect(computeDaysToExpire(future)).toBe(30);
    });
});

// ── getReminderWindow ──────────────────────────
describe('getReminderWindow', () => {
    test('PCS = 60', () => expect(getReminderWindow('PCS')).toBe(60));
    test('SDPC = 30', () => expect(getReminderWindow('SDPC')).toBe(30));
    test('TIMESHEETS = 15', () => expect(getReminderWindow('TIMESHEETS')).toBe(15));
    test('unknown returns default 30', () => expect(getReminderWindow('UNKNOWN')).toBe(30));
});

// ── computeStatus ──────────────────────────────
describe('computeStatus', () => {
    // Expired
    test('negative days → Expired / RED', () => {
        expect(computeStatus(-1, 'PCS')).toEqual({ status: 'Expired', statusColor: 'RED' });
        expect(computeStatus(-100, 'SDPC')).toEqual({ status: 'Expired', statusColor: 'RED' });
    });

    // Renewal Reminder (within window, inclusive)
    test('PCS at 60 days → Renewal Reminder / ORANGE', () => {
        expect(computeStatus(60, 'PCS')).toEqual({ status: 'Renewal Reminder', statusColor: 'ORANGE' });
    });
    test('PCS at 0 days → Renewal Reminder / ORANGE', () => {
        expect(computeStatus(0, 'PCS')).toEqual({ status: 'Renewal Reminder', statusColor: 'ORANGE' });
    });
    test('SDPC at 30 days → Renewal Reminder / YELLOW', () => {
        expect(computeStatus(30, 'SDPC')).toEqual({ status: 'Renewal Reminder', statusColor: 'YELLOW' });
    });
    test('TIMESHEETS at 15 days → Renewal Reminder / ORANGE', () => {
        expect(computeStatus(15, 'TIMESHEETS')).toEqual({ status: 'Renewal Reminder', statusColor: 'ORANGE' });
    });

    // OK (beyond window)
    test('PCS at 61 days → OK / BLUE', () => {
        expect(computeStatus(61, 'PCS')).toEqual({ status: 'OK', statusColor: 'BLUE' });
    });
    test('SDPC at 31 days → OK / BLUE', () => {
        expect(computeStatus(31, 'SDPC')).toEqual({ status: 'OK', statusColor: 'BLUE' });
    });
    test('TIMESHEETS at 16 days → OK / BLUE', () => {
        expect(computeStatus(16, 'TIMESHEETS')).toEqual({ status: 'OK', statusColor: 'BLUE' });
    });
});

// ── enrichAuthorization ────────────────────────
describe('enrichAuthorization', () => {
    test('adds computed fields to raw record', () => {
        const raw = {
            id: 1,
            clientId: 10,
            serviceCode: 'PCS',
            authorizationEndDate: daysFromNow(50),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const enriched = enrichAuthorization(raw);
        expect(enriched.daysToExpire).toBe(50);
        expect(enriched.status).toBe('Renewal Reminder');
        expect(enriched.statusColor).toBe('ORANGE');
    });
});

// ── enrichClient ───────────────────────────────
describe('enrichClient', () => {
    test('computes all client-level fields', () => {
        const client = {
            id: 1,
            clientName: 'Test Corp',
            createdAt: new Date(),
            updatedAt: new Date(),
            authorizations: [
                {
                    id: 1, clientId: 1, serviceCode: 'PCS',
                    authorizationEndDate: daysFromNow(100),
                    createdAt: new Date('2025-01-01'), updatedAt: new Date(),
                },
                {
                    id: 2, clientId: 1, serviceCode: 'SDPC',
                    authorizationEndDate: daysFromNow(-3),
                    createdAt: new Date('2025-01-02'), updatedAt: new Date(),
                },
            ],
        };

        const result = enrichClient(client);

        // Service summary should contain both codes
        expect(result.serviceSummary).toBe('🔷 PCS / 🔷 SDPC');

        // Worst status should be Expired (from SDPC)
        expect(result.overallStatus).toBe('Expired');
        expect(result.statusColor).toBe('RED');

        // Days summary in creation order
        expect(result.daysSummary).toBe('PCS:100 / SDPC:-3');
    });

    test('handles client with no authorizations', () => {
        const client = {
            id: 2,
            clientName: 'Empty',
            createdAt: new Date(),
            updatedAt: new Date(),
            authorizations: [],
        };
        const result = enrichClient(client);
        expect(result.serviceSummary).toBe('—');
        expect(result.overallStatus).toBe('OK');
        expect(result.daysSummary).toBe('—');
    });

    test('worst status wins: Renewal Reminder over OK', () => {
        const client = {
            id: 3,
            clientName: 'Mixed',
            createdAt: new Date(),
            updatedAt: new Date(),
            authorizations: [
                {
                    id: 10, clientId: 3, serviceCode: 'PCS',
                    authorizationEndDate: daysFromNow(200), // OK
                    createdAt: new Date(), updatedAt: new Date(),
                },
                {
                    id: 11, clientId: 3, serviceCode: 'TIMESHEETS',
                    authorizationEndDate: daysFromNow(10), // Renewal Reminder
                    createdAt: new Date(), updatedAt: new Date(),
                },
            ],
        };
        const result = enrichClient(client);
        expect(result.overallStatus).toBe('Renewal Reminder');
        expect(result.statusColor).toBe('ORANGE');
    });
});
