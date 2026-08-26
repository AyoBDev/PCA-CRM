const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { employeeAuthHeader } = require('../../../../__tests__/helpers/auth');

afterAll(async () => { await prisma.$disconnect(); });

describe('portal requirements', () => {
  it('returns the ledger for the linked employee', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-${Date.now()}`, label: 'Doc', sortOrder: 1, agencyId: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required', agencyId: 1 } });
    const res = await request(app).get('/api/employee/requirements').set(header);
    expect(res.status).toBe(200);
    expect(res.body.requirements.some(r => r.label === 'Doc')).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/employee/requirements');
    expect(res.status).toBe(401);
  });
});

describe('portal documents', () => {
  it('lists documents for the linked employee', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-list-${Date.now()}`, label: 'List Doc', sortOrder: 1, agencyId: 1 } });
    await prisma.employeeDocument.create({
      data: {
        employeeId, documentTypeId: dt.id, storageKey: 'employee-docs/x/y/z.pdf',
        fileName: 'z.pdf', fileType: 'application/pdf', fileSize: 100, agencyId: 1,
      },
    });
    const res = await request(app).get('/api/employee/documents').set(header);
    expect(res.status).toBe(200);
    expect(res.body.documents.some(d => d.fileName === 'z.pdf')).toBe(true);
  });

  it('uploads a document against a requirement scoped to the linked employee, sanitizing the filename', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-up-${Date.now()}`, label: 'Upload Doc', sortOrder: 1, agencyId: 1 } });
    const requirement = await prisma.employeeRequirement.create({
      data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required', agencyId: 1 },
    });

    const res = await request(app)
      .post(`/api/employee/documents/${requirement.id}`)
      .set(header)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: '../../etc/evil name?.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const doc = await prisma.employeeDocument.findFirst({ where: { employeeId, documentTypeId: dt.id } });
    expect(doc).toBeTruthy();
    expect(doc.storageKey).not.toMatch(/\.\./);
    expect(doc.storageKey).not.toContain('etc/evil');
    expect(doc.storageKey).toMatch(/employee-docs\//);

    const updated = await prisma.employeeRequirement.findUnique({ where: { id: requirement.id } });
    expect(updated.status).toBe('submitted');
    expect(updated.documentId).toBe(doc.id);
  });

  it('refuses to upload against another employee\'s requirement', async () => {
    const { header } = await employeeAuthHeader();
    const { employeeId: otherEmployeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-other-${Date.now()}`, label: 'Other Doc', sortOrder: 1, agencyId: 1 } });
    const requirement = await prisma.employeeRequirement.create({
      data: { employeeId: otherEmployeeId, kind: 'document', catalogTypeId: dt.id, status: 'required', agencyId: 1 },
    });

    const res = await request(app)
      .post(`/api/employee/documents/${requirement.id}`)
      .set(header)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'ok.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
  });

  it('rejects missing file with 400', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-nofile-${Date.now()}`, label: 'NoFile Doc', sortOrder: 1, agencyId: 1 } });
    const requirement = await prisma.employeeRequirement.create({
      data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required', agencyId: 1 },
    });
    const res = await request(app).post(`/api/employee/documents/${requirement.id}`).set(header);
    expect(res.status).toBe(400);
  });
});

describe('portal policy ack', () => {
  it('acknowledges a policy requirement scoped to the linked employee', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const policy = await prisma.policyDocument.create({ data: { key: `pol-${Date.now()}`, title: 'Handbook', version: 1, agencyId: 1 } });
    const requirement = await prisma.employeeRequirement.create({
      data: { employeeId, kind: 'policy', catalogTypeId: policy.id, status: 'required', agencyId: 1 },
    });

    const res = await request(app).post(`/api/employee/policies/${requirement.id}/ack`).set(header);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await prisma.employeeRequirement.findUnique({ where: { id: requirement.id } });
    expect(updated.status).toBe('approved');
    expect(updated.policyAckId).toBeTruthy();
  });
});
