const { getTenantDb, getAgencyId } = require('../lib/tenantContext');
const emailChannel = require('./reminderChannels/emailChannel');
const inAppChannel = require('./reminderChannels/inAppChannel');
const pushChannel = require('./reminderChannels/pushChannel');
const { buildMessage, buildBatchMessage } = require('./certReminderMessages');
const audit = require('./auditService');
const compliance = require('./complianceService');

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole calendar days from `now` to `expDate`, floored to midnight UTC so the
// time of day never shifts the boundary.
function daysBetween(now, expDate) {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(expDate.getUTCFullYear(), expDate.getUTCMonth(), expDate.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

// Ranges (not strict equality) so a missed cron day never SKIPS a stage; the
// ledger guarantees each stage still fires only once.
function computeStage(daysToExpiry) {
  if (daysToExpiry <= 0) return 'expired_final';
  if (daysToExpiry <= 7) return 'reminder_7day';
  if (daysToExpiry <= 30) return 'reminder_30day';
  return null;
}

function versionKeyFor(cert) {
  return cert.currentVersionKey ? String(cert.currentVersionKey) : 'v0';
}

async function deliverReminder(cert, stage, versionKey) {
  const db = getTenantDb();
  const msg = buildMessage(stage, {
    name: cert.employee.name,
    certLabel: cert.certLabel || cert.certType,
    expDate: cert.expirationDate,
  });

  const channels = {
    email: await emailChannel.send(cert.employee, msg),
    inApp: await inAppChannel.send(cert.employee, stage, msg),
    push: await pushChannel.send(cert.employee, msg),
  };

  try {
    await db.certReminderLog.create({
      data: { certificationId: cert.id, versionKey, stage, channels, agencyId: getAgencyId() },
    });
  } catch (err) {
    if (err.code === 'P2002') return { skipped: true }; // already sent for this version+stage
    throw err;
  }

  audit.logAction({
    userId: 0, userName: 'System', userRole: 'system',
    action: 'UPDATE', entityType: 'EmployeeCertification', entityId: cert.id,
    entityName: cert.certLabel || cert.certType, changes: [],
    metadata: { action: 'cert_reminder_sent', stage, channels },
  });

  return { skipped: false, channels };
}

function isApprovedForCycle(cert) {
  const approvedStatus = cert.status === 'approved' || cert.status === 'active';
  if (!approvedStatus || !cert.approvedAt) return false;
  // Approved AFTER the current expiration means a renewal was accepted for this cycle.
  return new Date(cert.approvedAt) > new Date(cert.expirationDate);
}

async function sweepCertRemindersForAgency(now = new Date()) {
  const db = getTenantDb();
  const [certs, certTypes] = await Promise.all([
    db.employeeCertification.findMany({
      // Only remind CURRENT staff: active and not archived. Former/archived
      // employees keep their cert rows (for history) but must never be emailed,
      // notified, or blocked by the sweep.
      where: { expirationDate: { not: null }, employee: { active: true, archivedAt: null } },
      include: { employee: { select: { id: true, name: true, email: true } } },
    }),
    db.certType.findMany(),
  ]);
  const typeByKey = Object.fromEntries(certTypes.map(t => [t.key, t]));

  let sent = 0, blocked = 0, checked = 0;
  for (const cert of certs) {
    const type = typeByKey[cert.certType];
    const requiresExpiry = type ? Boolean(type.requiresExpiry) : true; // unknown type gated
    if (!requiresExpiry || !cert.expirationDate) continue;
    checked++;

    const versionKey = versionKeyFor(cert);
    const days = daysBetween(now, new Date(cert.expirationDate));
    const stage = computeStage(days);
    if (!stage) continue;

    const already = await db.certReminderLog.findFirst({
      where: { certificationId: cert.id, versionKey, stage },
    });
    if (!already) {
      const certLabel = type ? type.label : cert.certType;
      const res = await deliverReminder({ ...cert, certLabel }, stage, versionKey);
      if (!res.skipped) sent++;
    }

    if (stage === 'expired_final' && !isApprovedForCycle(cert)) {
      const status = await compliance.evaluateCompliance(cert.employee.id);
      if (status === 'blocked') blocked++;
    }
  }
  console.log(`[CertReminder] checked ${checked} certs, sent ${sent}, blocked ${blocked}`);
  return { sent, blocked, checked };
}

async function deliverReminderBatch(employee, items) {
  const db = getTenantDb();
  const msg = buildBatchMessage(employee.name, items.map(i => ({ certLabel: i.certLabel, stage: i.stage, expDate: i.expDate })));

  const channels = {
    email: await emailChannel.send(employee, msg),
    inApp: await inAppChannel.send(employee, 'cert_reminder', msg),
    push: await pushChannel.send(employee, msg),
  };

  for (const item of items) {
    try {
      await db.certReminderLog.create({
        data: { certificationId: item.cert.id, versionKey: item.versionKey, stage: item.stage, channels, agencyId: getAgencyId() },
      });
    } catch (err) {
      if (err.code === 'P2002') continue; // already recorded — skip this row
      throw err;
    }
  }

  audit.logAction({
    userId: 0, userName: 'System', userRole: 'system',
    action: 'UPDATE', entityType: 'EmployeeCertification', entityId: employee.id,
    entityName: employee.name, changes: [],
    metadata: { action: 'cert_reminder_sent', stages: items.map(i => i.stage), certCount: items.length, channels },
  });

  return { channels, certCount: items.length };
}

module.exports = { daysBetween, computeStage, versionKeyFor, deliverReminder, deliverReminderBatch, sweepCertRemindersForAgency };
