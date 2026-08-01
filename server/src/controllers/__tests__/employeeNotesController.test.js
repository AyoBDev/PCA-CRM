// Tests for the employee notes timeline.
//
// This is an ADMIN-ONLY internal record. It exists so an agency can see the
// pattern behind complaints and attendance — who called out, how often, what
// they said when contacted. The employee must never see it: knowing that their
// callouts are being tallied changes what they report, which is exactly the
// signal the record is for.
//
// Mirrors clientNotesController: a read-only aggregation over source records
// rather than a copied-note table, so nothing can drift out of sync.

jest.mock('../../lib/prisma', () => ({
    employee: { findUnique: jest.fn() },
    shiftCallout: { findMany: jest.fn(() => []) },
    shiftOffer: { findMany: jest.fn(() => []) },
    auditLog: { findMany: jest.fn(() => []) },
}));

const prisma = require('../../lib/prisma');
const { listEmployeeNotesTimeline } = require('../employeeNotesController');

function mockReqRes(overrides = {}) {
    const req = { params: { employeeId: '5' }, query: {}, user: { id: 2, name: 'Admin', role: 'admin' }, ...overrides };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res, next: jest.fn() };
}

beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes call history but NOT mockResolvedValue implementations,
    // so each source is reset explicitly — otherwise one test's fixtures leak
    // into the next and silently change its totals.
    prisma.employee.findUnique.mockResolvedValue({ id: 5, name: 'Sam Carer', notes: '', updatedAt: new Date('2026-07-01') });
    prisma.shiftCallout.findMany.mockResolvedValue([]);
    prisma.shiftOffer.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
});

describe('listEmployeeNotesTimeline', () => {
    test('404s for a missing employee', async () => {
        prisma.employee.findUnique.mockResolvedValue(null);

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('includes callouts this employee made, with the reason', async () => {
        prisma.shiftCallout.findMany.mockResolvedValue([{
            id: 1, reason: 'car trouble', resolution: 'filled', createdAt: new Date('2026-07-20'),
            shift: { shiftDate: new Date('2026-07-20'), client: { clientName: 'Jane Doe' } },
        }]);

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        const { notes } = res.json.mock.calls[0][0];
        expect(notes.some(n => n.source === 'callout' && /car trouble/.test(n.content))).toBe(true);
    });

    test('scopes callouts to this employee', async () => {
        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        expect(prisma.shiftCallout.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ calloutEmployeeId: 5 }) }),
        );
    });

    test('includes what was said when the office phoned this employee', async () => {
        prisma.shiftOffer.findMany.mockResolvedValue([{
            id: 9, response: 'accepted', channel: 'phone', respondedAt: new Date('2026-07-21'),
            offeredAt: new Date('2026-07-21'),
            shift: { shiftDate: new Date('2026-07-22'), client: { clientName: 'Jane Doe' } },
        }]);
        prisma.auditLog.findMany.mockResolvedValue([{
            entityType: 'ShiftOffer', entityId: 9, userName: 'Admin', createdAt: new Date('2026-07-21'),
            metadata: JSON.stringify({ via: 'phone', note: 'called back at 8:55, can cover' }),
        }]);

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        const { notes } = res.json.mock.calls[0][0];
        expect(notes.some(n => /called back at 8:55/.test(n.content))).toBe(true);
    });

    test('returns entries newest first', async () => {
        prisma.shiftCallout.findMany.mockResolvedValue([
            { id: 1, reason: 'older', resolution: 'filled', createdAt: new Date('2026-07-01'), shift: { shiftDate: new Date('2026-07-01'), client: { clientName: 'A' } } },
            { id: 2, reason: 'newer', resolution: 'filled', createdAt: new Date('2026-07-20'), shift: { shiftDate: new Date('2026-07-20'), client: { clientName: 'B' } } },
        ]);

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        const { notes } = res.json.mock.calls[0][0];
        const idx = { newer: notes.findIndex(n => /newer/.test(n.content)), older: notes.findIndex(n => /older/.test(n.content)) };
        expect(idx.newer).toBeLessThan(idx.older);
    });

    test('paginates', async () => {
        prisma.shiftCallout.findMany.mockResolvedValue(
            Array.from({ length: 30 }, (_, i) => ({
                id: i, reason: `reason ${i}`, resolution: 'filled',
                createdAt: new Date(2026, 6, (i % 28) + 1),
                shift: { shiftDate: new Date(), client: { clientName: 'X' } },
            })),
        );

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        const payload = res.json.mock.calls[0][0];
        expect(payload.notes.length).toBeLessThanOrEqual(25);
        expect(payload.total).toBe(30);
    });

    test('includes the general notes field from the employee record', async () => {
        prisma.employee.findUnique.mockResolvedValue({
            id: 5, name: 'Sam', notes: 'Prefers morning shifts', updatedAt: new Date('2026-07-01'),
        });

        const { req, res, next } = mockReqRes();
        await listEmployeeNotesTimeline(req, res, next);

        const { notes } = res.json.mock.calls[0][0];
        expect(notes.some(n => /Prefers morning shifts/.test(n.content))).toBe(true);
    });
});
