// Regression tests for the notificationService SMS contract.
//
// schedulingController.js destructures `isSmsConfigured` and `sendSms` from this
// module at import time. Before this fix neither was exported, so both were
// `undefined` and autoNotify() threw `TypeError: isSmsConfigured is not a function`
// on every shift create/update — which also prevented the email branch below it
// from ever running.

const notificationService = require('../notificationService');

describe('notificationService SMS contract', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    test('exports isSmsConfigured and sendSms as functions', () => {
        expect(typeof notificationService.isSmsConfigured).toBe('function');
        expect(typeof notificationService.sendSms).toBe('function');
    });

    test('isSmsConfigured returns false when no SMS provider is configured', () => {
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_FROM_NUMBER;

        expect(notificationService.isSmsConfigured()).toBe(false);
    });

    test('isSmsConfigured returns true only when every Twilio credential is present', () => {
        process.env.TWILIO_ACCOUNT_SID = 'AC_test';
        process.env.TWILIO_AUTH_TOKEN = 'token_test';
        delete process.env.TWILIO_FROM_NUMBER;

        // Partial configuration must not count as configured — a half-set provider
        // would let sendSms be called and fail at delivery time.
        expect(notificationService.isSmsConfigured()).toBe(false);

        process.env.TWILIO_FROM_NUMBER = '+15550001111';
        expect(notificationService.isSmsConfigured()).toBe(true);
    });

    test('sendSms rejects when SMS is not configured', async () => {
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_FROM_NUMBER;

        await expect(notificationService.sendSms('+15555550123', 'hello'))
            .rejects.toThrow(/SMS not configured/i);
    });

    test('isEmailConfigured and sendEmail remain exported', () => {
        expect(typeof notificationService.isEmailConfigured).toBe('function');
        expect(typeof notificationService.sendEmail).toBe('function');
        expect(typeof notificationService.formatScheduleEmailHtml).toBe('function');
    });
});
