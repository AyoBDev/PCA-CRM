// Tests for the BullMQ queue wrapper.
//
// Redis is optional by design: production gets a Railway Redis service, but
// local dev, CI and Jest must run with REDIS_URL unset. When it is absent the
// queue degrades to a disabled no-op rather than crashing at import time or
// silently pretending work was scheduled.

const ORIGINAL_ENV = process.env;

beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL;
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('without REDIS_URL', () => {
    test('reports itself disabled instead of throwing at import', () => {
        const queue = require('../queue');

        expect(queue.isEnabled()).toBe(false);
    });

    test('schedule() resolves falsy so callers can detect it did not queue', async () => {
        const queue = require('../queue');

        const job = await queue.schedule('offer-expiry', { offerId: 1 }, 600_000);

        // A caller that assumed success here would leave an offer that never
        // expires. Returning null makes the degraded path visible.
        expect(job).toBeNull();
    });

    test('cancel() resolves false rather than erroring', async () => {
        const queue = require('../queue');

        await expect(queue.cancel('offer-1')).resolves.toBe(false);
    });
});

describe('with REDIS_URL', () => {
    const addMock = jest.fn();
    const removeMock = jest.fn();
    const getJobMock = jest.fn();

    beforeEach(() => {
        jest.doMock('bullmq', () => ({
            Queue: jest.fn().mockImplementation(() => ({
                add: addMock,
                getJob: getJobMock,
            })),
            Worker: jest.fn(),
        }));
        process.env.REDIS_URL = 'redis://localhost:6379';
        addMock.mockReset().mockResolvedValue({ id: 'job-1' });
        removeMock.mockReset().mockResolvedValue(undefined);
        getJobMock.mockReset();
    });

    afterEach(() => {
        jest.dontMock('bullmq');
    });

    test('reports itself enabled', () => {
        const queue = require('../queue');

        expect(queue.isEnabled()).toBe(true);
    });

    test('schedules a delayed job with a stable id', async () => {
        const queue = require('../queue');

        await queue.schedule('offer-expiry', { offerId: 42 }, 600_000, 'offer-42');

        expect(addMock).toHaveBeenCalledWith(
            'offer-expiry',
            { offerId: 42 },
            expect.objectContaining({ delay: 600_000, jobId: 'offer-42' }),
        );
    });

    test('a stable job id makes rescheduling idempotent', async () => {
        const queue = require('../queue');

        await queue.schedule('offer-expiry', { offerId: 42 }, 1000, 'offer-42');
        await queue.schedule('offer-expiry', { offerId: 42 }, 1000, 'offer-42');

        // BullMQ dedupes on jobId, so a retried trigger cannot double-expire an
        // offer. Both calls must therefore pass the same id.
        expect(addMock.mock.calls.every(c => c[2].jobId === 'offer-42')).toBe(true);
    });

    test('cancel removes a pending job', async () => {
        getJobMock.mockResolvedValue({ remove: removeMock });
        const queue = require('../queue');

        const result = await queue.cancel('offer-42');

        expect(getJobMock).toHaveBeenCalledWith('offer-42');
        expect(removeMock).toHaveBeenCalled();
        expect(result).toBe(true);
    });

    test('cancel resolves false when the job has already run', async () => {
        getJobMock.mockResolvedValue(null);
        const queue = require('../queue');

        await expect(queue.cancel('offer-gone')).resolves.toBe(false);
    });

    test('a scheduling failure resolves null rather than propagating', async () => {
        addMock.mockRejectedValue(new Error('redis unreachable'));
        const queue = require('../queue');

        // Redis going down must not fail the callout request that triggered it;
        // the offer is still recorded and can be advanced manually.
        await expect(queue.schedule('offer-expiry', {}, 1000, 'offer-1')).resolves.toBeNull();
    });
});
