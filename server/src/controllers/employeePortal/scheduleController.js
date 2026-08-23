
async function getWeekSchedule(req, res) {
  const dateParam = req.query.date;
  let weekStart;
  if (dateParam) {
    weekStart = new Date(dateParam + 'T00:00:00');
  } else {
    weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const shifts = await req.db.shift.findMany({
    where: {
      employeeId: req.employee.id,
      shiftDate: { gte: weekStart, lt: weekEnd },
      archivedAt: null,
    },
    include: { client: { select: { clientName: true, address: true, phone: true, gateCode: true, mainServices: true, carePlanSchedule: true, caregiverRequirements: true } } },
    orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
  });

  res.json({ weekStart: weekStart.toISOString(), shifts });
}

async function getScheduleHistory(req, res) {
  const notifications = await req.db.scheduleNotification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, weekStart: true, status: true, sentAt: true, confirmedAt: true, method: true,
    },
  });
  res.json(notifications);
}

module.exports = { getWeekSchedule, getScheduleHistory };
