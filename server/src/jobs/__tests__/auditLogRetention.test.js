// Tests the audit-log retention cron driver. auditService is mocked so no DB
// is touched and we can assert on the purge + summary-logging behavior.

jest.mock('../../services/auditService', () => ({
    purgeExpiredLogs: jest.fn(),
    resolveRetentionDays: jest.fn(),
    logAction: jest.fn(),
}));

const audit = require('../../services/auditService');
const { runAuditLogRetention } = require('../auditLogRetention');

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => console.log.mockRestore());

it('no-ops and writes no audit entry when retention is disabled', async () => {
    audit.purgeExpiredLogs.mockResolvedValue({ purged: 0, skipped: true, cutoff: null });
    const res = await runAuditLogRetention(new Date('2026-08-28T00:00:00Z'));
    expect(res.skipped).toBe(true);
    expect(audit.logAction).not.toHaveBeenCalled();
});

it('does not write a summary entry when nothing was purged (avoids daily noise)', async () => {
    audit.purgeExpiredLogs.mockResolvedValue({ purged: 0, skipped: false, cutoff: new Date('2026-07-29T00:00:00Z') });
    audit.resolveRetentionDays.mockReturnValue(30);
    await runAuditLogRetention(new Date('2026-08-28T00:00:00Z'));
    expect(audit.logAction).not.toHaveBeenCalled();
});

it('writes a PERMANENT_DELETE summary audit entry when logs were purged', async () => {
    const cutoff = new Date('2026-07-29T00:00:00Z');
    audit.purgeExpiredLogs.mockResolvedValue({ purged: 42, skipped: false, cutoff });
    audit.resolveRetentionDays.mockReturnValue(30);

    await runAuditLogRetention(new Date('2026-08-28T00:00:00Z'));

    expect(audit.logAction).toHaveBeenCalledTimes(1);
    const entry = audit.logAction.mock.calls[0][0];
    expect(entry.action).toBe('PERMANENT_DELETE');
    expect(entry.entityType).toBe('AuditLog');
    expect(entry.userRole).toBe('system');
    expect(entry.metadata.purged).toBe(42);
    expect(entry.metadata.retentionDays).toBe(30);
    expect(entry.metadata.cutoff).toBe(cutoff.toISOString());
});
