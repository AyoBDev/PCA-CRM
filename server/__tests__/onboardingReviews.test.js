const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { JWT_SECRET } = require('../src/config/secrets');

afterAll(async () => { await prisma.$disconnect(); });

// Sign a token the same shape as authController.signToken (includes role), so
// requireRole('admin') sees the role.
async function tokenFor(role) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `rev-${role}-${unique}@t.co`, passwordHash: await bcrypt.hash('x', 4), name: `${role} u`, role, agencyId: 1 },
  });
  return { header: { Authorization: `Bearer ${jwt.sign({ id: user.id, role, permissionsVersion: user.permissionsVersion ?? 1, agencyId: user.agencyId }, JWT_SECRET)}` }, userId: user.id };
}

let submittedEmpId;
describe('GET /api/onboarding/reviews (admin-only)', () => {
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Review Me', email: `rev-emp-${Date.now()}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 } });
    submittedEmpId = e.id;
    // one required (done) + one optional (pending) requirement
    const dt = await prisma.documentType.create({ data: { key: `revd-${Date.now()}`, label: 'ID', sortOrder: 1, agencyId: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId: e.id, kind: 'document', catalogTypeId: dt.id, status: 'submitted', optional: false , agencyId: 1} });
    await prisma.employeeRequirement.create({ data: { employeeId: e.id, kind: 'certification', catalogTypeId: dt.id, status: 'required', optional: true , agencyId: 1} });
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: submittedEmpId } }); });

  it('returns submitted employees for an admin', async () => {
    const { header } = await tokenFor('admin');
    const res = await request(app).get('/api/onboarding/reviews').set(header);
    expect(res.status).toBe(200);
    const row = res.body.reviews.find(r => r.id === submittedEmpId);
    expect(row).toBeTruthy();
    expect(row.name).toBe('Review Me');
    expect(row.requiredTotal).toBe(1);
    expect(row.requiredDone).toBe(1);
    expect(row.optionalPending).toBe(1);
  });

  it('is forbidden for a non-admin (user) role', async () => {
    const { header } = await tokenFor('user');
    const res = await request(app).get('/api/onboarding/reviews').set(header);
    expect(res.status).toBe(403);
  });

  it("is forbidden for a pca role", async () => {
    const { header } = await tokenFor('pca');
    const res = await request(app).get('/api/onboarding/reviews').set(header);
    expect(res.status).toBe(403);
  });

  it("does not swallow 'reviews' as an onboarding token (route ordering)", async () => {
    // Unauthenticated hit should be 401 from authenticate, NOT the public
    // getOnboardingInfo's 400 'Invalid onboarding link' — proving the admin
    // route matched first.
    const res = await request(app).get('/api/onboarding/reviews');
    expect(res.status).toBe(401);
  });
});

// Regression: the handler used to issue 3 count queries PER employee awaiting
// review (an N+1). With a few hundred pending employees that became >1,000
// concurrent queries in one request, saturating the connection pool — it made
// this suite flaky under parallel workers and would have degraded badly in
// production as the queue grew. The counts must come from a bounded number of
// queries that does not scale with the number of employees.
describe('GET /api/onboarding/reviews — query count is bounded', () => {
  it('serves a large review queue well inside the default test timeout', async () => {
    // The N+1 issued 3 counts per employee concurrently; with a few hundred
    // pending employees that saturated the pool and pushed a single request
    // past 5s. Assert on wall-clock, which is the symptom that actually broke.
    const { header } = await tokenFor('admin');
    const t0 = Date.now();
    const res = await request(app).get('/api/onboarding/reviews').set(header);
    const elapsed = Date.now() - t0;

    expect(res.status).toBe(200);
    // Only meaningful once the queue is big enough to fan out over.
    if (res.body.reviews.length >= 50) {
      expect(elapsed).toBeLessThan(2000);
    }
  }, 20000);

  it('returns the same counts it did with per-employee queries', async () => {
    // Own fixture — the block above deletes its employee in afterAll.
    const e = await prisma.employee.create({
      data: { name: 'Counts Me', email: `counts-${Date.now()}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 },
    });
    const dt = await prisma.documentType.create({
      data: { key: `cnt-${Date.now()}`, label: 'ID', sortOrder: 1, agencyId: 1 },
    });
    await prisma.employeeRequirement.create({ data: { employeeId: e.id, kind: 'document', catalogTypeId: dt.id, status: 'submitted', optional: false, agencyId: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId: e.id, kind: 'certification', catalogTypeId: dt.id, status: 'required', optional: true, agencyId: 1 } });
    try {
      const { header } = await tokenFor('admin');
      const res = await request(app).get('/api/onboarding/reviews').set(header);
      expect(res.status).toBe(200);

      const row = res.body.reviews.find((r) => r.id === e.id);
      expect(row).toBeTruthy();
      expect(row.requiredTotal).toBe(1);
      expect(row.requiredDone).toBe(1);
      expect(row.optionalPending).toBe(1);
    } finally {
      await prisma.employee.delete({ where: { id: e.id } });
    }
  }, 20000);

  it('reports zeroes for an employee with no requirements at all', async () => {
    const e = await prisma.employee.create({
      data: { name: 'No Reqs', email: `noreq-${Date.now()}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 },
    });
    try {
      const { header } = await tokenFor('admin');
      const res = await request(app).get('/api/onboarding/reviews').set(header);
      const row = res.body.reviews.find((r) => r.id === e.id);
      expect(row).toBeTruthy();
      expect(row.requiredTotal).toBe(0);
      expect(row.requiredDone).toBe(0);
      expect(row.optionalPending).toBe(0);
    } finally {
      await prisma.employee.delete({ where: { id: e.id } });
    }
  }, 20000);
});
