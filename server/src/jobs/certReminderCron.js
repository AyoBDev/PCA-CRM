const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const { sweepCertRemindersForAgency } = require('../services/certReminderService');

// Iterates every active agency and runs the certification reminder + compliance
// sweep for each inside its own tenant context. Replaces the cert logic that
// used to live in jobs/complianceCron.js.
async function runCertReminderSweep() {
  const agencies = await prisma.agency.findMany({ where: { status: 'active' } });
  for (const agency of agencies) {
    const db = tenantClient(agency.id);
    try {
      await runWithTenant({ agencyId: agency.id, db }, () => sweepCertRemindersForAgency());
    } catch (err) {
      console.error(`[CertReminder] sweep failed for agency ${agency.id}:`, err);
    }
  }
}

module.exports = { runCertReminderSweep };
