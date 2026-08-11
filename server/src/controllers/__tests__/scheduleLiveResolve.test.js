// Regression test for the "schedule PDF export shows blank Account / Sandata Client ID" bug.
//
// account_number and sandata_client_id are dormant on the Shift row — they are
// resolved LIVE from the client's authorization via enrichShiftLive(). listShifts
// and the shared schedule view were migrated to enrichShiftLive, but the admin
// per-client and per-employee schedule endpoints (getClientSchedule /
// getEmployeeSchedule) still used the plain enrichShift(), so the shift objects
// that feed the Scheduling page's Client-card and Employee-card "Save as PDF"
// export carried empty account/Sandata and printed as "—".
//
// Both endpoints must resolve account + Sandata LIVE from the client's
// authorization, exactly like listShifts.

jest.mock('../../lib/prisma', () => ({
    client: { findUnique: jest.fn() },
    employee: { findUnique: jest.fn() },
    shift: { findMany: jest.fn() },
    authorization: { findMany: jest.fn() },
}));

jest.mock('../../services/auditService', () => ({
    logAction: jest.fn(),
    diffFields: jest.fn(() => []),
}));

jest.mock('../../services/notificationService', () => ({
    isSmsConfigured: jest.fn(() => false),
    isEmailConfigured: jest.fn(() => false),
    sendSms: jest.fn(),
    sendEmail: jest.fn(),
}));

// Keep the real schedulingService / sandataResolver / authorizationService so
// live resolution actually runs.
const prisma = require('../../lib/prisma');
const { getClientSchedule, getEmployeeSchedule } = require('../schedulingController');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}

// A shift row with EMPTY stored account/Sandata (the current dormant-column reality).
function shiftRow(overrides = {}) {
    return {
        id: 1, clientId: 42, employeeId: 7, serviceCode: 'PCS',
        shiftDate: new Date('2026-08-12T00:00:00.000Z'),
        startTime: '09:00', endTime: '13:00', status: 'scheduled', units: 16,
        accountNumber: '', sandataClientId: '',
        employee: { id: 7, name: 'Maria PCA' },
        client: { id: 42, clientName: 'Heidi Martinez', address: '', phone: '', gateCode: '', notes: '' },
        ...overrides,
    };
}

// The client's live PCS authorization holds the real account + Sandata ID.
const liveAuth = {
    clientId: 42, serviceCode: 'PCS', serviceName: 'Personal Care Services',
    accountNumber: '1000-PCS', sandataClientId: 'HEIDI-123',
    manualStatus: 'active', archivedAt: null,
    authorizationStartDate: new Date('2026-01-01'),
    authorizationEndDate: new Date('2026-12-31'),
    authorizedUnits: 400,
};

beforeEach(() => jest.clearAllMocks());

describe('getClientSchedule — live account/Sandata resolution', () => {
    test('returned shifts carry account + Sandata resolved from the authorization', async () => {
        prisma.client.findUnique.mockResolvedValue({
            id: 42, clientName: 'Heidi Martinez', address: '', phone: '', gateCode: '', notes: '',
            authorizations: [liveAuth],
        });
        prisma.shift.findMany.mockResolvedValue([shiftRow()]);

        const res = mockRes();
        await getClientSchedule(
            { params: { clientId: '42' }, query: { weekStart: '2026-08-09' } },
            res,
            (err) => { throw err; },
        );

        const shift = res.body.shifts[0];
        expect(shift.accountNumber).toBe('1000-PCS');
        expect(shift.sandataClientId).toBe('HEIDI-123');
    });
});

describe('getEmployeeSchedule — live account/Sandata resolution', () => {
    test('returned shifts carry account + Sandata resolved from the authorization', async () => {
        prisma.employee.findUnique.mockResolvedValue({
            id: 7, name: 'Maria PCA', email: '', phone: '', address: '',
        });
        prisma.shift.findMany.mockResolvedValue([shiftRow()]);
        prisma.authorization.findMany.mockResolvedValue([liveAuth]);

        const res = mockRes();
        await getEmployeeSchedule(
            { params: { employeeId: '7' }, query: { weekStart: '2026-08-09' } },
            res,
            (err) => { throw err; },
        );

        const shift = res.body.shifts[0];
        expect(shift.accountNumber).toBe('1000-PCS');
        expect(shift.sandataClientId).toBe('HEIDI-123');
    });
});
