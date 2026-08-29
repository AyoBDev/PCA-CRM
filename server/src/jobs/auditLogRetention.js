// Cron driver: enforce the audit-log retention policy.
//
// Runs daily. If AUDIT_LOG_RETENTION_DAYS is set (retention is OFF by default),
// deletes audit-log rows older than that window across ALL agencies, then writes
// a single summary AuditLog row recording what was purged — so the purge itself
// is auditable and visible on the History page. When retention is disabled this
// is a no-op and writes nothing.
//
// Uses the owner connection via auditService (allowlisted): this is a
// cross-tenant maintenance sweep, not a tenant-scoped request.

const audit = require('../services/auditService');

async function runAuditLogRetention(now = new Date()) {
    const result = await audit.purgeExpiredLogs({ now });

    if (result.skipped) {
        // Retention disabled — say so once so operators can see it's intentional.
        console.log('[auditRetention] AUDIT_LOG_RETENTION_DAYS not set — retention disabled, nothing purged');
        return result;
    }

    console.log(
        `[auditRetention] purged ${result.purged} audit log(s) older than ${audit.resolveRetentionDays()} days ` +
        `(cutoff ${result.cutoff.toISOString()})`
    );

    // Record the purge as its own audit event (only when something was removed,
    // to avoid a daily no-change row). No tenant context here, so agencyId is
    // null — a platform-level maintenance entry.
    if (result.purged > 0) {
        audit.logAction({
            userId: 0,
            userName: 'System',
            userRole: 'system',
            action: 'PERMANENT_DELETE',
            entityType: 'AuditLog',
            entityId: 0,
            entityName: 'Audit-log retention sweep',
            metadata: {
                purged: result.purged,
                retentionDays: audit.resolveRetentionDays(),
                cutoff: result.cutoff.toISOString(),
                at: now.toISOString(),
            },
        });
    }

    return result;
}

module.exports = { runAuditLogRetention };
