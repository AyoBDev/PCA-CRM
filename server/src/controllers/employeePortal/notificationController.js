const prisma = require('../../lib/prisma');

async function getNotifications(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
}

async function markNotificationsRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { employeeId: req.employee.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

module.exports = { getNotifications, markNotificationsRead };
