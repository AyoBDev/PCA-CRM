const prisma = require('../lib/prisma');
const leadService = require('../services/leadService');
const audit = require('../services/auditService');

// Runs daily. Any active lead whose updatedAt is older than DORMANT_DAYS is moved
// to the Dormant Archive: status=archived, archivedAt=now, dormantAt=now.
// A single summary AuditLog row is written per sweep (not one-per-lead) so the
// History page shows a compact record without flooding.
async function runLeadDormancySweep() {
    const now = new Date();
    const { count } = await leadService.sweepDormantLeads(prisma, now);
    if (count > 0) {
        console.log(`[leads] auto-dormant swept ${count} leads`);
        audit.logAction({
            userId: 0,
            userName: 'System',
            userRole: 'system',
            action: 'ARCHIVE',
            entityType: 'Lead',
            entityId: 0,
            entityName: 'Dormant sweep',
            metadata: { count, thresholdDays: leadService.DORMANT_DAYS, at: now.toISOString() },
        });
    }
    return { count };
}

module.exports = { runLeadDormancySweep };
