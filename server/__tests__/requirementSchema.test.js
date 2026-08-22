const prisma = require('../src/lib/prisma');

afterAll(async () => { await prisma.$disconnect(); });

describe('requirement schema', () => {
  let employeeId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Schema Test EE', email: `schema-${Date.now()}@t.co`, agencyId: 1 } });
    employeeId = e.id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('creates a DocumentType and an EmployeeRequirement pointing at it', async () => {
    const dt = await prisma.documentType.create({ data: { key: `govid-${Date.now()}`, label: 'Government ID', requiresExpiry: true, sortOrder: 1, agencyId: 1 } });
    const req = await prisma.employeeRequirement.create({
      data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required', agencyId: 1 },
    });
    expect(req.status).toBe('required');
    expect(req.kind).toBe('document');
    await prisma.employeeRequirement.delete({ where: { id: req.id } });
    await prisma.documentType.delete({ where: { id: dt.id } });
  });

  it('stores new Employee personal-info fields', async () => {
    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: { gender: 'F', preferredLanguage: 'English', emergencyContactName: 'Jane' },
    });
    expect(updated.gender).toBe('F');
    expect(updated.emergencyContactName).toBe('Jane');
  });
});
