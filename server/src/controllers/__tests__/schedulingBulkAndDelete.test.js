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

jest.mock('../../services/authorizationService', () => ({
    filterAuthsByWeek: jest.fn(() => []),
}));

// Keep the real schedulingService helpers (computeShiftHours, enrichShift, etc.)
const { deleteShift, bulkUpdateShiftsPerShift, listShifts, createShift } = require('../schedulingController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
    shift: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    employee: { findUnique: jest.fn() },
    bulkEditBatch: { create: jest.fn() },
    authorization: { findMany: jest.fn() },
};

function mockReqRes(overrides = {}) {
    const req = {
        params: {}, query: {}, body: {},
        user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
        db: prisma,
        ...overrides,
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res };
}

describe('deleteShift — scope param (Bug 1)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('scope=future archives only the clicked shift and later occurrences, never past ones', async () => {
        const clicked = {
            id: 42,
            recurringGroupId: 'rg_abc',
            shiftDate: new Date('2026-07-15T00:00:00.000Z'),
        };
        prisma.shift.findUnique.mockResolvedValue(clicked);
        prisma.shift.findMany.mockResolvedValue([{ id: 42 }, { id: 50 }, { id: 58 }]);
        prisma.shift.updateMany.mockResolvedValue({ count: 3 });

        const { req, res } = mockReqRes({ params: { id: '42' }, query: { scope: 'future' } });
        await deleteShift(req, res, (e) => { throw e; });

        expect(prisma.shift.updateMany).toHaveBeenCalledTimes(1);
        const call = prisma.shift.updateMany.mock.calls[0][0];
        expect(call.where.recurringGroupId).toBe('rg_abc');
        // Must be bounded from the clicked shift's date forward — past shifts excluded.
        expect(call.where.shiftDate).toEqual({ gte: clicked.shiftDate });
        // Returns the exact archived ids so the client can restore them on undo.
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ archived: 3, ids: [42, 50, 58] }));
    });

    test('scope=all archives the entire series (past included) — explicit choice', async () => {
        prisma.shift.findUnique.mockResolvedValue({
            id: 42, recurringGroupId: 'rg_abc', shiftDate: new Date('2026-07-15T00:00:00.000Z'),
        });
        prisma.shift.findMany.mockResolvedValue([{ id: 42 }]);
        prisma.shift.updateMany.mockResolvedValue({ count: 8 });

        const { req, res } = mockReqRes({ params: { id: '42' }, query: { scope: 'all' } });
        await deleteShift(req, res, (e) => { throw e; });

        const call = prisma.shift.updateMany.mock.calls[0][0];
        expect(call.where.recurringGroupId).toBe('rg_abc');
        expect(call.where.shiftDate).toBeUndefined(); // no date bound = whole series
    });

    test('scope=this archives only the single shift', async () => {
        prisma.shift.findUnique.mockResolvedValue({
            id: 42, recurringGroupId: 'rg_abc', shiftDate: new Date('2026-07-15T00:00:00.000Z'),
        });
        prisma.shift.update.mockResolvedValue({ id: 42 });

        const { req, res } = mockReqRes({ params: { id: '42' }, query: { scope: 'this' } });
        await deleteShift(req, res, (e) => { throw e; });

        expect(prisma.shift.updateMany).not.toHaveBeenCalled();
        expect(prisma.shift.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 42 } })
        );
    });

    test('legacy group=true still behaves as scope=all (back-compat)', async () => {
        prisma.shift.findUnique.mockResolvedValue({
            id: 42, recurringGroupId: 'rg_abc', shiftDate: new Date('2026-07-15T00:00:00.000Z'),
        });
        prisma.shift.findMany.mockResolvedValue([{ id: 42 }]);
        prisma.shift.updateMany.mockResolvedValue({ count: 8 });

        const { req, res } = mockReqRes({ params: { id: '42' }, query: { group: 'true' } });
        await deleteShift(req, res, (e) => { throw e; });

        const call = prisma.shift.updateMany.mock.calls[0][0];
        expect(call.where.recurringGroupId).toBe('rg_abc');
        expect(call.where.shiftDate).toBeUndefined();
    });
});

describe('bulkUpdateShiftsPerShift — overlap blocks, never auto-edits (Bug 3)', () => {
    beforeEach(() => jest.clearAllMocks());
    beforeEach(() => {
        prisma.bulkEditBatch.create.mockResolvedValue({ id: 99 });
        prisma.employee.findUnique.mockResolvedValue({ id: 7 });
    });

    test('blocks the save when the edited time would overlap a sibling shift; writes nothing', async () => {
        // Two shifts same employee/date: Respite 09:00-11:00, Homemaker 11:00-13:00.
        // User edits Respite end to 12:00 → overlaps Homemaker → must block, no update.
        const respite = {
            id: 1, employeeId: 7, serviceCode: 'S5150',
            shiftDate: new Date('2026-07-20T00:00:00.000Z'),
            startTime: '09:00', endTime: '11:00', recurringGroupId: 'rg_x',
            employee: { id: 7, name: 'Jane' },
        };
        const homemaker = {
            id: 2, employeeId: 7, serviceCode: 'S5130',
            shiftDate: new Date('2026-07-20T00:00:00.000Z'),
            startTime: '11:00', endTime: '13:00', recurringGroupId: 'rg_x',
            employee: { id: 7, name: 'Jane' },
        };

        // findMany is used to load the edited shifts AND (for overlap check) sibling shifts.
        prisma.shift.findMany.mockImplementation(({ where }) => {
            if (where.id && where.id.in) {
                return Promise.resolve([respite]); // the shift being edited
            }
            // overlap sibling lookup: same employee/date
            return Promise.resolve([respite, homemaker]);
        });

        const { req, res } = mockReqRes({
            body: { perShiftUpdates: { 1: { endTime: '12:00' } }, applyToFuture: false },
        });
        await bulkUpdateShiftsPerShift(req, res, (e) => { throw e; });

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'overlap' })
        );
        // Critically: it must NOT have rewritten the untouched homemaker shift (id 2)
        const updatedIds = prisma.shift.update.mock.calls.map(c => c[0].where.id);
        expect(updatedIds).not.toContain(2);
        // And it should not have applied the edit either (blocked, atomic).
        expect(updatedIds).not.toContain(1);
    });

    test('future propagation only touches shifts matching day-of-week AND service code (no || dayRules[0] fallback)', async () => {
        // Selected: edit Respite (S5150) on a Monday, applyToFuture.
        // A future Monday has both a Respite and a Homemaker shift.
        // Only the future Respite should change; the Homemaker must be left untouched.
        const editedRespite = {
            id: 1, employeeId: 7, serviceCode: 'S5150',
            shiftDate: new Date('2026-07-20T00:00:00.000Z'), // Monday
            startTime: '09:00', endTime: '11:00', recurringGroupId: 'rg_x',
            employee: { id: 7, name: 'Jane' },
        };
        const futureRespite = {
            id: 10, employeeId: 7, serviceCode: 'S5150',
            shiftDate: new Date('2026-07-27T00:00:00.000Z'), // next Monday
            startTime: '09:00', endTime: '11:00', recurringGroupId: 'rg_x',
            employee: { id: 7, name: 'Jane' },
        };
        const futureHomemaker = {
            id: 11, employeeId: 7, serviceCode: 'S5130',
            shiftDate: new Date('2026-07-27T00:00:00.000Z'), // same Monday
            startTime: '11:00', endTime: '13:00', recurringGroupId: 'rg_x',
            employee: { id: 7, name: 'Jane' },
        };

        prisma.shift.findMany.mockImplementation(({ where }) => {
            if (where.id && where.id.in && !where.recurringGroupId) {
                return Promise.resolve([editedRespite]); // edited shifts
            }
            if (where.recurringGroupId) {
                return Promise.resolve([futureRespite, futureHomemaker]); // future series
            }
            // overlap sibling lookups return only the shift itself (no conflict)
            if (where.employeeId) return Promise.resolve([editedRespite]);
            return Promise.resolve([]);
        });
        prisma.shift.update.mockImplementation(({ where }) => Promise.resolve({ id: where.id, employee: { id: 7, name: 'Jane' } }));

        const { req, res } = mockReqRes({
            body: { perShiftUpdates: { 1: { startTime: '08:00' } }, applyToFuture: true },
        });
        await bulkUpdateShiftsPerShift(req, res, (e) => { throw e; });

        const updatedIds = prisma.shift.update.mock.calls.map(c => c[0].where.id);
        expect(updatedIds).toContain(10);  // future respite updated
        expect(updatedIds).not.toContain(11); // future homemaker left alone
    });

    test('applyToFuture with NON-grouped shifts propagates to future shifts matched by client+employee+weekday+serviceCode', async () => {
        // Shifts created week-by-week (no shared recurringGroupId). Editing this
        // week's Monday PCS shift with "apply to all future recurring weeks" must
        // still update the same client's PCS shift on future Mondays for the same
        // employee — the feature can't rely on a recurring group existing.
        const editedMon = {
            id: 1, clientId: 3, employeeId: 7, serviceCode: 'PCS',
            shiftDate: new Date('2026-08-10T00:00:00.000Z'), // Monday
            startTime: '09:00', endTime: '13:00', recurringGroupId: '',
            employee: { id: 7, name: 'Jane' }, client: { id: 3, clientName: 'Bob' },
        };
        const futureMonWk2 = { ...editedMon, id: 10, shiftDate: new Date('2026-08-17T00:00:00.000Z') };
        const futureMonWk3 = { ...editedMon, id: 11, shiftDate: new Date('2026-08-24T00:00:00.000Z') };
        // A future TUESDAY shift (wrong weekday) must be left untouched.
        const futureTue = { ...editedMon, id: 12, shiftDate: new Date('2026-08-18T00:00:00.000Z') };
        // A future Monday shift with a DIFFERENT service code must be left untouched.
        const futureMonOtherSvc = { ...editedMon, id: 13, serviceCode: 'S5130', shiftDate: new Date('2026-08-17T00:00:00.000Z') };

        prisma.shift.findMany.mockImplementation(({ where }) => {
            // 1) load the edited shifts by id
            if (where.id && where.id.in && !where.recurringGroupId && !where.OR) {
                return Promise.resolve([editedMon]);
            }
            // 2) recurring-group future lookup — none exist here
            if (where.recurringGroupId) return Promise.resolve([]);
            // 3) fallback future lookup by client+employee (server filters weekday/service in JS)
            if (where.OR) {
                return Promise.resolve([futureMonWk2, futureMonWk3, futureTue, futureMonOtherSvc]);
            }
            // overlap sibling lookups: return only the shift itself (no conflict)
            if (where.employeeId) return Promise.resolve([editedMon]);
            return Promise.resolve([]);
        });
        prisma.shift.update.mockImplementation(({ where }) => Promise.resolve({ id: where.id, employee: { id: 7, name: 'Jane' } }));

        const { req, res } = mockReqRes({
            body: { perShiftUpdates: { 1: { startTime: '08:00' } }, applyToFuture: true },
        });
        await bulkUpdateShiftsPerShift(req, res);

        const updatedIds = prisma.shift.update.mock.calls.map(c => c[0].where.id);
        expect(updatedIds).toContain(1);   // current week edited
        expect(updatedIds).toContain(10);  // future Monday, same service → updated
        expect(updatedIds).toContain(11);  // future Monday, same service → updated
        expect(updatedIds).not.toContain(12); // future Tuesday → untouched
        expect(updatedIds).not.toContain(13); // future Monday, different service → untouched
    });
});

describe('createShift — does not persist accountNumber/sandataClientId from request body (Task 5)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('single-shift create stores accountNumber="" and sandataClientId="" regardless of request body values', async () => {
        // Mock getAuthorizedServiceCodes: no authorizations → hasAuthorizations=false → skips validation
        prisma.authorization.findMany.mockResolvedValue([]);

        // Mock overlap check: no conflicts
        prisma.shift.findMany.mockResolvedValue([]);

        // Mock employee lookup (used only if there's an overlap conflict; won't be called here)
        prisma.employee.findUnique.mockResolvedValue({ id: 7, name: 'Jane' });

        const createdShift = {
            id: 10,
            clientId: 1,
            employeeId: 7,
            serviceCode: 'PCS',
            shiftDate: new Date('2026-08-10T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '13:00',
            hours: 4,
            units: 16,
            notes: '',
            accountNumber: '',
            sandataClientId: '',
            recurringGroupId: '',
            status: 'scheduled',
            archivedAt: null,
            client: { id: 1, clientName: 'Test Client', address: '', phone: '', gateCode: '' },
            employee: { id: 7, name: 'Jane', email: '', phone: '' },
        };
        prisma.shift.create.mockResolvedValue(createdShift);

        const { req, res } = mockReqRes({
            body: {
                clientId: 1,
                employeeId: 7,
                serviceCode: 'PCS',
                shiftDate: '2026-08-10',
                startTime: '09:00',
                endTime: '13:00',
                accountNumber: '71040',    // valid account number — should NOT be persisted
                sandataClientId: '955054', // should NOT be persisted
            },
        });
        await createShift(req, res);

        // The shift.create mock must have been called
        expect(prisma.shift.create).toHaveBeenCalledTimes(1);
        const callData = prisma.shift.create.mock.calls[0][0].data;
        expect(callData.accountNumber).toBe('');
        expect(callData.sandataClientId).toBe('');
    });


});

describe('listShifts — live account/Sandata resolution (Task 3)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns resolved accountNumber and sandataClientId from authorization, not stale stored values', async () => {
        const clientId = 99;

        // Shift has STALE stored values that differ from the live authorization
        prisma.shift.findMany.mockResolvedValue([{
            id: 1,
            clientId,
            employeeId: 7,
            serviceCode: 'PCS',
            shiftDate: new Date('2026-08-10T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '13:00',
            status: 'scheduled',
            archivedAt: null,
            recurringGroupId: null,
            notes: '',
            accountNumber: 'STALE',
            sandataClientId: 'STALE',
            client: { id: clientId, clientName: 'John Smith', address: '', phone: '', gateCode: '' },
            employee: { id: 7, name: 'Jane Doe', email: '', phone: '' },
        }]);

        // Live authorization has the correct values
        prisma.authorization.findMany.mockResolvedValue([{
            clientId,
            serviceCode: 'PCS',
            accountNumber: '71040',
            sandataClientId: '955054',
            manualStatus: 'active',
        }]);

        const { req, res } = mockReqRes({ query: { weekStart: '2026-08-09' } });
        await listShifts(req, res);

        expect(res.json).toHaveBeenCalledTimes(1);
        const body = res.json.mock.calls[0][0];
        expect(body.shifts).toHaveLength(1);
        expect(body.shifts[0].accountNumber).toBe('71040');
        expect(body.shifts[0].sandataClientId).toBe('955054');
    });
});
