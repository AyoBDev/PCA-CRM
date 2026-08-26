
async function getNotifications(req, res) {
  const notifications = await req.db.notification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
}

async function markNotificationsRead(req, res) {
  const result = await req.db.notification.updateMany({
    where: { employeeId: req.employee.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

module.exports = { getNotifications, markNotificationsRead };
