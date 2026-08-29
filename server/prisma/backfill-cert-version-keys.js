// One-off rollout backfill for the certification renewal automation feature.
//
// Per agency, for every EmployeeCertification with a non-null expirationDate
// whose CertType is renewable (requiresExpiry !== false):
//   1. Sets currentVersionKey (if currently null) to the id of its latest
//      CertificationUpload, or 'v0' if it has none.
//   2. Pre-seeds CertReminderLog rows (channels all 'skipped') for every
//      reminder stage that is already in the past for the cert's current
//      expiration — so the FIRST production sweep does not fire a burst of
//      stale reminders for certs that are already 30-day/7-day/expired.
//
// This mirrors src/jobs/certReminderCron.js's agency-iteration pattern:
// cert_reminder_logs has RLS enabled, so writes go through tenantClient(agencyId)
// inside runWithTenant(...) — that both auto-stamps agencyId on the create AND
// satisfies the tenant_isolation policy via SET LOCAL app.agency_id. A plain
// owner-client write would either violate RLS or (if it slipped through)
// requires agencyId to be set explicitly; going through the tenant client is
// the same mechanism the rest of the codebase uses for cert data, so we reuse
// it here instead of poking the owner connection directly.
//
// Idempotent — safe to re-run. Re-running:
//   - never re-updates a cert whose currentVersionKey is already set
//   - never creates a duplicate CertReminderLog row (unique on
//     certificationId+versionKey+stage; skip-if-exists via findFirst)
//
// Does NOT call deliverReminder or any channel — ledger rows are seeded
// directly with channels all 'skipped', so no real email/in-app/push send
// ever fires from this script.
//
// Run: cd server && node prisma/backfill-cert-version-keys.js

const prisma = require('../src/lib/prisma');
const { tenantClient } = require('../src/lib/tenantPrisma');
const { runWithTenant } = require('../src/lib/tenantContext');
const { computeStage, daysBetween } = require('../src/services/certReminderService');

const STAGE_ORDER = ['reminder_30day', 'reminder_7day', 'expired_final'];

// Stages at-or-before the current stage, in chronological order. Each of
// these represents a reminder that WOULD have already fired by now under the
// real sweep logic, so we seed a "skipped" ledger row for it rather than let
// the first live sweep send it retroactively.
function stagesAtOrBefore(stage) {
  if (!stage) return [];
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1) return [];
  return STAGE_ORDER.slice(0, idx + 1);
}

async function backfillAgency(agency) {
  const db = tenantClient(agency.id);
  return runWithTenant({ agencyId: agency.id, db }, async () => {
    const [certs, certTypes] = await Promise.all([
      db.employeeCertification.findMany({
        where: { expirationDate: { not: null } },
      }),
      db.certType.findMany(),
    ]);
    const typeByKey = Object.fromEntries(certTypes.map((t) => [t.key, t]));

    let versionKeysSet = 0;
    let ledgerRowsSeeded = 0;
    const now = new Date();

    for (const cert of certs) {
      const type = typeByKey[cert.certType];
      const requiresExpiry = type ? Boolean(type.requiresExpiry) : true; // unknown type gated (renewable by default)
      if (!requiresExpiry || !cert.expirationDate) continue;

      // 1. Resolve + set currentVersionKey if missing.
      const latestUpload = await db.certificationUpload.findFirst({
        where: { certificationId: cert.id },
        orderBy: { id: 'desc' },
      });
      const versionKey = latestUpload
        ? String(latestUpload.id)
        : (cert.currentVersionKey || 'v0');

      if (cert.currentVersionKey == null) {
        await db.employeeCertification.update({
          where: { id: cert.id },
          data: { currentVersionKey: versionKey },
        });
        versionKeysSet++;
      }

      // 2. Pre-seed ledger rows for every stage already in the past.
      const days = daysBetween(now, new Date(cert.expirationDate));
      const stage = computeStage(days);
      for (const st of stagesAtOrBefore(stage)) {
        const existing = await db.certReminderLog.findFirst({
          where: { certificationId: cert.id, versionKey, stage: st },
        });
        if (existing) continue;

        await db.certReminderLog.create({
          data: {
            certificationId: cert.id,
            versionKey,
            stage: st,
            channels: { email: 'skipped', inApp: 'skipped', push: 'skipped' },
          },
        });
        ledgerRowsSeeded++;
      }
    }

    return { versionKeysSet, ledgerRowsSeeded, certsChecked: certs.length };
  });
}

async function main() {
  const agencies = await prisma.agency.findMany({ orderBy: { id: 'asc' } });
  if (agencies.length === 0) {
    console.log('No agencies found — nothing to backfill.');
    return;
  }

  let totalVersionKeysSet = 0;
  let totalLedgerRowsSeeded = 0;

  for (const agency of agencies) {
    const { versionKeysSet, ledgerRowsSeeded, certsChecked } = await backfillAgency(agency);
    totalVersionKeysSet += versionKeysSet;
    totalLedgerRowsSeeded += ledgerRowsSeeded;
    console.log(
      `[${agency.name} (${agency.slug})] certs checked: ${certsChecked}, `
      + `versionKeys set: ${versionKeysSet}, ledger rows seeded: ${ledgerRowsSeeded}`
    );
  }

  console.log(
    `\nBackfill complete. Total version keys set: ${totalVersionKeysSet}, `
    + `total ledger rows seeded: ${totalLedgerRowsSeeded}.`
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = { backfillAgency, stagesAtOrBefore };
