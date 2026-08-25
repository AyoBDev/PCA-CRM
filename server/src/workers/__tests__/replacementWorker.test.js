// Tests for the offer-expiry worker — what happens when a response window
// closes with no answer.
//
// The worker must be safe to run twice on the same job: BullMQ retries, and a
// duplicate escalation could offer the same shift to two people at once.
//
// The job payload carries no agencyId (BullMQ jobs are enqueued from
// replacementService with just offerId/shiftId/calloutId), so the worker must
// resolve the offer's agency on the owner connection first, then do all real
// work inside runWithTenant with a per-agency tenantClient — same shape as
// the cron drivers (complianceCron, leadDormancySweep) and enterTokenTenant.

const mockTenantDb = {
    shiftOffer: { findUnique: jest.fn(), findMany: jest.fn() },
    shiftCallout: { findUnique: jest.fn(), update: jest.fn() },
    shift: { findUnique: jest.fn() },
};

jest.mock('../../lib/prisma', () => ({
    shiftOffer: { findUnique: jest.fn() },
}));

jest.mock('../../lib/tenantPrisma', () => ({
    tenantClient: jest.fn(),
}));

jest.mock('../../services/replacementService', () => ({
    expireOffer: jest.fn(),
    offerToCandidate: jest.fn(),
    resolveCallout: jest.fn(),
}));

jest.mock('../../services/candidateRankingService', () => ({ rankCandidates: jest.fn() }));
jest.mock('../../services/replacementSettings', () => ({ getReplacementSettings: jest.fn() }));

const prisma = require('../../lib/prisma');
const { tenantClient } = require('../../lib/tenantPrisma');
const replacement = require('../../services/replacementService');
const ranking = require('../../services/candidateRankingService');
const settings = require('../../services/replacementSettings');
const { handleOfferExpiry } = require('../replacementWorker');

const AGENCY_ID = 42;
const JOB = { offerId: 21, shiftId: 7, calloutId: 11 };

const SHIFT = {
    id: 7, clientId: 1, employeeId: null, serviceCode: 'PCS',
    shiftDate: new Date('2026-08-03T00:00:00Z'),
    startTime: '09:00', endTime: '13:00', status: 'pending_replacement',
};

beforeEach(() => {
    jest.clearAllMocks();
    tenantClient.mockReturnValue(mockTenantDb);
    // Resolving the job's agency is the one owner-connection read the worker
    // is allowed to make — everything else must go through the tenant client.
    prisma.shiftOffer.findUnique.mockResolvedValue({ id: 21, agencyId: AGENCY_ID });

    settings.getReplacementSettings.mockResolvedValue({ autoOfferEnabled: true, responseWindowMinutes: 10 });
    replacement.expireOffer.mockResolvedValue({ expired: true });
    replacement.offerToCandidate.mockResolvedValue({ delivered: true, offer: { id: 22 } });
    mockTenantDb.shift.findUnique.mockResolvedValue(SHIFT);
    mockTenantDb.shiftCallout.findUnique.mockResolvedValue({ id: 11, shiftId: 7, resolution: 'open' });
    mockTenantDb.shiftOffer.findMany.mockResolvedValue([{ employeeId: 5 }]);
    ranking.rankCandidates.mockResolvedValue({
        status: 'ok',
        eligible: [
            { employeeId: 5, rank: 1, scoreBreakdown: {} },
            { employeeId: 6, rank: 2, scoreBreakdown: {} },
        ],
        ineligible: [],
    });
});

describe('handleOfferExpiry', () => {
    test('resolves the job agency on the owner connection, then works entirely on a tenant client', async () => {
        await handleOfferExpiry(JOB);

        expect(prisma.shiftOffer.findUnique).toHaveBeenCalledWith({
            where: { id: 21 },
            select: { agencyId: true },
        });
        expect(tenantClient).toHaveBeenCalledWith(AGENCY_ID);
        expect(replacement.expireOffer).toHaveBeenCalledWith(mockTenantDb, 21);
    });

    test('expires the offer and advances to the next unoffered candidate', async () => {
        await handleOfferExpiry(JOB);

        expect(replacement.expireOffer).toHaveBeenCalledWith(mockTenantDb, 21);
        expect(replacement.offerToCandidate).toHaveBeenCalledWith(
            mockTenantDb, 7, 6, expect.objectContaining({ calloutId: 11 }),
        );
    });

    test('stops when the offer was answered before the job fired', async () => {
        replacement.expireOffer.mockResolvedValue({ expired: false });

        await handleOfferExpiry(JOB);

        // A caregiver answering microseconds before the timer must not have
        // their acceptance trampled by an escalation.
        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });

    test('stops when the job offer no longer resolves to an agency', async () => {
        prisma.shiftOffer.findUnique.mockResolvedValue(null);

        await expect(handleOfferExpiry(JOB)).resolves.toBeUndefined();
        expect(tenantClient).not.toHaveBeenCalled();
        expect(replacement.expireOffer).not.toHaveBeenCalled();
    });

    test('stops when the shift is no longer pending replacement', async () => {
        mockTenantDb.shift.findUnique.mockResolvedValue({ ...SHIFT, status: 'scheduled' });

        await handleOfferExpiry(JOB);

        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });

    test('stops when the callout has already been resolved', async () => {
        mockTenantDb.shiftCallout.findUnique.mockResolvedValue({ id: 11, resolution: 'filled' });

        await handleOfferExpiry(JOB);

        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });

    test('never re-offers to someone who already had a turn', async () => {
        mockTenantDb.shiftOffer.findMany.mockResolvedValue([{ employeeId: 5 }, { employeeId: 6 }]);

        await handleOfferExpiry(JOB);

        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
        expect(replacement.resolveCallout).toHaveBeenCalledWith(mockTenantDb, 11, 'no_coverage');
    });

    test('resolves no_coverage when the candidate list is exhausted', async () => {
        ranking.rankCandidates.mockResolvedValue({ status: 'ok', eligible: [{ employeeId: 5, rank: 1 }], ineligible: [] });

        await handleOfferExpiry(JOB);

        expect(replacement.resolveCallout).toHaveBeenCalledWith(mockTenantDb, 11, 'no_coverage');
    });

    test('skips an undeliverable candidate and tries the one after', async () => {
        ranking.rankCandidates.mockResolvedValue({
            status: 'ok',
            eligible: [
                { employeeId: 5, rank: 1, scoreBreakdown: {} },
                { employeeId: 6, rank: 2, scoreBreakdown: {} },
                { employeeId: 8, rank: 3, scoreBreakdown: {} },
            ],
            ineligible: [],
        });
        replacement.offerToCandidate
            .mockResolvedValueOnce({ skipped: true, reason: 'inactive' })
            .mockResolvedValueOnce({ delivered: true, offer: { id: 23 } });

        await handleOfferExpiry(JOB);

        // A candidate who went inactive must not consume the escalation; the
        // loop should reach a real person on the same tick.
        expect(replacement.offerToCandidate).toHaveBeenCalledTimes(2);
        expect(replacement.offerToCandidate.mock.calls[1][2]).toBe(8);
    });

    test('re-ranks rather than trusting the original ordering', async () => {
        await handleOfferExpiry(JOB);

        // Availability changes while a window is open — someone free ten
        // minutes ago may be booked now.
        expect(ranking.rankCandidates).toHaveBeenCalledWith(
            mockTenantDb,
            expect.objectContaining({ clientId: 1, startTime: '09:00' }),
            expect.objectContaining({ mode: 'strict' }),
        );
    });

    test('tolerates a missing shift without throwing', async () => {
        mockTenantDb.shift.findUnique.mockResolvedValue(null);

        await expect(handleOfferExpiry(JOB)).resolves.toBeUndefined();
        expect(replacement.offerToCandidate).not.toHaveBeenCalled();
    });
});
