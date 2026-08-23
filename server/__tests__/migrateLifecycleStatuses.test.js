const prisma = require('../src/lib/prisma');
const { run } = require('../prisma/migrate-lifecycle-statuses');

afterAll(async () => { await prisma.$disconnect(); });

it('renames legacy statuses and is idempotent', async () => {
    const a = await prisma.employee.create({ data: { name: 'A', email: `mig-a-${Date.now()}@t.co`, onboardingStatus: 'invited', agencyId: 1 } });
    const b = await prisma.employee.create({ data: { name: 'B', email: `mig-b-${Date.now()}@t.co`, onboardingStatus: 'submitted', agencyId: 1 } });
    await run();
    expect((await prisma.employee.findUnique({ where: { id: a.id } })).onboardingStatus).toBe('invitation_pending');
    expect((await prisma.employee.findUnique({ where: { id: b.id } })).onboardingStatus).toBe('pending_review');
    // idempotent
    await run();
    expect((await prisma.employee.findUnique({ where: { id: b.id } })).onboardingStatus).toBe('pending_review');
});

it('backfills invitation_pending employees who already have onboarding data to onboarding_in_progress', async () => {
    const started = await prisma.employee.create({
        data: {
            name: 'Started',
            email: `mig-started-${Date.now()}@t.co`,
            onboardingStatus: 'invited',
            address: '123 Main St',
            agencyId: 1,
        },
    });
    const untouched = await prisma.employee.create({
        data: {
            name: 'Untouched',
            email: `mig-untouched-${Date.now()}@t.co`,
            onboardingStatus: 'invited',
            agencyId: 1,
        },
    });

    await run();

    expect((await prisma.employee.findUnique({ where: { id: started.id } })).onboardingStatus).toBe('onboarding_in_progress');
    expect((await prisma.employee.findUnique({ where: { id: untouched.id } })).onboardingStatus).toBe('invitation_pending');

    // idempotent — running again doesn't change already-canonical rows
    await run();
    expect((await prisma.employee.findUnique({ where: { id: started.id } })).onboardingStatus).toBe('onboarding_in_progress');
    expect((await prisma.employee.findUnique({ where: { id: untouched.id } })).onboardingStatus).toBe('invitation_pending');
});

it('leaves already-canonical statuses untouched', async () => {
    const emp = await prisma.employee.create({
        data: { name: 'Canonical', email: `mig-canonical-${Date.now()}@t.co`, onboardingStatus: 'changes_requested', agencyId: 1 },
    });
    await run();
    expect((await prisma.employee.findUnique({ where: { id: emp.id } })).onboardingStatus).toBe('changes_requested');
});
