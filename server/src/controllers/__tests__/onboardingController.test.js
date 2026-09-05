const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

let adminToken;
let testEmployee;

// Fixed fixture emails mean a run that crashes before afterAll leaves rows
// behind and every later run dies on the (agency_id, email) unique
// constraint. Clearing first makes the suite self-healing.
// Dependent rows go before the employee, and employees before users.
async function purgeFixtures() {
    const employees = await prisma.employee.findMany({
        where: { email: 'newpca@test.com' },
        select: { id: true },
    });
    if (employees.length) {
        const employeeId = { in: employees.map((e) => e.id) };
        await prisma.employeeAvailability.deleteMany({ where: { employeeId } });
        await prisma.onboardingToken.deleteMany({ where: { employeeId } });
        await prisma.employee.deleteMany({ where: { id: employeeId } });
    }
    await prisma.user.deleteMany({
        where: { email: { in: ['onboard-test-admin@test.com', 'newpca@test.com'] } },
    });
}

beforeAll(async () => {
    await purgeFixtures();

    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
        data: { email: 'onboard-test-admin@test.com', passwordHash, name: 'Test Admin', role: 'admin', agencyId: 1 },
    });
    const loginRes = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: 'onboard-test-admin@test.com', password: 'admin123' });
    adminToken = loginRes.body.token;
});

afterAll(async () => {
    // Scoped to THIS suite's fixture emails — an unscoped deleteMany({}) here
    // previously wiped every onboarding token / availability row globally,
    // racing with any other test file mid-flight against the shared DB.
    // Keyed off the fixtures rather than testEmployee so it still cleans up
    // when a test failed before that variable was assigned.
    await purgeFixtures();
});

describe('Onboarding Flow', () => {
    it('creates employee with email and auto-generates onboarding token', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'New PCA', email: 'newpca@test.com' });
        expect(res.status).toBe(201);
        expect(res.body.onboardingStatus).toBe('invitation_pending');
        testEmployee = res.body;

        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: testEmployee.id } });
        expect(token).not.toBeNull();
        expect(token.status).toBe('pending');
    });

    it('GET /api/onboarding/:token returns employee info', async () => {
        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: testEmployee.id } });
        const res = await request(app).get(`/api/onboarding/${token.token}`);
        expect(res.status).toBe(200);
        expect(res.body.employeeName).toBe('New PCA');
        expect(res.body.employeeEmail).toBe('newpca@test.com');
    });

    it('POST /api/onboarding/:token/complete creates user and availability', async () => {
        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: testEmployee.id } });
        const res = await request(app)
            .post(`/api/onboarding/${token.token}/complete`)
            .send({
                password: 'securepass1',
                passwordConfirm: 'securepass1',
                availability: {
                    availableFrom: '2026-07-01',
                    availableUntil: null,
                    weeklySchedule: { mon: { available: true, start: '08:00', end: '17:00' }, tue: { available: true, start: '08:00', end: '17:00' }, wed: { available: false, start: '', end: '' }, thu: { available: true, start: '09:00', end: '15:00' }, fri: { available: true, start: '08:00', end: '17:00' }, sat: { available: false, start: '', end: '' }, sun: { available: false, start: '', end: '' } },
                    maxHoursPerWeek: 32,
                    maxConcurrentClients: 2,
                    maxTravelDistance: 10,
                    transportation: 'Own car',
                    holidayAvailability: { newYears: false, mlk: false, thanksgiving: true, christmas: false },
                    blackoutDates: ['2026-08-01', '2026-08-02'],
                    initialTimeOff: [{ start: '2026-07-20', end: '2026-07-25', reason: 'Vacation' }],
                    notes: 'Prefer morning shifts',
                },
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const employee = await prisma.employee.findUnique({ where: { id: testEmployee.id } });
        expect(employee.onboardingStatus).toBe('pending_review');

        const user = await prisma.user.findFirst({ where: { email: 'newpca@test.com' } });
        expect(user).not.toBeNull();
        expect(user.status).toBe('pending');
        expect(user.role).toBe('pca');
    });

    // A pending_review employee (user.status 'pending') CAN log into the portal —
    // the App-level status gate keeps them onboarding-only until 'active'. This is
    // the Area 2 lifecycle behavior (employeeLogin relaxes the pending gate for
    // employees whose onboardingStatus is pending_review/changes_requested).
    it('pending_review employee CAN log in via employee portal (gated to onboarding-only)', async () => {
        const res = await request(app).post('/api/auth/employee-login').set('Host', 'nvbest.localhost').send({ email: 'newpca@test.com', password: 'securepass1' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.onboardingStatus).toBe('pending_review');
    });

    it('admin finalizes onboarding (no rejected items → approved + active)', async () => {
        const res = await request(app)
            .post(`/api/employees/${testEmployee.id}/onboarding/finalize`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send();
        expect(res.status).toBe(200);
        expect(res.body.outcome).toBe('approved');

        const employee = await prisma.employee.findUnique({ where: { id: testEmployee.id } });
        expect(employee.onboardingStatus).toBe('active');

        const user = await prisma.user.findFirst({ where: { email: 'newpca@test.com' } });
        expect(user.status).toBe('active');
    });

    it('approved user can log in via employee login', async () => {
        const res = await request(app).post('/api/auth/employee-login').set('Host', 'nvbest.localhost').send({ email: 'newpca@test.com', password: 'securepass1' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('approved PCA user is blocked from admin login', async () => {
        const res = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: 'newpca@test.com', password: 'securepass1' });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Employee Portal');
    });

    it('completed token cannot be reused', async () => {
        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: testEmployee.id } });
        const res = await request(app).get(`/api/onboarding/${token.token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('already completed');
    });
});
