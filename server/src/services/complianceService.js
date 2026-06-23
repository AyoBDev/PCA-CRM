const prisma = require('../lib/prisma');
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
  const now = new Date();
  const certs = await prisma.employeeCertification.findMany({
    where: { employeeId },
  });

  const hasExpired = certs.some(c =>
    c.expirationDate && c.expirationDate < now && c.status !== 'pending'
  );

  const newStatus = hasExpired ? 'blocked' : 'ok';
  await prisma.employee.update({
    where: { id: employeeId },
    data: { complianceStatus: newStatus },
  });

  return newStatus;
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

module.exports = { evaluateCompliance, createComplianceTask, createNotification, resolveComplianceTasks, RENEWAL_YEARS };
