// The integrity hash is bound to the SIGNING event, not the submit event.
// Admin re-submitting a rejected draft with unchanged signatures must NOT
// refresh the hash — that would launder post-signature edits. Only a fresh
// attestation (changed pca/recipient signatures) or a first-time submit
// computes it.

jest.mock('../../lib/prisma', () => ({
    timesheet: { findUnique: jest.fn(), update: jest.fn() },
    timesheetEntry: { update: jest.fn() },
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: () => [] }));

const prisma = require('../../lib/prisma');
const integrity = require('../../services/timesheetIntegrityService');
const { submitTimesheet, updateTimesheetStatus } = require('../timesheetController');

beforeAll(() => {
    process.env.INTEGRITY_KEY = 'c'.repeat(64);
});
beforeEach(() => jest.clearAllMocks());

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const adminReq = (body = {}) => ({
    params: { id: '5' },
    user: { id: 1, name: 'Admin', role: 'admin' },
    body,
});

function makeTimesheet(overrides = {}) {
    return {
        id: 5,
        clientId: 9,
        pcaName: 'Jane Smith',
        weekStart: new Date('2026-07-12T00:00:00.000Z'),
        recipientName: 'Mary Client',
        pcaFullName: 'Jane Smith',
        recipientSignature: 'sig-recipient',
        pcaSignature: 'sig-pca',
        supervisorSignature: '',
        status: 'draft',
        totalPasHours: 3,
        totalHmHours: 0,
        totalRespiteHours: 0,
        totalCompanionHours: 0,
        totalHours: 3,
        signedPayloadHash: '',
        signaturesHash: '',
        entries: [],
        client: { id: 9, clientName: 'Mary Client' },
        ...overrides,
    };
}

describe('submitTimesheet integrity binding', () => {
    it('computes and stores the hash on first submit (no prior hash)', async () => {
        const submitted = makeTimesheet({ status: 'submitted' });
        // 1st findUnique: existence check (draft); later calls: service refetch + response refetch
        prisma.timesheet.findUnique
            .mockResolvedValueOnce(makeTimesheet())
            .mockResolvedValue(submitted);
        prisma.timesheet.update.mockResolvedValue(submitted);

        await submitTimesheet(adminReq(), mockRes());

        // status update + integrity-hash update
        const hashUpdate = prisma.timesheet.update.mock.calls.find(
            ([args]) => args.data && args.data.signedPayloadHash !== undefined
        );
        expect(hashUpdate).toBeDefined();
        expect(hashUpdate[0].data.signedPayloadHash).toBe(integrity.computeHash(submitted));
    });

    it('does NOT recompute the hash when re-submitting with unchanged signatures', async () => {
        const original = makeTimesheet({ status: 'submitted' });
        const staleHash = 'stale-hash-from-original-signing';
        const resubmitted = makeTimesheet({
            status: 'submitted',
            totalPasHours: 12, // hours were edited during the draft round-trip
            totalHours: 12,
            signedPayloadHash: staleHash,
            signaturesHash: integrity.computeSignaturesHash(original), // same signatures
        });
        prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ signedPayloadHash: staleHash }));
        prisma.timesheet.update.mockResolvedValue(resubmitted);
        const res = mockRes();

        await submitTimesheet(adminReq(), res);

        const hashUpdate = prisma.timesheet.update.mock.calls.find(
            ([args]) => args.data && args.data.signedPayloadHash !== undefined
        );
        expect(hashUpdate).toBeUndefined();
        // The edited content no longer matches the original signing
        expect(res.json.mock.calls[0][0].integrityStatus).toBe('tampered');
    });

    it('recomputes the hash when the attesting signatures changed (fresh attestation)', async () => {
        const resubmitted = makeTimesheet({
            status: 'submitted',
            pcaSignature: 'sig-pca-NEW',
            signedPayloadHash: 'old-hash',
            signaturesHash: integrity.computeSignaturesHash(makeTimesheet()), // hash of the OLD signatures
        });
        prisma.timesheet.findUnique
            .mockResolvedValueOnce(makeTimesheet({ signedPayloadHash: 'old-hash' }))
            .mockResolvedValue(resubmitted);
        prisma.timesheet.update.mockResolvedValue(resubmitted);

        await submitTimesheet(adminReq(), mockRes());

        const hashUpdate = prisma.timesheet.update.mock.calls.find(
            ([args]) => args.data && args.data.signedPayloadHash !== undefined
        );
        expect(hashUpdate).toBeDefined();
        expect(hashUpdate[0].data.signedPayloadHash).toBe(integrity.computeHash(resubmitted));
    });
});

describe('updateTimesheetStatus integrity behavior', () => {
    it('reject → draft keeps signatures and the stored hash (tamper evidence survives)', async () => {
        const submitted = makeTimesheet({ status: 'submitted', signedPayloadHash: 'orig-hash', signaturesHash: 'orig-sigs' });
        prisma.timesheet.findUnique.mockResolvedValue(submitted);
        prisma.timesheet.update.mockResolvedValue(makeTimesheet({ status: 'draft', signedPayloadHash: 'orig-hash', signaturesHash: 'orig-sigs' }));

        await updateTimesheetStatus(adminReq({ status: 'rejected', correctionNote: 'fix day 3' }), mockRes());

        const [args] = prisma.timesheet.update.mock.calls[0];
        expect(args.data.status).toBe('draft');
        expect(args.data.signedPayloadHash).toBeUndefined();
        expect(args.data.recipientSignature).toBeUndefined();
        expect(args.data.pcaSignature).toBeUndefined();
    });

    it('status → submitted applies the same signing-event rule (no recompute for unchanged signatures)', async () => {
        const ts = makeTimesheet({ status: 'submitted', signedPayloadHash: 'orig-hash' });
        ts.signaturesHash = integrity.computeSignaturesHash(ts);
        prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'draft' }));
        prisma.timesheet.update.mockResolvedValue(ts);

        await updateTimesheetStatus(adminReq({ status: 'submitted' }), mockRes());

        const hashUpdate = prisma.timesheet.update.mock.calls.find(
            ([args]) => args.data && args.data.signedPayloadHash !== undefined
        );
        expect(hashUpdate).toBeUndefined();
    });
});
