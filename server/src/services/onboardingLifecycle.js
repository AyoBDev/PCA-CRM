const audit = require('./auditService');

const STATUSES = {
  INVITATION_PENDING: 'invitation_pending',
  ONBOARDING_IN_PROGRESS: 'onboarding_in_progress',
  PENDING_REVIEW: 'pending_review',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

const TRANSITIONS = {
  invitation_pending: ['onboarding_in_progress'],
  onboarding_in_progress: ['pending_review'],
  pending_review: ['approved', 'changes_requested', 'inactive'],
  changes_requested: ['pending_review'],
  approved: ['active'],
  active: ['inactive'],
  inactive: ['active'],
};

function isAllowed(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

// meta may carry reserved keys (userId, userName, userRole) consumed by the
// audit call itself; everything else is spread directly into `metadata`.
function stripReserved(meta) {
  const { userId, userName, userRole, ...rest } = meta;
  return rest;
}

// tx: a Prisma client or an interactive transaction client. Validates the move,
// persists onboardingStatus, and logs an audit entry bound to the transition.
async function transition(tx, employeeId, to, meta = {}) {
  const emp = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new Error('Employee not found');
  const from = emp.onboardingStatus;
  if (from === to) return emp; // idempotent no-op
  if (!isAllowed(from, to)) throw new Error(`Illegal onboarding transition: ${from} → ${to}`);
  const updated = await tx.employee.update({ where: { id: employeeId }, data: { onboardingStatus: to } });
  // Awaited (unlike most fire-and-forget audit.logAction() call sites in this
  // codebase) so the transition is observably complete — including its audit
  // trail — by the time transition() resolves, avoiding a read-after-write race.
  await audit.logAction({
    userId: meta.userId ?? 0,
    userName: meta.userName ?? emp.name,
    userRole: meta.userRole ?? 'system',
    action: 'UPDATE',
    entityType: 'Employee',
    entityId: employeeId,
    entityName: emp.name,
    metadata: { statusFrom: from, statusTo: to, ...stripReserved(meta) },
  });
  return updated;
}

module.exports = { STATUSES, TRANSITIONS, isAllowed, transition };
