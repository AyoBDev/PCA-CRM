const prisma = require('../src/lib/prisma');
const { assignRequirements, KINDS } = require('../src/services/requirementService');

afterAll(async () => { await prisma.$disconnect(); });

describe('assignRequirements', () => {
  let employeeId, dtId, ctId, pdId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Assign EE', email: `assign-${Date.now()}@t.co` } });
    employeeId = e.id;
    dtId = (await prisma.documentType.create({ data: { key: `d-${Date.now()}`, label: 'Doc', sortOrder: 1 } })).id;
    ctId = (await prisma.certType.create({ data: { key: `c-${Date.now()}`, label: 'Cert', renewalYears: 1, sortOrder: 1 } })).id;
    pdId = (await prisma.policyDocument.create({ data: { key: `p-${Date.now()}`, title: 'Policy', sortOrder: 1 } })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('creates one requirement per selection and a linked cert slot', async () => {
    const rows = await prisma.$transaction(tx =>
      assignRequirements(tx, employeeId, { documentTypeIds: [dtId], certTypeIds: [ctId], policyDocumentIds: [pdId] })
    );
    expect(rows).toHaveLength(3);
    const certReq = rows.find(r => r.kind === KINDS.CERTIFICATION);
    expect(certReq.certificationId).toBeTruthy();
    const cert = await prisma.employeeCertification.findUnique({ where: { id: certReq.certificationId } });
    expect(cert.employeeId).toBe(employeeId);
  });
});
