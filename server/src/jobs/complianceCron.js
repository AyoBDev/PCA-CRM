const prisma = require('../lib/prisma');
const { evaluateCompliance, createComplianceTask, createNotification } = require('../services/complianceService');

async function runComplianceCheck() {
  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const expiringCerts = await prisma.employeeCertification.findMany({
    where: {
      expirationDate: { lte: thirtyDaysOut },
      status: { notIn: ['pending'] },
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  const employeesToEvaluate = new Set();

  for (const cert of expiringCerts) {
    const employeeId = cert.employee.id;
    employeesToEvaluate.add(employeeId);

    const isExpired = cert.expirationDate < now;
    const isExpiring = !isExpired;

    if (isExpiring) {
      const recentNotif = await prisma.notification.findFirst({
        where: {
          employeeId,
          type: 'reminder_30day',
          createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (!recentNotif) {
        await createNotification(employeeId, 'reminder_30day',
          `${cert.certType.replace(/_/g, ' ')} expiring soon`,
          `Your ${cert.certType.replace(/_/g, ' ')} expires on ${cert.expirationDate.toLocaleDateString()}. Please upload a renewal.`
        );
        await createComplianceTask(employeeId, cert.certType, cert.id);
      }
    }

    if (isExpired) {
      await createComplianceTask(employeeId, cert.certType, cert.id);
    }
  }

  for (const employeeId of employeesToEvaluate) {
    const status = await evaluateCompliance(employeeId);
    if (status === 'blocked') {
      const recentBlock = await prisma.notification.findFirst({
        where: { employeeId, type: 'blocked', createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
      });
      if (!recentBlock) {
        await createNotification(employeeId, 'blocked',
          'Compliance Blocked',
          'One or more certifications have expired. You cannot clock in via EVV until resolved.'
        );
      }
    }
  }

  console.log(`[Compliance] Checked ${expiringCerts.length} certs, evaluated ${employeesToEvaluate.size} employees`);
}

module.exports = { runComplianceCheck };
