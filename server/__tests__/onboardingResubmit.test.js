const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { resetItemForRework } = require('../src/services/requirementService');
const onboarding = require('../src/services/onboardingService');
const lifecycle = require('../src/services/onboardingLifecycle');

afterAll(async () => { await prisma.$disconnect(); });

describe('resetItemForRework', () => {
  it('flips a rejected item back to pending/submitted and clears the reason', async () => {
    const emp = await prisma.employee.create({ data: { name: 'RW', email: `rw-${Date.now()}@t.co`, onboardingStatus: 'changes_requested', agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'rejected', rejectionReason: 'Bad' , agencyId: 1} });
    await resetItemForRework(prisma, req.id);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('pending');
    expect(after.rejectionReason).toBe('');
    expect(after.status).toBe('submitted');
    await prisma.employee.delete({ where: { id: emp.id } });
  });
});

describe('changes_requested → pending_review transition on re-submit', () => {
  it('is a legal transition', () => {
    expect(lifecycle.isAllowed('changes_requested', 'pending_review')).toBe(true);
  });
});

describe('re-upload flips a rejected document requirement back to pending', () => {
  it('uploadDocument resets reviewStatus to pending and clears the rejection reason', async () => {
    const emp = await prisma.employee.create({ data: { name: 'ReupEE', email: `reup-${Date.now()}@t.co`, onboardingStatus: 'changes_requested', agencyId: 1 } });
    const dt = await prisma.documentType.create({ data: { key: `reup-dt-${Date.now()}`, label: 'ID', sortOrder: 1, agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: dt.id, status: 'required', reviewStatus: 'rejected', rejectionReason: 'Blurry photo' , agencyId: 1} });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);

    const res = await request(app)
      .post(`/api/onboarding/${tok.token}/documents/${req.id}`)
      .attach('file', Buffer.from('fake-pdf-bytes'), { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);

    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('pending');
    expect(after.rejectionReason).toBe('');
    expect(after.status).toBe('submitted');

    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('ackPolicy resets reviewStatus to pending and clears the rejection reason', async () => {
    const emp = await prisma.employee.create({ data: { name: 'ReackEE', email: `reack-${Date.now()}@t.co`, onboardingStatus: 'changes_requested', agencyId: 1 } });
    const policy = await prisma.policyDocument.create({ data: { key: `reack-p-${Date.now()}`, title: 'Handbook', sortOrder: 1, agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'policy', catalogTypeId: policy.id, status: 'required', reviewStatus: 'rejected', rejectionReason: 'Wrong version acked' , agencyId: 1} });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);

    const res = await request(app).post(`/api/onboarding/${tok.token}/policies/${req.id}/ack`).send({});
    expect(res.status).toBe(200);

    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('pending');
    expect(after.rejectionReason).toBe('');

    await prisma.employee.delete({ where: { id: emp.id } });
  });
});

describe('re-upload / re-ack does NOT un-approve an already-approved item (I2)', () => {
  const { markSubmitted, markPolicyAck } = require('../src/services/requirementService');

  it('markSubmitted leaves an approved item approved (does not flip to pending)', async () => {
    const emp = await prisma.employee.create({ data: { name: 'ActiveEE', email: `active-${Date.now()}@t.co`, onboardingStatus: 'active', agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'approved', reviewStatus: 'approved', rejectionReason: '' , agencyId: 1} });
    await markSubmitted(prisma, req.id, {});
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('approved');
    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('markPolicyAck leaves an approved policy item approved', async () => {
    const emp = await prisma.employee.create({ data: { name: 'ActivePolEE', email: `activepol-${Date.now()}@t.co`, onboardingStatus: 'active', agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'policy', catalogTypeId: 1, status: 'approved', reviewStatus: 'approved', rejectionReason: '' , agencyId: 1} });
    const ack = await prisma.employeePolicyAck.create({ data: { employeeId: emp.id, policyDocumentId: 1, policyVersion: 1, ipAddress: '::1' , agencyId: 1} });
    await markPolicyAck(prisma, req.id, ack.id);
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('approved');
    expect(after.policyAckId).toBe(ack.id);
    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('markSubmitted still flips a rejected item back to pending (rework preserved)', async () => {
    const emp = await prisma.employee.create({ data: { name: 'RejEE', email: `rej-${Date.now()}@t.co`, onboardingStatus: 'changes_requested', agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({ data: { employeeId: emp.id, kind: 'document', catalogTypeId: 1, status: 'submitted', reviewStatus: 'rejected', rejectionReason: 'Bad' , agencyId: 1} });
    await markSubmitted(prisma, req.id, {});
    const after = await prisma.employeeRequirement.findUnique({ where: { id: req.id } });
    expect(after.reviewStatus).toBe('pending');
    expect(after.rejectionReason).toBe('');
    await prisma.employee.delete({ where: { id: emp.id } });
  });
});

describe('first-data save transitions employee to onboarding_in_progress', () => {
  it('savePersonal moves invitation_pending → onboarding_in_progress', async () => {
    const emp = await prisma.employee.create({ data: { name: 'FirstData', email: `fd-${Date.now()}@t.co`, onboardingStatus: 'invitation_pending', agencyId: 1 } });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);
    const res = await request(app)
      .patch(`/api/onboarding/${tok.token}/personal`)
      .send({ address: '123 Main St', dob: '1990-01-01', gender: 'other', preferredLanguage: 'English' });
    expect(res.status).toBe(200);
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after.onboardingStatus).toBe('onboarding_in_progress');
    await prisma.employee.delete({ where: { id: emp.id } });
  });

  it('saveEmergency is a no-op (does not throw) when already past onboarding_in_progress', async () => {
    const emp = await prisma.employee.create({ data: { name: 'PastEE', email: `past-${Date.now()}@t.co`, onboardingStatus: 'pending_review', agencyId: 1 } });
    const tok = await onboarding.createOnboardingToken(prisma, emp.id);
    const res = await request(app)
      .patch(`/api/onboarding/${tok.token}/emergency`)
      .send({ emergencyContactName: 'Jane Doe', emergencyContactRelationship: 'Sister', emergencyContactPhone: '555-1234', emergencyContactEmail: 'jane@t.co' });
    expect(res.status).toBe(200);
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    // Must remain pending_review — transition() should have been swallowed as a no-op, not thrown.
    expect(after.onboardingStatus).toBe('pending_review');
    await prisma.employee.delete({ where: { id: emp.id } });
  });
});
