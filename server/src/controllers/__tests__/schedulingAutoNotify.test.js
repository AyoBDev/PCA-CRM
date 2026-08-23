// Tests for schedulingController.autoNotify().
//
// Context: autoNotify() destructures `isSmsConfigured` and `sendSms` from
// notificationService at import time (schedulingController.js:10). Those exports
// did not exist, so both were `undefined` and the SMS branch would throw
// `TypeError: isSmsConfigured is not a function` — taking the email branch below
// it down too.
//
// The function is currently DEAD CODE — nothing calls it. So this was a latent
// bug, not a live one: it would have crashed the first time anyone wired it up.
// The replacement workflow needs a working notify path, so these tests pin the
// behaviour down before it gets its first caller.
//
// Note: notificationService is deliberately NOT mocked wholesale. Mocking it with
// a hand-written shape is exactly what hid the missing exports from the existing
// controller tests — a mock that exports the functions proves nothing about the
// real module. We inject the real module and spy on it instead.

const notificationService = require('../../services/notificationService');
const { autoNotify } = require('../schedulingController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
    employee: { findUnique: jest.fn() },
    employeeScheduleLink: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    scheduleNotification: { create: jest.fn(), update: jest.fn() },
};

function mockReq() {
    return { protocol: 'https', get: jest.fn(() => 'app.example.com'), db: prisma };
}

describe('autoNotify', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();

        prisma.employee.findUnique.mockResolvedValue({
            id: 7, name: 'Sam Carer', email: 'sam@example.com', phone: '+15555550123',
        });
        prisma.employeeScheduleLink.findUnique.mockResolvedValue({
            id: 3, employeeId: 7, token: 'link-token-abc', active: true,
        });
        prisma.scheduleNotification.create.mockResolvedValue({ id: 55 });
        prisma.scheduleNotification.update.mockResolvedValue({ id: 55 });
    });

    test('is exported so it can be wired to shift mutations', () => {
        expect(typeof autoNotify).toBe('function');
    });

    test('does not throw when SMS is unconfigured', async () => {
        jest.spyOn(notificationService, 'isSmsConfigured').mockReturnValue(false);
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(false);

        // The original defect: this call threw TypeError before reaching email.
        await expect(autoNotify(7, '2026-08-03', mockReq())).resolves.toBeUndefined();
    });

    test('sends the schedule email even though SMS is unconfigured', async () => {
        jest.spyOn(notificationService, 'isSmsConfigured').mockReturnValue(false);
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        const sendEmail = jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({});

        await autoNotify(7, '2026-08-03', mockReq());

        // The regression that matters: an unconfigured SMS provider must not
        // prevent email delivery.
        expect(sendEmail).toHaveBeenCalledWith(
            'sam@example.com',
            expect.stringMatching(/schedule/i),
            expect.stringContaining('link-token-abc'),
            expect.any(String),
        );
        expect(prisma.scheduleNotification.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
        );
    });

    test('does not attempt to send SMS while unconfigured', async () => {
        jest.spyOn(notificationService, 'isSmsConfigured').mockReturnValue(false);
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(false);
        const sendSms = jest.spyOn(notificationService, 'sendSms');

        await autoNotify(7, '2026-08-03', mockReq());

        expect(sendSms).not.toHaveBeenCalled();
        expect(prisma.scheduleNotification.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ method: 'sms' }) }),
        );
    });

    test('records a failed notification instead of throwing when email delivery fails', async () => {
        jest.spyOn(notificationService, 'isSmsConfigured').mockReturnValue(false);
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        jest.spyOn(notificationService, 'sendEmail').mockRejectedValue(new Error('brevo down'));

        // A notification failure must never fail the shift mutation that triggered it.
        await expect(autoNotify(7, '2026-08-03', mockReq())).resolves.toBeUndefined();

        expect(prisma.scheduleNotification.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'failed', failureReason: 'brevo down' }),
            }),
        );
    });

    test('returns early for a missing employee without creating notifications', async () => {
        prisma.employee.findUnique.mockResolvedValue(null);

        await expect(autoNotify(999, '2026-08-03', mockReq())).resolves.toBeUndefined();
        expect(prisma.scheduleNotification.create).not.toHaveBeenCalled();
    });
});
