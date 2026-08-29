const { getTenantDb, getAgencyId } = require('../lib/tenantContext');
const { emitToEmployee } = require('../socket');

async function evaluateCompliance(employeeId) {
  const db = getTenantDb();
  const now = new Date();
  const [certs, certTypes] = await Promise.all([
    db.employeeCertification.findMany({ where: { employeeId } }),
    db.certType.findMany(),
  ]);
  const requiresExpiry = Object.fromEntries(certTypes.map(t => [t.key, Boolean(t.requiresExpiry)]));

  const hasExpired = certs.some(c =>
    (requiresExpiry[c.certType] ?? true) &&   // unknown type defaults to gated
    c.expirationDate && c.expirationDate < now && c.status !== 'pending'
  );

  const newStatus = hasExpired ? 'blocked' : 'ok';
  await db.employee.update({
    where: { id: employeeId },
    data: { complianceStatus: newStatus },
  });

  return newStatus;
}

async function createComplianceTask(employeeId, certType, certId) {
  const db = getTenantDb();
  const existing = await db.employeeTask.findFirst({
    where: { employeeId, linkedCertId: certId, completedAt: null },
  });
  if (existing) return existing;

  const title = `Renew ${certType.replace(/_/g, ' ')}`;
  return db.employeeTask.create({
    data: { employeeId, title, source: 'compliance', linkedCertId: certId },
  });
}

async function createNotification(employeeId, type, title, body) {
  const db = getTenantDb();
  const notif = await db.notification.create({
    data: { employeeId, type, title, body },
  });
  emitToEmployee(getAgencyId(), employeeId, 'notification:new', notif);
  return notif;
}

async function resolveComplianceTasks(certId) {
  const db = getTenantDb();
  await db.employeeTask.updateMany({
    where: { linkedCertId: certId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

// HR approves a renewed certificate: keep prior files as Portfolio History,
// make the newest upload current (which re-arms the reminder stages via the
// changed versionKey), stamp approval, clear the renewal task, and re-evaluate
// the employee's compliance (unblocks if this was the last expired cert).
async function approveCertRenewal(certId, newExpiration, hrUser) {
  const db = getTenantDb();
  const cert = await db.employeeCertification.findUnique({ where: { id: certId } });
  if (!cert) throw new Error(`Certification ${certId} not found`);

  const latestUpload = await db.certificationUpload.findFirst({
    where: { certificationId: certId },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  const versionKey = latestUpload ? String(latestUpload.id) : (cert.currentVersionKey || 'v0');

  const updated = await db.employeeCertification.update({
    where: { id: certId },
    data: {
      status: 'active',
      expirationDate: newExpiration ? new Date(newExpiration) : cert.expirationDate,
      currentVersionKey: versionKey,
      approvedAt: new Date(),
      approvedById: hrUser.id,
      approvedByName: hrUser.name || '',
    },
  });

  await resolveComplianceTasks(certId);
  await evaluateCompliance(cert.employeeId);
  return updated;
}

async function isClockInBlocked(employeeId) {
  const db = getTenantDb();
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { complianceStatus: true } });
  return !!emp && emp.complianceStatus === 'blocked';
}

module.exports = { evaluateCompliance, createComplianceTask, createNotification, resolveComplianceTasks, approveCertRenewal, isClockInBlocked };
