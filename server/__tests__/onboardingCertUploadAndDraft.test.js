const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding certification upload + availability draft', () => {
  let token, employeeId, certReqId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Cert EE', email: `cert-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending' } });
    employeeId = e.id;
    token = (await onboarding.createOnboardingToken(e.id)).token;
    const ct = await prisma.certType.create({ data: { key: `cpr-${Date.now()}`, label: 'CPR', sortOrder: 1 } });
    certReqId = (await prisma.employeeRequirement.create({ data: { employeeId, kind: 'certification', catalogTypeId: ct.id, status: 'required' } })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('accepts a file upload for a CERTIFICATION requirement and marks it submitted', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${token}/documents/${certReqId}`)
      .attach('file', Buffer.from('%PDF-1.4 fake cpr card'), { filename: 'cpr.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    const req = await prisma.employeeRequirement.findUnique({ where: { id: certReqId } });
    expect(req.status).toBe('submitted'); // previously stuck at 'required' — the CPR bug
  });

  it('persists and returns an availability draft so a reload can resume', async () => {
    const availability = {
      availableFrom: '2026-09-01', weeklySchedule: { mon: { available: true, start: '09:00', end: '17:00' } },
      maxHoursPerWeek: 40, maxConcurrentClients: 2, transportation: 'Own car',
    };
    const save = await request(app)
      .patch(`/api/onboarding/${token}/availability-draft`)
      .send({ availability });
    expect(save.status).toBe(200);

    const info = await request(app).get(`/api/onboarding/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.saved.availability.maxHoursPerWeek).toBe(40);
    expect(info.body.progress.availability).toBe(true);
  });

  it('returns saved personal values for rehydration after a personal save', async () => {
    await request(app).patch(`/api/onboarding/${token}/personal`)
      .send({ address: '5 Oak Ave', dob: '1992-03-03', gender: 'F', preferredLanguage: 'English' });
    const info = await request(app).get(`/api/onboarding/${token}`);
    expect(info.body.saved.personal.address).toBe('5 Oak Ave');
    expect(info.body.saved.personal.gender).toBe('F');
    expect(info.body.progress.personal).toBe(true);
  });
});
