const prisma = require('../lib/prisma');
const { emitToEmployee } = require('../socket');

async function evaluateCompliance(employeeId) {
  const now = new Date();
  const [certs, certTypes] = await Promise.all([
    prisma.employeeCertification.findMany({ where: { employeeId } }),
    prisma.certType.findMany(),
  ]);
  const requiresExpiry = Object.fromEntries(certTypes.map(t => [t.key, Boolean(t.requiresExpiry)]));

  const hasExpired = certs.some(c =>
    (requiresExpiry[c.certType] ?? true) &&   // unknown type defaults to gated
    c.expirationDate && c.expirationDate < now && c.status !== 'pending'
  );

  const newStatus = hasExpired ? 'blocked' : 'ok';
  await prisma.employee.update({
    where: { id: employeeId },
    data: { complianceStatus: newStatus },
  });

  return newStatus;
}

function renewalYearsFor(certKey, catalogMap) {
  const t = catalogMap[certKey];
  return t && t.renewalYears != null ? t.renewalYears : null;
}

async function createComplianceTask(employeeId, certType, certId) {
  const existing = await prisma.employeeTask.findFirst({
    where: { employeeId, linkedCertId: certId, completedAt: null },
  });
  if (existing) return existing;

  const title = `Renew ${certType.replace(/_/g, ' ')}`;
  return prisma.employeeTask.create({
    data: { employeeId, title, source: 'compliance', linkedCertId: certId },
  });
}

async function createNotification(employeeId, type, title, body) {
  const notif = await prisma.notification.create({
    data: { employeeId, type, title, body },
  });
  emitToEmployee(employeeId, 'notification:new', notif);
  return notif;
}

async function resolveComplianceTasks(certId) {
  await prisma.employeeTask.updateMany({
    where: { linkedCertId: certId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

module.exports = { evaluateCompliance, createComplianceTask, createNotification, resolveComplianceTasks, renewalYearsFor };
