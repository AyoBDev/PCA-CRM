// Unit tests for audit-log retention. prisma is mocked so no DB is needed.

jest.mock('../../lib/prisma', () => ({
    auditLog: { deleteMany: jest.fn() },
}));
jest.mock('../../lib/tenantContext', () => ({
    getAgencyId: () => null,
    getImpersonatorId: () => null,
}));

const prisma = require('../../lib/prisma');
const { resolveRetentionDays, purgeExpiredLogs } = require('../auditService');

describe('resolveRetentionDays', () => {
    const OLD = process.env.AUDIT_LOG_RETENTION_DAYS;
    afterEach(() => {
        if (OLD === undefined) delete process.env.AUDIT_LOG_RETENTION_DAYS;
        else process.env.AUDIT_LOG_RETENTION_DAYS = OLD;
    });

    it('returns null when the env var is unset (retention disabled by default)', () => {
        delete process.env.AUDIT_LOG_RETENTION_DAYS;
        expect(resolveRetentionDays()).toBeNull();
    });

    it('returns null for empty / non-numeric / zero / negative values (fail safe: keep logs)', () => {
        for (const v of ['', 'abc', '0', '-5', '3.5.2']) {
            process.env.AUDIT_LOG_RETENTION_DAYS = v;
            expect(resolveRetentionDays()).toBeNull();
        }
    });

    it('returns the integer day count for a valid positive value', () => {
        process.env.AUDIT_LOG_RETENTION_DAYS = '2555';
        expect(resolveRetentionDays()).toBe(2555);
    });
});

describe('purgeExpiredLogs', () => {
    beforeEach(() => jest.clearAllMocks());

    it('is a no-op (deletes nothing) when retention is disabled', async () => {
        const res = await purgeExpiredLogs({ retentionDays: null });
        expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
        expect(res).toEqual({ purged: 0, skipped: true, cutoff: null });
    });

    it('deletes logs strictly older than the cutoff and returns the count', async () => {
        prisma.auditLog.deleteMany.mockResolvedValue({ count: 12 });
        const now = new Date('2026-08-28T00:00:00.000Z');
        const res = await purgeExpiredLogs({ retentionDays: 30, now });

        expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
        const arg = prisma.auditLog.deleteMany.mock.calls[0][0];
        // cutoff = now - 30 days = 2026-07-29T00:00:00Z
        expect(arg.where.createdAt.lt).toEqual(new Date('2026-07-29T00:00:00.000Z'));
        expect(res.purged).toBe(12);
        expect(res.skipped).toBe(false);
        expect(res.cutoff).toEqual(new Date('2026-07-29T00:00:00.000Z'));
    });

    it('purges across ALL agencies (no agency filter — platform maintenance)', async () => {
        prisma.auditLog.deleteMany.mockResolvedValue({ count: 3 });
        await purgeExpiredLogs({ retentionDays: 365, now: new Date('2026-08-28T00:00:00.000Z') });
        const arg = prisma.auditLog.deleteMany.mock.calls[0][0];
        // Only a createdAt bound — no agencyId in the where clause.
        expect(Object.keys(arg.where)).toEqual(['createdAt']);
    });

    it('propagates the retentionDays from env when not passed explicitly', async () => {
        process.env.AUDIT_LOG_RETENTION_DAYS = '10';
        prisma.auditLog.deleteMany.mockResolvedValue({ count: 1 });
        const res = await purgeExpiredLogs({ now: new Date('2026-08-28T00:00:00.000Z') });
        expect(res.skipped).toBe(false);
        expect(res.purged).toBe(1);
        delete process.env.AUDIT_LOG_RETENTION_DAYS;
    });
});
