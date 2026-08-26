const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding submit gating', () => {
  let token, employeeId, policyReqId, policyId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Sub EE', email: `sub-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending', agencyId: 1 } });
    employeeId = e.id;
    token = (await onboarding.createOnboardingToken(prisma, e.id)).token;
    const p = await prisma.policyDocument.create({ data: { key: `subp-${Date.now()}`, title: 'Handbook', sortOrder: 1, agencyId: 1 } });
    policyId = p.id;
    policyReqId = (await prisma.employeeRequirement.create({ data: { employeeId, kind: 'policy', catalogTypeId: p.id, status: 'required' , agencyId: 1} })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  const availability = {
    availableFrom: '2026-08-01', availableUntil: null,
    weeklySchedule: {}, maxHoursPerWeek: 40, maxConcurrentClients: 1,
    maxTravelTime: 30, transportation: 'Own car',
    holidayAvailability: {}, blackoutDates: [], initialTimeOff: [], notes: '',
  };

  it('rejects submit while a policy is unacknowledged', async () => {
    const res = await request(app).post(`/api/onboarding/${token}/submit`).send({ password: 'Secret123!', availability });
    expect(res.status).toBe(400);
  });

  it('rejects submit without a password even when the ledger is complete', async () => {
    await request(app).post(`/api/onboarding/${token}/policies/${policyReqId}/ack`).send({});
    const res = await request(app).post(`/api/onboarding/${token}/submit`).send({ availability });
    expect(res.status).toBe(400);
  });

  it('creates the account + availability on submit after the policy is acknowledged', async () => {
    // policy already acked in the previous test
    const res = await request(app).post(`/api/onboarding/${token}/submit`).send({ password: 'Secret123!', availability });
    expect(res.status).toBe(200);
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    // A pending User must now be linked so the employee can eventually log in.
    expect(ee.userId).not.toBeNull();
    expect(['pending_review', 'active']).toContain(ee.onboardingStatus);
    const avail = await prisma.employeeAvailability.findFirst({ where: { employeeId } });
    expect(avail).not.toBeNull();
    expect(avail.transportation).toBe('Own car');
  });
});
