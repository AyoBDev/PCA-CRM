const prisma = require('../../lib/prisma');

async function getHomeSummary(req, res) {
  const employeeId = req.employee.id;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [shiftsThisWeek, overdueCerts, openTasks] = await Promise.all([
    prisma.shift.findMany({
      where: { employeeId, shiftDate: { gte: weekStart, lt: weekEnd }, archivedAt: null },
      select: { hours: true },
    }),
    prisma.employeeCertification.count({
      where: { employeeId, expirationDate: { lt: now }, status: { not: 'expired_replaced' } },
    }),
    prisma.employeeTask.count({
      where: { employeeId, completedAt: null },
    }),
  ]);

  const hoursScheduled = shiftsThisWeek.reduce((sum, s) => sum + (s.hours || 0), 0);

  res.json({
    shiftsThisWeek: shiftsThisWeek.length,
    hoursScheduled,
    requirementsOverdue: overdueCerts,
    openTasks,
  });
}

async function getNextShift(req, res) {
  const now = new Date();
  const shift = await prisma.shift.findFirst({
    where: { employeeId: req.employee.id, shiftDate: { gte: now }, archivedAt: null },
    orderBy: { shiftDate: 'asc' },
    include: { client: { select: { clientName: true } } },
  });
  if (!shift) return res.json(null);
  res.json({
    id: shift.id,
    clientName: shift.client.clientName,
    shiftDate: shift.shiftDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    serviceCode: shift.serviceCode,
  });
}

async function getActivity(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  res.json(notifications);
}

module.exports = { getHomeSummary, getNextShift, getActivity };
