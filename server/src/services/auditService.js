const prisma = require('../lib/prisma');
const { getAgencyId, getImpersonatorId } = require('../lib/tenantContext');

/**
 * Log an audit action.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
async function logAction({ userId, userName, userRole, action, entityType, entityId, entityName, changes, metadata }) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId || 0,
                userName: userName || 'System',
                userRole: userRole || 'system',
                action,
                entityType,
                entityId: entityId || 0,
                entityName: entityName || '',
                changes: JSON.stringify(changes || []),
                metadata: JSON.stringify(
                    getImpersonatorId() != null
                        ? { ...(metadata || {}), impersonatorId: getImpersonatorId() }
                        : (metadata || {})
                ),
                agencyId: getAgencyId(),
            },
        });
    } catch (err) {
        console.error('[AuditLog] Failed to write:', err.message);
    }
}

/**
 * Compare two objects and return an array of changed fields.
 * fields: array of field names to compare, or null to compare all keys from newObj.
 */
function diffFields(oldObj, newObj, fields) {
    const keys = fields || Object.keys(newObj);
    const changes = [];
    for (const field of keys) {
        const oldVal = oldObj?.[field];
        const newVal = newObj?.[field];
        // Normalize for comparison
        const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
        const newStr = newVal === null || newVal === undefined ? '' : String(newVal);
        if (oldStr !== newStr) {
            changes.push({ field, oldValue: oldStr, newValue: newStr });
        }
    }
    return changes;
}

/**
 * Redact the values of PHI fields in a diffFields() result. The audit log
 * keeps WHICH field changed (and when, by whom) without persisting the PHI
 * values themselves — the AuditLog table is not encrypted at rest.
 */
function redactChanges(changes, phiFields) {
    const phi = new Set(phiFields || []);
    return (changes || []).map(c =>
        phi.has(c.field) ? { ...c, oldValue: '•••', newValue: '•••' } : c
    );
}

/**
 * Get audit logs for a specific entity.
 * Only reachable via authenticated tenant routes — requires ambient tenant
 * context (getAgencyId()) so results never cross agency boundaries.
 */
async function getEntityLogs(entityType, entityId, { page = 1, limit = 25 } = {}) {
    const agencyId = getAgencyId();
    if (agencyId == null) throw new Error('getEntityLogs requires tenant context (agencyId)');
    const where = { entityType, entityId, agencyId };
    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Get audit logs for an entity type (page-level view).
 * Only reachable via authenticated tenant routes — requires ambient tenant
 * context (getAgencyId()) so results never cross agency boundaries.
 */
async function getPageLogs(entityType, { page = 1, limit = 25, action, dateFrom, dateTo } = {}) {
    const agencyId = getAgencyId();
    if (agencyId == null) throw new Error('getPageLogs requires tenant context (agencyId)');
    const where = { agencyId };
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            where.createdAt.lte = end;
        }
    }
    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Resolve the audit-log retention window (in days) from the environment.
 *
 * Retention is DISABLED by default: with no AUDIT_LOG_RETENTION_DAYS set, this
 * returns null and nothing is ever purged — the safe default for a
 * healthcare-adjacent audit trail, where silently losing history is worse than
 * keeping too much. An operator opts in by setting the var to a positive integer
 * number of days (e.g. 2555 ≈ 7 years). Any invalid value (empty, non-numeric,
 * zero, negative) fails safe to null (keep everything).
 */
function resolveRetentionDays() {
    const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
    if (raw == null || String(raw).trim() === '') return null;
    // Reject anything that isn't a clean positive integer.
    if (!/^\d+$/.test(String(raw).trim())) return null;
    const days = parseInt(raw, 10);
    return days > 0 ? days : null;
}

/**
 * Delete audit-log rows older than the retention window, across ALL agencies.
 *
 * This is platform maintenance (not a tenant-scoped operation): it runs on the
 * owner connection and applies one createdAt cutoff to every agency's rows — no
 * agencyId filter — so it can't accidentally purge only one tenant. When
 * retention is disabled (retentionDays null), it is a no-op and deletes nothing.
 *
 * @param {object} [opts]
 * @param {number|null} [opts.retentionDays]  days to keep; defaults to resolveRetentionDays()
 * @param {Date} [opts.now]                   clock injection for tests
 * @returns {Promise<{purged:number, skipped:boolean, cutoff:Date|null}>}
 */
async function purgeExpiredLogs({ retentionDays, now = new Date() } = {}) {
    const days = retentionDays === undefined ? resolveRetentionDays() : retentionDays;
    if (!days || days <= 0) {
        return { purged: 0, skipped: true, cutoff: null };
    }
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
    return { purged: count, skipped: false, cutoff };
}

module.exports = {
    logAction,
    diffFields,
    redactChanges,
    getEntityLogs,
    getPageLogs,
    resolveRetentionDays,
    purgeExpiredLogs,
};
