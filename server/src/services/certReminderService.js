const { getTenantDb, getAgencyId } = require('../lib/tenantContext');
const emailChannel = require('./reminderChannels/emailChannel');
const inAppChannel = require('./reminderChannels/inAppChannel');
const pushChannel = require('./reminderChannels/pushChannel');
const { buildMessage } = require('./certReminderMessages');
const audit = require('./auditService');

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

module.exports = { daysBetween, computeStage, versionKeyFor, deliverReminder };
