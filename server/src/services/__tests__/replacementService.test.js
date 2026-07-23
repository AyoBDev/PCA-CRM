// Tests for the replacement orchestration service.
//
// The risk this file exists to guard against is DOUBLE-FILLING: two caregivers
// accepting the same shift, or a duplicate/retried job advancing an offer that
// was already answered. Every state transition must be guarded at the database
// level, not by reading-then-writing in application code.

jest.mock('../../lib/prisma', () => ({
    shift: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    shiftOffer: {
        create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
        update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(),
    },
    shiftCallout: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    employee: { findUnique: jest.fn() },
}));

jest.mock('../candidateRankingService', () => ({ rankCandidates: jest.fn() }));
jest.mock('../offerChannels', () => ({ sendOffer: jest.fn() }));
jest.mock('../../lib/queue', () => ({ schedule: jest.fn(), cancel: jest.fn(), isEnabled: jest.fn(() => true) }));
jest.mock('../auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const prisma = require('../../lib/prisma');
const ranking = require('../candidateRankingService');
const channels = require('../offerChannels');
const queue = require('../../lib/queue');
const replacement = require('../replacementService');

const SHIFT = {
    id: 7,
    clientId: 1,
    employeeId: 3,
    serviceCode: 'PCS',
    shiftDate: new Date('2026-08-03T00:00:00Z'),
    startTime: '09:00',
    endTime: '13:00',
    status: 'scheduled',
    client: { id: 1, clientName: 'Jane Doe', address: '123 Main St' },
};

const CANDIDATE = (id, rank) => ({
    employeeId: id,
    employeeName: `Emp ${id}`,
    rank,
    score: 100 - rank,
    scoreBreakdown: { careTeam: 0, availabilityWindow: 40, proximity: 20, weeklyLoad: 10 },
    distanceMiles: rank,
    conflicts: [],
});

beforeEach(() => {
    jest.clearAllMocks();
    prisma.shift.findUnique.mockResolvedValue(SHIFT);
    prisma.shift.update.mockResolvedValue({ ...SHIFT, status: 'pending_replacement' });
    prisma.shift.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftCallout.create.mockResolvedValue({ id: 11, shiftId: 7, resolution: 'open' });
    prisma.shiftOffer.create.mockResolvedValue({ id: 21, token: 'tok-21', shiftId: 7, employeeId: 5 });
    prisma.shiftOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.employee.findUnique.mockResolvedValue({ id: 5, name: 'Emp 5', email: 'e5@example.com', active: true });
    ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [CANDIDATE(5, 1), CANDIDATE(6, 2)], ineligible: [] });
    channels.sendOffer.mockResolvedValue({ delivered: ['portal'], failed: [], anyDelivered: true });
});

describe('recordCallout', () => {
    test('marks the shift pending_replacement and opens a callout', async () => {
        const result = await replacement.recordCallout(7, { reason: 'sick', reportedById: 2 });

        expect(prisma.shift.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 7 },
            data: expect.objectContaining({ status: 'pending_replacement' }),
        }));
        expect(result.callout.id).toBe(11);
        expect(result.candidates).toHaveLength(2);
    });

    test('ranks in strict mode, excluding the caregiver who called out', async () => {
        await replacement.recordCallout(7, {});

        expect(ranking.rankCandidates).toHaveBeenCalledWith(
            expect.objectContaining({ clientId: 1, excludeEmployeeId: 3, startTime: '09:00', endTime: '13:00' }),
            expect.objectContaining({ mode: 'strict' }),
        );
    });

    test('does not send any offer — recording a callout only ranks', async () => {
        await replacement.recordCallout(7, {});

        // v1 ships shadow-mode-first: the owner reviews the ranked list and
        // chooses. Auto-offering happens only behind the feature flag.
        expect(channels.sendOffer).not.toHaveBeenCalled();
    });

    test('resolves no_coverage immediately when nobody is eligible', async () => {
        ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [], ineligible: [] });

        const result = await replacement.recordCallout(7, {});

        expect(result.noCoverage).toBe(true);
    });

    test('rejects a shift that is already pending replacement', async () => {
        prisma.shift.findUnique.mockResolvedValue({ ...SHIFT, status: 'pending_replacement' });

        await expect(replacement.recordCallout(7, {})).rejects.toThrow(/already/i);
    });

    test('rejects a missing shift', async () => {
        prisma.shift.findUnique.mockResolvedValue(null);

        await expect(replacement.recordCallout(404, {})).rejects.toThrow(/not found/i);
    });
});

describe('offerToCandidate', () => {
    test('records the offer with its rank and score breakdown', async () => {
        await replacement.offerToCandidate(7, 5, { calloutId: 11, rank: 1, scoreBreakdown: { careTeam: 100 } });

        expect(prisma.shiftOffer.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                shiftId: 7, employeeId: 5, calloutId: 11, rank: 1,
                scoreBreakdown: { careTeam: 100 },
                offeredAt: expect.any(Date),
                expiresAt: expect.any(Date),
            }),
        }));
    });

    test('re-checks that the candidate is still active immediately before sending', async () => {
        prisma.employee.findUnique.mockResolvedValue({ id: 5, name: 'Gone', active: false });

        const result = await replacement.offerToCandidate(7, 5, {});

        // Someone can be deactivated between ranking and offering; sending them
        // a shift they can no longer work wastes the response window.
        expect(result.skipped).toBe(true);
        expect(result.reason).toBe('inactive');
        expect(channels.sendOffer).not.toHaveBeenCalled();
    });

    test('schedules an expiry job keyed to the offer id', async () => {
        await replacement.offerToCandidate(7, 5, { responseWindowMinutes: 10 });

        expect(queue.schedule).toHaveBeenCalledWith(
            'offer-expiry',
            expect.objectContaining({ offerId: 21 }),
            10 * 60 * 1000,
            'offer-21',
        );
    });

    test('marks the offer failed when no channel could deliver it', async () => {
        channels.sendOffer.mockResolvedValue({ delivered: [], failed: [{ channel: 'email', error: 'bounced' }], anyDelivered: false });

        const result = await replacement.offerToCandidate(7, 5, {});

        expect(result.delivered).toBe(false);
        expect(prisma.shiftOffer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ response: 'skipped' }),
        }));
    });
});

describe('acceptOffer — the double-fill guard', () => {
    const OPEN_OFFER = {
        id: 21, token: 'tok-21', shiftId: 7, employeeId: 5, calloutId: 11,
        response: '', offeredAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
        shift: { ...SHIFT, status: 'pending_replacement' },
    };

    beforeEach(() => {
        prisma.shiftOffer.findUnique.mockResolvedValue(OPEN_OFFER);
    });

    test('assigns the shift and marks the offer accepted', async () => {
        const result = await replacement.acceptOffer('tok-21');

        expect(result.status).toBe('accepted');
        expect(prisma.shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 7, status: 'pending_replacement' }),
            data: expect.objectContaining({ employeeId: 5, status: 'scheduled' }),
        }));
    });

    test('claims the shift with a conditional update, not a read-then-write', async () => {
        await replacement.acceptOffer('tok-21');

        // The status predicate in the WHERE clause is the entire concurrency
        // guarantee: two simultaneous accepts both attempt it, and the database
        // lets exactly one match.
        const where = prisma.shift.updateMany.mock.calls[0][0].where;
        expect(where.status).toBe('pending_replacement');
    });

    test('the second of two simultaneous accepts is told it was already covered', async () => {
        prisma.shift.updateMany.mockResolvedValue({ count: 0 }); // lost the race

        const result = await replacement.acceptOffer('tok-21');

        expect(result.status).toBe('already_filled');
        expect(prisma.shiftOffer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ response: 'expired' }),
        }));
    });

    test('cancels the pending expiry job on a successful accept', async () => {
        await replacement.acceptOffer('tok-21');

        expect(queue.cancel).toHaveBeenCalledWith('offer-21');
    });

    test('expires the remaining outstanding offers once one is accepted', async () => {
        await replacement.acceptOffer('tok-21');

        expect(prisma.shiftOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ shiftId: 7, id: { not: 21 }, response: '' }),
            data: expect.objectContaining({ response: 'expired' }),
        }));
    });

    test('resolves the callout as filled', async () => {
        await replacement.acceptOffer('tok-21');

        expect(prisma.shiftCallout.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 11 },
            data: expect.objectContaining({ resolution: 'filled', resolvedAt: expect.any(Date) }),
        }));
    });

    test('rejects an unknown token', async () => {
        prisma.shiftOffer.findUnique.mockResolvedValue(null);

        const result = await replacement.acceptOffer('nope');

        expect(result.status).toBe('not_found');
    });

    test('rejects a late reply after the window closed', async () => {
        prisma.shiftOffer.findUnique.mockResolvedValue({
            ...OPEN_OFFER, expiresAt: new Date(Date.now() - 60_000),
        });

        const result = await replacement.acceptOffer('tok-21');

        expect(result.status).toBe('expired');
        expect(prisma.shift.updateMany).not.toHaveBeenCalled();
    });

    test('rejects an offer that was already answered', async () => {
        prisma.shiftOffer.findUnique.mockResolvedValue({ ...OPEN_OFFER, response: 'declined' });

        const result = await replacement.acceptOffer('tok-21');

        expect(result.status).toBe('already_answered');
        expect(prisma.shift.updateMany).not.toHaveBeenCalled();
    });
});

describe('declineOffer', () => {
    test('records the decline and leaves the shift unfilled', async () => {
        prisma.shiftOffer.findUnique.mockResolvedValue({
            id: 21, token: 'tok-21', shiftId: 7, employeeId: 5, response: '',
            expiresAt: new Date(Date.now() + 60_000), shift: { ...SHIFT, status: 'pending_replacement' },
        });

        const result = await replacement.declineOffer('tok-21');

        expect(result.status).toBe('declined');
        expect(prisma.shift.updateMany).not.toHaveBeenCalled();
        expect(queue.cancel).toHaveBeenCalledWith('offer-21');
    });
});

describe('expireOffer', () => {
    test('marks an unanswered offer expired', async () => {
        prisma.shiftOffer.updateMany.mockResolvedValue({ count: 1 });

        const result = await replacement.expireOffer(21);

        expect(result.expired).toBe(true);
        // Guarded on response:'' so a job that fires just after the caregiver
        // accepted cannot overwrite their answer.
        expect(prisma.shiftOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 21, response: '' }),
        }));
    });

    test('does nothing when the offer was already answered', async () => {
        prisma.shiftOffer.updateMany.mockResolvedValue({ count: 0 });

        const result = await replacement.expireOffer(21);

        expect(result.expired).toBe(false);
    });
});
