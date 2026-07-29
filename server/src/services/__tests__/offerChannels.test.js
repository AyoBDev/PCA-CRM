// Tests for the offer channel adapters.
//
// Every channel implements the same three-member contract:
//   { name, isConfigured(): boolean, send(offer, context): Promise<void> }
// so adding SMS later is a new file, not a change to the offer engine.
//
// Delivery failures must be reported, never thrown: one unreachable caregiver
// must not abort a replacement workflow that still has candidates to try.

jest.mock('../../lib/prisma', () => ({
    notification: { create: jest.fn() },
}));

jest.mock('../../services/complianceService', () => ({
    createNotification: jest.fn(),
}));

const prisma = require('../../lib/prisma');
const complianceService = require('../../services/complianceService');
const notificationService = require('../notificationService');
const portalChannel = require('../offerChannels/portalChannel');
const emailChannel = require('../offerChannels/emailChannel');
const channels = require('../offerChannels');

const OFFER = {
    id: 42,
    token: 'offer-token-xyz',
    shiftId: 7,
    employeeId: 3,
    expiresAt: new Date('2026-08-03T10:00:00Z'),
};

const CONTEXT = {
    employee: { id: 3, name: 'Sam Carer', email: 'sam@example.com', phone: '+15555550123' },
    client: { clientName: 'Jane Doe', address: '123 Main St' },
    shift: {
        shiftDate: new Date('2026-08-03T00:00:00Z'),
        startTime: '09:00',
        endTime: '13:00',
        serviceCode: 'PCS',
    },
};

const ORIGINAL_ENV = process.env;

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV, APP_URL: 'https://app.example.com' };
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('channel contract', () => {
    test.each([
        ['portal', portalChannel],
        ['email', emailChannel],
    ])('%s implements name, isConfigured and send', (name, channel) => {
        expect(channel.name).toBe(name);
        expect(typeof channel.isConfigured).toBe('function');
        expect(typeof channel.send).toBe('function');
    });
});

describe('portalChannel', () => {
    test('is always configured — it needs no external provider', () => {
        expect(portalChannel.isConfigured()).toBe(true);
    });

    test('creates an in-app notification naming the client and time', async () => {
        complianceService.createNotification.mockResolvedValue({ id: 1 });

        await portalChannel.send(OFFER, CONTEXT);

        expect(complianceService.createNotification).toHaveBeenCalledWith(
            3,
            'shift_offer',
            expect.stringMatching(/shift/i),
            expect.stringContaining('Jane Doe'),
        );
        const body = complianceService.createNotification.mock.calls[0][3];
        expect(body).toContain('9:00 AM');
    });

    test('reuses createNotification so the realtime socket event still fires', async () => {
        complianceService.createNotification.mockResolvedValue({ id: 1 });

        await portalChannel.send(OFFER, CONTEXT);

        // Writing prisma.notification directly would skip emitToEmployee and
        // the caregiver's app would not update until a manual refresh.
        expect(prisma.notification.create).not.toHaveBeenCalled();
    });
});

describe('emailChannel', () => {
    test('is configured only when email is configured', () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(false);
        expect(emailChannel.isConfigured()).toBe(false);

        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        expect(emailChannel.isConfigured()).toBe(true);
    });

    test('sends an accept link built from the offer token', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        const sendEmail = jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({});

        await emailChannel.send(OFFER, CONTEXT);

        const [to, subject, html, text] = sendEmail.mock.calls[0];
        expect(to).toBe('sam@example.com');
        expect(subject).toMatch(/shift/i);
        expect(html).toContain('https://app.example.com/shift-offers/offer-token-xyz');
        expect(html).toContain('Jane Doe');
        // A plain-text alternative matters: many caregivers read on phones with
        // images or HTML disabled.
        expect(text).toContain('offer-token-xyz');
    });

    test('states when the offer expires so the caregiver knows it is time-boxed', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        const sendEmail = jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({});

        await emailChannel.send(OFFER, CONTEXT);

        expect(sendEmail.mock.calls[0][2]).toMatch(/expires/i);
    });

    test('rejects when the employee has no email address', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);

        await expect(
            emailChannel.send(OFFER, { ...CONTEXT, employee: { ...CONTEXT.employee, email: '' } }),
        ).rejects.toThrow(/email/i);
    });
});

describe('resolveChannels', () => {
    test('returns only configured channels, portal first', () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);

        const resolved = channels.resolveChannels();

        expect(resolved.map(c => c.name)).toEqual(['portal', 'email']);
    });

    test('omits email when it is not configured', () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(false);

        expect(channels.resolveChannels().map(c => c.name)).toEqual(['portal']);
    });
});

describe('sendOffer', () => {
    test('reports per-channel results rather than throwing on failure', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        complianceService.createNotification.mockResolvedValue({ id: 1 });
        jest.spyOn(notificationService, 'sendEmail').mockRejectedValue(new Error('brevo down'));

        const result = await channels.sendOffer(OFFER, CONTEXT);

        // One dead channel must not abort a workflow that still has candidates.
        expect(result.delivered).toEqual(['portal']);
        expect(result.failed).toEqual([{ channel: 'email', error: 'brevo down' }]);
    });

    test('reports delivery when every channel succeeds', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(true);
        complianceService.createNotification.mockResolvedValue({ id: 1 });
        jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({});

        const result = await channels.sendOffer(OFFER, CONTEXT);

        expect(result.delivered).toEqual(['portal', 'email']);
        expect(result.failed).toEqual([]);
    });

    test('surfaces total failure so the caller can skip to the next candidate', async () => {
        jest.spyOn(notificationService, 'isEmailConfigured').mockReturnValue(false);
        complianceService.createNotification.mockRejectedValue(new Error('db down'));

        const result = await channels.sendOffer(OFFER, CONTEXT);

        expect(result.delivered).toEqual([]);
        expect(result.anyDelivered).toBe(false);
    });
});
