jest.mock('../../lib/prisma', () => ({
    employeeScheduleLink: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    scheduleNotification: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    shift: { findMany: jest.fn() },
}));

jest.mock('../../services/notificationService', () => ({
    isSmsConfigured: jest.fn(() => false),
    isEmailConfigured: jest.fn(() => true),
    sendSms: jest.fn(),
    sendEmail: jest.fn(),
    formatScheduleSms: jest.fn(() => 'sms body'),
    formatScheduleEmailHtml: jest.fn(() => '<html>email</html>'),
}));

jest.mock('../../services/schedulingService', () => ({
    getWeekRange: jest.fn(() => ({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })),
}));

const prisma = require('../../lib/prisma');
const { recordOpen, getNotificationForView, sendSchedules, getNotificationStatus } = require('../scheduleNotificationController');
const notifService = require('../../services/notificationService');

function mockReqRes(overrides = {}) {
    const req = { params: {}, query: {}, body: {}, ...overrides };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res };
}

describe('recordOpen', () => {
    beforeEach(() => jest.clearAllMocks());

    test('marks openedAt on most recent notification for employee+week', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue({ id: 10, openedAt: null });
        prisma.scheduleNotification.update.mockResolvedValue({ id: 10, openedAt: new Date() });

        const { req, res } = mockReqRes({ params: { token: 'abc-123' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(prisma.employeeScheduleLink.findUnique).toHaveBeenCalledWith({ where: { token: 'abc-123' } });
        expect(prisma.scheduleNotification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ employeeId: 5, openedAt: null }),
            orderBy: { createdAt: 'desc' },
        }));
        expect(prisma.scheduleNotification.update).toHaveBeenCalledWith({
            where: { id: 10 },
            data: { openedAt: expect.any(Date) },
        });
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns success even if no notification exists (no-op)', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'abc-123' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(prisma.scheduleNotification.update).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns 404 for invalid token', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'bad-token' }, query: { weekStart: '2026-06-01' } });
        await recordOpen(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('getNotificationForView', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns most recent notification with confirmationToken', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue({
            confirmationToken: 'conf-abc',
            message: 'Check weekend shifts',
            response: '',
            responseNotes: '',
            respondedAt: null,
            openedAt: null,
            sentAt: new Date('2026-06-01T09:00:00Z'),
        });

        const { req, res } = mockReqRes({ params: { token: 'link-token' }, query: { weekStart: '2026-06-01' } });
        await getNotificationForView(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            confirmationToken: 'conf-abc',
            message: 'Check weekend shifts',
            response: '',
        }));
    });

    test('returns null when no notification exists', async () => {
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, employeeId: 5, active: true });
        prisma.scheduleNotification.findFirst.mockResolvedValue(null);

        const { req, res } = mockReqRes({ params: { token: 'link-token' }, query: { weekStart: '2026-06-01' } });
        await getNotificationForView(req, res);

        expect(res.json).toHaveBeenCalledWith({ notification: null });
    });
});

describe('sendSchedules', () => {
    beforeEach(() => jest.clearAllMocks());

    test('stores message and sentById on notification records', async () => {
        prisma.shift.findMany.mockResolvedValue([{
            id: 1, employeeId: 5, employee: { id: 5, name: 'Alea', email: 'alea@test.com', phone: '' },
            client: { clientName: 'Client A' }, shiftDate: new Date('2026-06-02'), startTime: '09:00', endTime: '17:00', serviceCode: 'PCS',
        }]);
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({ id: 1, token: 'link-token', active: true });
        prisma.scheduleNotification.create.mockResolvedValue({ id: 20 });
        prisma.scheduleNotification.update.mockResolvedValue({ id: 20, status: 'sent' });
        notifService.isEmailConfigured.mockReturnValue(true);
        notifService.sendEmail.mockResolvedValue({});

        const { req, res } = mockReqRes({
            body: { weekStart: '2026-06-01', employeeIds: [5], message: 'Check shifts' },
            user: { id: 3 },
            protocol: 'http',
            get: () => 'localhost:4000',
        });
        await sendSchedules(req, res);

        expect(prisma.scheduleNotification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                message: 'Check shifts',
                sentById: 3,
            }),
        });
        expect(notifService.formatScheduleEmailHtml).toHaveBeenCalledWith(
            'Alea', expect.any(Array), expect.any(String), expect.any(String), 'Check shifts'
        );
    });
});

describe('getNotificationStatus', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns notifications with sentByUser included', async () => {
        prisma.scheduleNotification.findMany.mockResolvedValue([
            { id: 1, employeeId: 5, sentAt: new Date(), openedAt: new Date(), response: 'accepted', employee: { id: 5, name: 'Alea' }, sentByUser: { name: 'Admin' } },
        ]);

        const { req, res } = mockReqRes({ query: { weekStart: '2026-06-01' } });
        await getNotificationStatus(req, res);

        expect(prisma.scheduleNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.objectContaining({
                sentByUser: expect.any(Object),
            }),
        }));
        expect(res.json).toHaveBeenCalled();
    });
});
