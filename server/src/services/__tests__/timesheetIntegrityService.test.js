// The integrity hash binds the PCA/recipient signatures to the persisted
// timesheet content: any post-signature edit to hours, activities, times, or
// the attesting signatures themselves must surface as 'tampered'.

const mockDb = {
    timesheet: { findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../../lib/tenantContext', () => ({
    getTenantDb: jest.fn(() => mockDb),
}));

const prisma = mockDb;
const {
    buildCanonicalPayload,
    computeHash,
    computeSignaturesHash,
    computeAndStoreIntegrityHash,
    verifyTimesheetIntegrity,
} = require('../timesheetIntegrityService');

beforeAll(() => {
    process.env.INTEGRITY_KEY = 'b'.repeat(64);
});
beforeEach(() => jest.clearAllMocks());

function makeEntry(overrides = {}) {
    return {
        dayOfWeek: 0,
        dateOfService: '2026-07-12',
        adlActivities: '{"Bathing":true}',
        adlTimeIn: '09:00',
        adlTimeOut: '12:00',
        adlHours: 3,
        adlPcaInitials: 'JS',
        adlClientInitials: 'MK',
        adlTimeBlocks: '[]',
        iadlActivities: '{}',
        iadlTimeIn: null,
        iadlTimeOut: null,
        iadlHours: 0,
        iadlPcaInitials: '',
        iadlClientInitials: '',
        iadlTimeBlocks: '[]',
        respiteActivities: '{}',
        respiteTimeIn: null,
        respiteTimeOut: null,
        respiteHours: 0,
        respitePcaInitials: '',
        respiteClientInitials: '',
        respiteTimeBlocks: '[]',
        companionActivities: '{}',
        companionTimeIn: null,
        companionTimeOut: null,
        companionHours: 0,
        companionPcaInitials: '',
        companionClientInitials: '',
        companionTimeBlocks: '[]',
        ...overrides,
    };
}

function makeTimesheet(overrides = {}) {
    return {
        id: 5,
        clientId: 9,
        pcaName: 'Jane Smith',
        weekStart: new Date('2026-07-12T00:00:00.000Z'),
        recipientName: 'Mary Client',
        pcaFullName: 'Jane Smith',
        recipientSignature: 'data:image/png;base64,recipient',
        pcaSignature: 'data:image/png;base64,pca',
        supervisorSignature: '',
        submittedAt: new Date('2026-07-17T10:00:00.000Z'),
        status: 'submitted',
        totalPasHours: 3,
        totalHmHours: 0,
        totalRespiteHours: 0,
        totalCompanionHours: 0,
        totalHours: 3,
        entries: [makeEntry()],
        ...overrides,
    };
}

describe('computeHash', () => {
    it('is deterministic for identical content', () => {
        expect(computeHash(makeTimesheet())).toBe(computeHash(makeTimesheet()));
    });

    it('is independent of entry array order (sorts by dayOfWeek)', () => {
        const e0 = makeEntry({ dayOfWeek: 0 });
        const e1 = makeEntry({ dayOfWeek: 1, adlHours: 2 });
        const a = makeTimesheet({ entries: [e0, e1] });
        const b = makeTimesheet({ entries: [e1, e0] });
        expect(computeHash(a)).toBe(computeHash(b));
    });

    it('changes when an entry\'s hours change', () => {
        const original = computeHash(makeTimesheet());
        const edited = computeHash(makeTimesheet({ entries: [makeEntry({ adlHours: 7, adlTimeOut: '16:00' })] }));
        expect(edited).not.toBe(original);
    });

    it('changes when a time-in changes', () => {
        const original = computeHash(makeTimesheet());
        const edited = computeHash(makeTimesheet({ entries: [makeEntry({ adlTimeIn: '08:00' })] }));
        expect(edited).not.toBe(original);
    });

    it('changes when activities change', () => {
        const original = computeHash(makeTimesheet());
        const edited = computeHash(makeTimesheet({ entries: [makeEntry({ adlActivities: '{"Bathing":true,"Dressing":true}' })] }));
        expect(edited).not.toBe(original);
    });

    it('changes when an attesting signature is swapped', () => {
        const original = computeHash(makeTimesheet());
        const swapped = computeHash(makeTimesheet({ pcaSignature: 'data:image/png;base64,forged' }));
        expect(swapped).not.toBe(original);
    });

    it('changes when totals change', () => {
        const original = computeHash(makeTimesheet());
        const edited = computeHash(makeTimesheet({ totalPasHours: 40, totalHours: 40 }));
        expect(edited).not.toBe(original);
    });

    it('does NOT change for workflow-only fields (status, submittedAt, correctionNote)', () => {
        const original = computeHash(makeTimesheet());
        const restamped = computeHash(makeTimesheet({
            status: 'accepted',
            submittedAt: new Date('2026-07-20T08:00:00.000Z'),
            acceptedAt: new Date(),
            correctionNote: 'please fix',
        }));
        expect(restamped).toBe(original);
    });

    it('does NOT change when the supervisor counter-signs later', () => {
        const original = computeHash(makeTimesheet());
        const countersigned = computeHash(makeTimesheet({ supervisorSignature: 'data:image/png;base64,supervisor' }));
        expect(countersigned).toBe(original);
    });
});

describe('computeSignaturesHash', () => {
    it('changes when the PCA or recipient re-signs', () => {
        const original = computeSignaturesHash(makeTimesheet());
        expect(computeSignaturesHash(makeTimesheet({ pcaSignature: 'new-sig' }))).not.toBe(original);
        expect(computeSignaturesHash(makeTimesheet({ recipientSignature: 'new-sig' }))).not.toBe(original);
    });

    it('ignores the supervisor signature', () => {
        const original = computeSignaturesHash(makeTimesheet());
        expect(computeSignaturesHash(makeTimesheet({ supervisorSignature: 'sup-sig' }))).toBe(original);
    });
});

describe('verifyTimesheetIntegrity', () => {
    it('returns unsigned when no hash is stored', () => {
        expect(verifyTimesheetIntegrity(makeTimesheet({ signedPayloadHash: '' }))).toBe('unsigned');
        expect(verifyTimesheetIntegrity(makeTimesheet({ signedPayloadHash: undefined }))).toBe('unsigned');
    });

    it('returns valid when content matches the stored hash', () => {
        const ts = makeTimesheet();
        ts.signedPayloadHash = computeHash(ts);
        expect(verifyTimesheetIntegrity(ts)).toBe('valid');
    });

    it('returns tampered when hours were edited after signing', () => {
        const ts = makeTimesheet();
        ts.signedPayloadHash = computeHash(ts);
        ts.entries = [makeEntry({ adlHours: 12, adlTimeOut: '21:00' })];
        ts.totalPasHours = 12;
        ts.totalHours = 12;
        expect(verifyTimesheetIntegrity(ts)).toBe('tampered');
    });
});

describe('computeAndStoreIntegrityHash', () => {
    it('re-fetches persisted state, stores both hashes and hashedAt', async () => {
        const ts = makeTimesheet();
        prisma.timesheet.findUnique.mockResolvedValue(ts);
        prisma.timesheet.update.mockResolvedValue({});

        const hash = await computeAndStoreIntegrityHash(5);

        expect(prisma.timesheet.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
        expect(hash).toBe(computeHash(ts));
        expect(prisma.timesheet.update).toHaveBeenCalledWith({
            where: { id: 5 },
            data: {
                signedPayloadHash: computeHash(ts),
                signaturesHash: computeSignaturesHash(ts),
                hashedAt: expect.any(Date),
            },
        });
    });

    it('returns null for a missing timesheet', async () => {
        prisma.timesheet.findUnique.mockResolvedValue(null);
        expect(await computeAndStoreIntegrityHash(999)).toBeNull();
        expect(prisma.timesheet.update).not.toHaveBeenCalled();
    });
});

describe('buildCanonicalPayload', () => {
    it('normalizes null/undefined block fields to stable defaults', () => {
        const sparse = makeTimesheet({
            entries: [{ dayOfWeek: 3, dateOfService: null, adlHours: '2' }],
        });
        const full = makeTimesheet({
            entries: [makeEntry({
                dayOfWeek: 3, dateOfService: '', adlActivities: '{}', adlTimeIn: null, adlTimeOut: null,
                adlHours: 2, adlPcaInitials: '', adlClientInitials: '',
            })],
        });
        expect(JSON.stringify(buildCanonicalPayload(sparse))).toBe(JSON.stringify(buildCanonicalPayload(full)));
    });
});
