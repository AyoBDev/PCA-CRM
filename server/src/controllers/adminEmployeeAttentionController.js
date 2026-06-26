const prisma = require('../lib/prisma');

async function getEmployeeAttention(req, res) {
  const adminUserId = req.user.id;

  const [
    certsPendingReview,
    timeOffPending,
    availabilityPending,
    seenRows,
    auditLogs,
    employees,
    pendingCerts,
    pendingTimeOff,
    pendingAvailability,
  ] = await Promise.all([
    prisma.employeeCertification.count({ where: { status: 'pending' } }),
    prisma.timeOffRequest.count({ where: { status: 'pending' } }),
    prisma.availabilityRequest.count({ where: { status: 'pending' } }),
    prisma.adminEventSeen.findMany({ where: { userId: adminUserId } }),
    prisma.auditLog.findMany({
      where: { entityType: 'Employee', action: 'UPDATE', userRole: 'pca' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.employee.findMany({ select: { id: true, userId: true, name: true } }),
    prisma.employeeCertification.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.timeOffRequest.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.availabilityRequest.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const seen = new Set(seenRows.map(r => r.eventKey));
  const empByUserId = new Map();
  for (const e of employees) {
    if (e.userId != null) empByUserId.set(e.userId, e);
  }
  const empById = new Map(employees.map(e => [e.id, e]));

  // Filter audit logs: only those where the auditing user is the same person as the audited employee's user
  const qualifyingProfileChanges = auditLogs.filter(a => {
    const auditedEmployee = empById.get(a.entityId);
    return auditedEmployee && auditedEmployee.userId === a.userId;
  });
  const profileChangesUnseen = qualifyingProfileChanges.filter(a => !seen.has(`profile-change:${a.id}`)).length;

  const events = [];

  for (const c of pendingCerts) {
    const k = `cert-pending:${c.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'cert-pending',
      employeeId: c.employeeId,
      employeeName: c.employee?.name || '',
      subject: c.certType,
      createdAt: c.updatedAt.toISOString(),
    });
  }
  for (const t of pendingTimeOff) {
    const k = `time-off-pending:${t.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'time-off-pending',
      employeeId: t.employeeId,
      employeeName: t.employee?.name || '',
      subject: t.reason,
      createdAt: t.createdAt.toISOString(),
    });
  }
  for (const a of pendingAvailability) {
    const k = `availability-pending:${a.id}`;
    if (seen.has(k)) continue;
    events.push({
      eventKey: k,
      type: 'availability-pending',
      employeeId: a.employeeId,
      employeeName: a.employee?.name || '',
      subject: 'schedule change',
      createdAt: a.createdAt.toISOString(),
    });
  }
  for (const a of qualifyingProfileChanges) {
    const k = `profile-change:${a.id}`;
    if (seen.has(k)) continue;
    const emp = empById.get(a.entityId);
    events.push({
      eventKey: k,
      type: 'profile-change',
      employeeId: a.entityId,
      employeeName: a.entityName || emp?.name || '',
      subject: 'profile updated',
      createdAt: a.createdAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    counts: {
      certsPendingReview,
      timeOffPending,
      availabilityPending,
      profileChangesUnseen,
    },
    recentEvents: events.slice(0, 10),
  });
}

module.exports = { getEmployeeAttention };
