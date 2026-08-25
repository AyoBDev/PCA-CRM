// Cron driver: enumerates active agencies on the owner connection, then runs
// the dormancy sweep for each agency inside its own tenant context.
const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const leadService = require('../services/leadService');
const audit = require('../services/auditService');

// Runs daily. Any active lead whose updatedAt is older than DORMANT_DAYS is moved
// to the Dormant Archive: status=archived, archivedAt=now, dormantAt=now.
// A single summary AuditLog row is written per agency per sweep (not one-per-lead)
// so the History page shows a compact record without flooding — audit.logAction
// picks up the current agencyId from tenant context (runWithTenant below), so
// each agency's sweep produces its own, correctly-scoped audit entry.
async function runSweepForAgency(db, now) {
    const { count } = await leadService.sweepDormantLeads(db, now);
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
    return count;
}

async function runLeadDormancySweep() {
    const now = new Date();
    const agencies = await prisma.agency.findMany({ where: { status: 'active' } });
    let total = 0;
    for (const agency of agencies) {
        const db = tenantClient(agency.id);
        total += await runWithTenant({ agencyId: agency.id, db }, () => runSweepForAgency(db, now));
    }
    return { count: total };
}

module.exports = { runLeadDormancySweep };
