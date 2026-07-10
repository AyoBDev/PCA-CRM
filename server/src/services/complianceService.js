const { getTenantDb } = require('../lib/tenantContext');
const { emitToEmployee } = require('../socket');

const RENEWAL_YEARS = {
  tb_test: 1,
  cpr: 2,
  annual_training: 1,
  cultural_competency: 2,
  infection_control: 1,
  background_check: 5,
};

async function evaluateCompliance(employeeId) {
  const db = getTenantDb();
  const now = new Date();
  const certs = await db.employeeCertification.findMany({
    where: { employeeId },
  });

  const hasExpired = certs.some(c =>
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
  emitToEmployee(employeeId, 'notification:new', notif);
  return notif;
}

async function resolveComplianceTasks(certId) {
  const db = getTenantDb();
  await db.employeeTask.updateMany({
    where: { linkedCertId: certId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

module.exports = { evaluateCompliance, createComplianceTask, createNotification, resolveComplianceTasks, RENEWAL_YEARS };
