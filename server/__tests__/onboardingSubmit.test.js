const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding submit gating', () => {
  let token, employeeId, policyReqId, policyId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Sub EE', email: `sub-${Date.now()}@t.co`, onboardingStatus: 'invited' } });
    employeeId = e.id;
    token = (await onboarding.createOnboardingToken(e.id)).token;
    const p = await prisma.policyDocument.create({ data: { key: `subp-${Date.now()}`, title: 'Handbook', sortOrder: 1 } });
    policyId = p.id;
    policyReqId = (await prisma.employeeRequirement.create({ data: { employeeId, kind: 'policy', catalogTypeId: p.id, status: 'required' } })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('rejects submit while a policy is unacknowledged', async () => {
    const res = await request(app).post(`/api/onboarding/${token}/submit`);
    expect(res.status).toBe(400);
  });

  it('accepts submit after the policy is acknowledged', async () => {
    await request(app).post(`/api/onboarding/${token}/policies/${policyReqId}/ack`).send({});
    const res = await request(app).post(`/api/onboarding/${token}/submit`);
    expect(res.status).toBe(200);
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.onboardingStatus).toBe('submitted');
  });
});
