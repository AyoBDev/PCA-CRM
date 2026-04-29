const prisma = require('../lib/prisma');

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
                metadata: JSON.stringify(metadata || {}),
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
 * Get audit logs for a specific entity.
 */
async function getEntityLogs(entityType, entityId, { page = 1, limit = 25 } = {}) {
    const where = { entityType, entityId };
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
 */
async function getPageLogs(entityType, { page = 1, limit = 25 } = {}) {
    const where = entityType ? { entityType } : {};
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

module.exports = { logAction, diffFields, getEntityLogs, getPageLogs };
