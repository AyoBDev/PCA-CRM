const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding requirements + personal save', () => {
  let token, employeeId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Onb EE', email: `onb-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending' } });
    employeeId = e.id;
    const tokenRecord = await onboarding.createOnboardingToken(e.id);
    token = tokenRecord.token;
    const dt = await prisma.documentType.create({ data: { key: `onbd-${Date.now()}`, label: 'Gov ID', requiresExpiry: true, sortOrder: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required' } });
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('returns the requirement ledger with labels', async () => {
    const res = await request(app).get(`/api/onboarding/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.requirements[0].label).toBe('Gov ID');
  });

  it('saves personal info including encrypted SSN', async () => {
    const res = await request(app).patch(`/api/onboarding/${token}/personal`)
      .send({ address: '1 St', dob: '1990-01-01', gender: 'F', preferredLanguage: 'English', ssn: '123-45-6789' });
    expect(res.status).toBe(200);
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.ssn).toBe('123-45-6789'); // decrypted transparently by prisma extension
  });
});
