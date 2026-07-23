// Tests for the replacement feature flag.
//
// Reuses the existing WorkflowTrigger row rather than inventing a new
// mechanism: it already has enabled/thresholdDays plus admin UI. `enabled`
// gates auto-offering, `thresholdDays` carries responseWindowMinutes.
//
// The safety property that matters: when the flag row is missing, unreadable,
// or the DB is down, auto-offering must default to OFF. Failing open would
// start texting caregivers because a query failed.

jest.mock('../../lib/prisma', () => ({
    workflowTrigger: { findFirst: jest.fn() },
}));

const prisma = require('../../lib/prisma');
const settings = require('../replacementSettings');

beforeEach(() => {
    jest.clearAllMocks();
    settings._resetCache();
});

describe('getReplacementSettings', () => {
    test('reads the shift_replacement trigger row', async () => {
        prisma.workflowTrigger.findFirst.mockResolvedValue({ id: 1, type: 'shift_replacement', enabled: true, thresholdDays: 15 });

        const s = await settings.getReplacementSettings();

        expect(prisma.workflowTrigger.findFirst).toHaveBeenCalledWith({ where: { type: 'shift_replacement' } });
        expect(s.autoOfferEnabled).toBe(true);
        expect(s.responseWindowMinutes).toBe(15);
    });

    test('defaults to auto-offer OFF when the trigger row is missing', async () => {
        prisma.workflowTrigger.findFirst.mockResolvedValue(null);

        const s = await settings.getReplacementSettings();

        // Absent configuration must never mean "start messaging people".
        expect(s.autoOfferEnabled).toBe(false);
        expect(s.responseWindowMinutes).toBe(10);
    });

    test('defaults to auto-offer OFF when the lookup throws', async () => {
        prisma.workflowTrigger.findFirst.mockRejectedValue(new Error('db down'));

        const s = await settings.getReplacementSettings();

        expect(s.autoOfferEnabled).toBe(false);
        expect(s.responseWindowMinutes).toBe(10);
    });

    test('falls back to the default window when thresholdDays is unusable', async () => {
        for (const bad of [0, null, undefined, -5]) {
            settings._resetCache();
            prisma.workflowTrigger.findFirst.mockResolvedValue({ enabled: true, thresholdDays: bad });

            const s = await settings.getReplacementSettings();

            // A zero-minute window would expire every offer instantly.
            expect(s.responseWindowMinutes).toBe(10);
        }
    });

    test('honours a disabled trigger', async () => {
        prisma.workflowTrigger.findFirst.mockResolvedValue({ enabled: false, thresholdDays: 10 });

        expect((await settings.getReplacementSettings()).autoOfferEnabled).toBe(false);
    });

    test('caches so the offer loop does not re-query per candidate', async () => {
        prisma.workflowTrigger.findFirst.mockResolvedValue({ enabled: true, thresholdDays: 10 });

        await settings.getReplacementSettings();
        await settings.getReplacementSettings();

        expect(prisma.workflowTrigger.findFirst).toHaveBeenCalledTimes(1);
    });

    test('invalidate() forces a re-read so an admin toggle takes effect', async () => {
        prisma.workflowTrigger.findFirst.mockResolvedValue({ enabled: false, thresholdDays: 10 });
        expect((await settings.getReplacementSettings()).autoOfferEnabled).toBe(false);

        prisma.workflowTrigger.findFirst.mockResolvedValue({ enabled: true, thresholdDays: 20 });
        settings.invalidate();

        const s = await settings.getReplacementSettings();
        expect(s.autoOfferEnabled).toBe(true);
        expect(s.responseWindowMinutes).toBe(20);
    });
});
