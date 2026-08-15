const prisma = require('../src/lib/prisma');
const lifecycle = require('../src/services/onboardingLifecycle');
const { STATUSES } = lifecycle;

afterAll(async () => { await prisma.$disconnect(); });

describe('onboardingLifecycle transition table (pure)', () => {
  it('exposes all 7 canonical statuses', () => {
    expect(Object.values(STATUSES).sort()).toEqual(
      ['active', 'approved', 'changes_requested', 'inactive', 'invitation_pending', 'onboarding_in_progress', 'pending_review'].sort()
    );
  });

  it.each([
    ['invitation_pending', 'onboarding_in_progress'],
    ['onboarding_in_progress', 'pending_review'],
    ['pending_review', 'approved'],
    ['approved', 'active'],
    ['pending_review', 'changes_requested'],
    ['changes_requested', 'pending_review'],
    ['active', 'inactive'],
    ['inactive', 'active'],
  ])('allows %s → %s', (from, to) => {
    expect(lifecycle.isAllowed(from, to)).toBe(true);
  });

  it.each([
    ['invitation_pending', 'active'],
    ['pending_review', 'active'],
    ['active', 'pending_review'],
    ['changes_requested', 'active'],
  ])('rejects %s → %s', (from, to) => {
    expect(lifecycle.isAllowed(from, to)).toBe(false);
  });
});

describe('transition() persistence', () => {
  it('updates status and logs an audit entry for a legal transition', async () => {
    const emp = await prisma.employee.create({ data: { name: 'LC', email: `lc-${Date.now()}@t.co`, onboardingStatus: 'pending_review' } });
    const updated = await lifecycle.transition(prisma, emp.id, 'approved', { reason: 'test' });
    expect(updated.onboardingStatus).toBe('approved');
    const log = await prisma.auditLog.findFirst({ where: { entityType: 'Employee', entityId: emp.id }, orderBy: { id: 'desc' } });
    expect(JSON.parse(log.metadata)).toMatchObject({ statusFrom: 'pending_review', statusTo: 'approved', reason: 'test' });
  });

  it('throws on an illegal transition and leaves status unchanged', async () => {
    const emp = await prisma.employee.create({ data: { name: 'LC2', email: `lc2-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending' } });
    await expect(lifecycle.transition(prisma, emp.id, 'active')).rejects.toThrow('Illegal onboarding transition: invitation_pending → active');
    const still = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(still.onboardingStatus).toBe('invitation_pending');
  });
});
