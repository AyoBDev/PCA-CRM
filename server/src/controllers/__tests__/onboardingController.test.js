const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

let adminToken;
let testEmployee;

beforeAll(async () => {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
        data: { email: 'onboard-test-admin@test.com', passwordHash, name: 'Test Admin', role: 'admin' },
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'onboard-test-admin@test.com', password: 'admin123' });
    adminToken = loginRes.body.token;
});

afterAll(async () => {
    await prisma.employeeAvailability.deleteMany({});
    await prisma.onboardingToken.deleteMany({});
    await prisma.employee.deleteMany({ where: { email: 'newpca@test.com' } });
    await prisma.user.deleteMany({ where: { email: { in: ['onboard-test-admin@test.com', 'newpca@test.com'] } } });
});

describe('Onboarding Flow', () => {
    it('creates employee with email and auto-generates onboarding token', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'New PCA', email: 'newpca@test.com' });
        expect(res.status).toBe(201);
        expect(res.body.onboardingStatus).toBe('invited');
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
        expect(employee.onboardingStatus).toBe('submitted');

        const user = await prisma.user.findUnique({ where: { email: 'newpca@test.com' } });
        expect(user).not.toBeNull();
        expect(user.status).toBe('pending');
        expect(user.role).toBe('pca');
    });

    it('pending user cannot log in', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'newpca@test.com', password: 'securepass1' });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('pending');
    });

    it('admin approves onboarding', async () => {
        const res = await request(app)
            .patch(`/api/employees/${testEmployee.id}/approve-onboarding`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);

        const employee = await prisma.employee.findUnique({ where: { id: testEmployee.id } });
        expect(employee.onboardingStatus).toBe('active');

        const user = await prisma.user.findUnique({ where: { email: 'newpca@test.com' } });
        expect(user.status).toBe('active');
    });

    it('approved user can log in', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'newpca@test.com', password: 'securepass1' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('completed token cannot be reused', async () => {
        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: testEmployee.id } });
        const res = await request(app).get(`/api/onboarding/${token.token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('already completed');
    });
});
