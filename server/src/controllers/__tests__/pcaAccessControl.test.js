const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

// Security regression tests for the July 2026 audit fixes:
//  - A `pca` (caregiver) token must NOT reach the main staff API surface.
//  - The employee portal (/api/employee/*) must still work for the same token.

let pcaToken;
let adminToken;
let pcaUser;
let pcaEmployee;

const PCA_EMAIL = 'sec-pca@test.com';
const ADMIN_EMAIL = 'sec-admin@test.com';

beforeAll(async () => {
    const passwordHash = await bcrypt.hash('secret123', 10);

    const admin = await prisma.user.create({
        data: { email: ADMIN_EMAIL, passwordHash, name: 'Sec Admin', role: 'admin' },
    });
    pcaUser = await prisma.user.create({
        data: { email: PCA_EMAIL, passwordHash, name: 'Sec PCA', role: 'pca', status: 'active', active: true },
    });
    pcaEmployee = await prisma.employee.create({
        data: { name: 'Sec PCA', email: PCA_EMAIL, userId: pcaUser.id },
    });

    adminToken = (await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'secret123' })).body.token;
    pcaToken = (await request(app).post('/api/auth/employee-login').send({ email: PCA_EMAIL, password: 'secret123' })).body.token;
});

afterAll(async () => {
    await prisma.employee.deleteMany({ where: { email: PCA_EMAIL } });
    await prisma.user.deleteMany({ where: { email: { in: [PCA_EMAIL, ADMIN_EMAIL] } } });
});

describe('pca token cannot reach the main staff API', () => {
    it('issues a working employee-login token', () => {
        expect(pcaToken).toBeTruthy();
    });

    it('BLOCKS GET /api/clients (client PHI) for a pca token', async () => {
        const res = await request(app).get('/api/clients').set('Authorization', `Bearer ${pcaToken}`);
        expect(res.status).toBe(403);
    });

    it('BLOCKS GET /api/employees for a pca token', async () => {
        const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${pcaToken}`);
        expect(res.status).toBe(403);
    });

    it('BLOCKS GET /api/payroll/runs for a pca token', async () => {
        const res = await request(app).get('/api/payroll/runs').set('Authorization', `Bearer ${pcaToken}`);
        expect(res.status).toBe(403);
    });

    it('BLOCKS DELETE /api/shifts/all for a pca token', async () => {
        const res = await request(app).delete('/api/shifts/all').set('Authorization', `Bearer ${pcaToken}`);
        expect(res.status).toBe(403);
    });

    it('still allows the pca token to reach its own employee portal', async () => {
        const res = await request(app).get('/api/employee/home/summary').set('Authorization', `Bearer ${pcaToken}`);
        expect(res.status).toBe(200);
    });

    it('still allows an admin token to reach GET /api/clients', async () => {
        const res = await request(app).get('/api/clients').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });

    // Surface boundary (added with the login-surface claim):
    it('BLOCKS an admin-surface token from the employee portal', async () => {
        const res = await request(app).get('/api/employee/home/summary').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(403);
    });

    it('allows BOTH tokens to reach the surface-agnostic /api/auth/me', async () => {
        const asPca = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${pcaToken}`);
        const asAdmin = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
        expect(asPca.status).toBe(200);
        expect(asAdmin.status).toBe(200);
    });

    it('BLOCKS a pca account at the ADMIN login endpoint (must use the employee portal)', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: PCA_EMAIL, password: 'secret123' });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/employee portal/i);
    });
});
