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
  const employeeId = req.employee.id;
  const since = new Date(Date.now() - 14 * 86400000);

  const [shifts, messages, auditLogs, tasks, timeOff] = await Promise.all([
    prisma.shift.findMany({
      where: { employeeId, OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] },
      include: { client: { select: { clientName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.message.findMany({
      where: { senderRole: 'admin', createdAt: { gte: since }, conversation: { employeeId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []),
    prisma.auditLog.findMany({
      where: {
        entityType: { in: ['CertificationUpload', 'EmployeeCertification'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }).catch(() => []),
    prisma.employeeTask.findMany({
      where: { employeeId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.timeOffRequest.findMany({
      where: { employeeId, reviewedAt: { gte: since, not: null } },
      orderBy: { reviewedAt: 'desc' },
      take: 20,
    }).catch(() => []),
  ]);

  const items = [];

  for (const s of shifts) {
    const isNew = +s.createdAt >= +since;
    const isChanged = +s.updatedAt > +s.createdAt;
    items.push({
      id: `shift-${s.id}-${isChanged ? 'u' : 'c'}`,
      type: isChanged ? 'shift-changed' : 'new-shift',
      title: isChanged ? 'Shift updated' : 'New shift assigned',
      subtitle: `${s.client?.clientName || ''} · ${new Date(s.shiftDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      timestamp: (isChanged ? s.updatedAt : s.createdAt).toISOString(),
      href: '/schedule',
    });
  }

  for (const m of messages) {
    items.push({
      id: `msg-${m.id}`,
      type: 'admin-message',
      title: 'Message from Office',
      subtitle: m.content.slice(0, 80),
      timestamp: new Date(m.createdAt).toISOString(),
      href: '/messages',
    });
  }

  for (const a of auditLogs) {
    let meta = {};
    try { meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {}); } catch (_) { meta = {}; }
    if (meta.employeeId && meta.employeeId !== employeeId) continue;
    let type = 'cert-uploaded';
    let title = 'Certification uploaded';
    if (a.action === 'UPDATE') {
      if (meta.newStatus === 'approved') { type = 'cert-approved'; title = 'Certification approved'; }
      else if (meta.newStatus === 'rejected') { type = 'cert-rejected'; title = 'Certification needs attention'; }
    }
    items.push({
      id: `audit-${a.id}`,
      type,
      title,
      subtitle: a.entityName,
      timestamp: new Date(a.createdAt).toISOString(),
      href: '/account/certs',
    });
  }

  for (const t of tasks) {
    items.push({
      id: `task-${t.id}`,
      type: 'task-assigned',
      title: 'New task',
      subtitle: t.title,
      timestamp: new Date(t.createdAt).toISOString(),
      href: '/account/tasks',
    });
  }

  for (const r of timeOff) {
    items.push({
      id: `timeoff-${r.id}`,
      type: 'time-off-decided',
      title: `Time off ${r.status}`,
      subtitle: `${new Date(r.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(r.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      timestamp: new Date(r.reviewedAt).toISOString(),
      href: '/account/availability',
    });
  }

  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(items.slice(0, 20));
}

module.exports = { getHomeSummary, getNextShift, getActivity };
