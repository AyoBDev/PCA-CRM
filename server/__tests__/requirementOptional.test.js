const prisma = require('../src/lib/prisma');
const { assignRequirements, isOnboardingComplete } = require('../src/services/requirementService');

afterAll(async () => { await prisma.$disconnect(); });

describe('optional requirements', () => {
  it('isOnboardingComplete ignores optional items even when unfulfilled', () => {
    const reqs = [
      { kind: 'document', status: 'submitted', optional: false },
      { kind: 'certification', status: 'required', optional: true }, // not done, but optional
      { kind: 'policy', status: 'approved', optional: false },
    ];
    expect(isOnboardingComplete(reqs)).toBe(true);
  });

  it('a required-and-unfulfilled item still blocks', () => {
    const reqs = [{ kind: 'document', status: 'required', optional: false }];
    expect(isOnboardingComplete(reqs)).toBe(false);
  });

  it('assignRequirements resolves certTypeKeys and marks them optional', async () => {
    const emp = await prisma.employee.create({ data: { name: 'Opt EE', email: `opt-${Date.now()}@t.co`, onboardingStatus: 'invited' } });
    const key = `cpr-${Date.now()}`;
    await prisma.certType.create({ data: { key, label: 'CPR', sortOrder: 1 } });
    const rows = await prisma.$transaction(tx =>
      assignRequirements(tx, emp.id, { certTypeKeys: [key], optional: true })
    );
    expect(rows).toHaveLength(1);
    const req = await prisma.employeeRequirement.findUnique({ where: { id: rows[0].id } });
    expect(req.kind).toBe('certification');
    expect(req.optional).toBe(true);
    // an empty EmployeeCertification slot was created and linked
    expect(req.certificationId).not.toBeNull();
    await prisma.employee.delete({ where: { id: emp.id } });
  });
});
