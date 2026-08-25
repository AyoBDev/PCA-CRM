const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'updateuser-admin@test.com';
const OFFICE_EMAIL = 'updateuser-office@test.com';
const OTHER_EMAIL = 'updateuser-other@test.com';
const ARCHIVED_EMAIL = 'updateuser-archived@test.com';
const ADMIN_PW = 'secret123';

let adminToken, adminId, officeUser, otherUser, archivedUser;

async function login(email, password) {
    return (await request(app).post('/api/auth/login').send({ email, password })).body.token;
}

beforeEach(async () => {
    const adminHash = await bcrypt.hash(ADMIN_PW, 10);
    const inactiveHash = await bcrypt.hash('oldpass1', 10);
    const admin = await prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: adminHash, name: 'UU Admin', role: 'admin', active: true } });
    adminId = admin.id;
    officeUser = await prisma.user.create({ data: { email: OFFICE_EMAIL, passwordHash: inactiveHash, name: 'Araceli Mongalvo', role: 'user', active: false } });
    otherUser = await prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: inactiveHash, name: 'Other Person', role: 'user', active: true } });
    archivedUser = await prisma.user.create({ data: { email: ARCHIVED_EMAIL, passwordHash: inactiveHash, name: 'Archived Person', role: 'user', active: true, archivedAt: new Date() } });
    adminToken = await login(ADMIN_EMAIL, ADMIN_PW);
});

afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, OFFICE_EMAIL, OTHER_EMAIL, ARCHIVED_EMAIL] } } });
});

const put = (id, body, token = adminToken) =>
    request(app).put(`/api/auth/users/${id}`).set('Authorization', `Bearer ${token}`).send(body);

describe('PUT /api/auth/users/:id', () => {
    test('renames an inactive user, same email, no conflict', async () => {
        const res = await put(officeUser.id, { name: 'New Hire' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Hire');
        expect(res.body.email).toBe(OFFICE_EMAIL);
    });

    test('reactivate + new password in one call lets the new hire log in', async () => {
        const res = await put(officeUser.id, { name: 'New Hire', password: 'brandnew1', active: true });
        expect(res.status).toBe(200);
        expect(res.body.active).toBe(true);
        expect((await login(OFFICE_EMAIL, 'brandnew1'))).toBeTruthy();
        expect((await login(OFFICE_EMAIL, 'oldpass1'))).toBeFalsy();
    });

    test('409 when new email belongs to a different active user', async () => {
        const res = await put(officeUser.id, { email: OTHER_EMAIL });
        expect(res.status).toBe(409);
    });

    test('409 when new email belongs to a different archived user', async () => {
        const res = await put(officeUser.id, { email: ARCHIVED_EMAIL });
        expect(res.status).toBe(409);
    });

    test('allows setting email to the user own current email (no-op)', async () => {
        const res = await put(officeUser.id, { email: OFFICE_EMAIL.toUpperCase() });
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(OFFICE_EMAIL);
    });

    test('role change bumps permissionsVersion (forces re-login)', async () => {
        const before = await prisma.user.findUnique({ where: { id: officeUser.id } });
        await put(officeUser.id, { role: 'pca' });
        const after = await prisma.user.findUnique({ where: { id: officeUser.id } });
        expect(after.permissionsVersion).toBe(before.permissionsVersion + 1);
    });

    test('self-guard: admin cannot change own role or active, but can change own name', async () => {
        expect((await put(adminId, { role: 'user' })).status).toBe(400);
        expect((await put(adminId, { active: false })).status).toBe(400);
        expect((await put(adminId, { name: 'Renamed Admin' })).status).toBe(200);
    });

    test('writes an UPDATE audit row with no plaintext password', async () => {
        await put(officeUser.id, { name: 'Audited Hire', password: 'brandnew1' });
        const log = await prisma.auditLog.findFirst({
            where: { entityType: 'User', entityId: officeUser.id, action: 'UPDATE' },
            orderBy: { createdAt: 'desc' },
        });
        expect(log).toBeTruthy();
        expect(JSON.stringify(log)).not.toContain('brandnew1');
    });

    test('403 for a non-admin caller', async () => {
        const pcaHash = await bcrypt.hash('pcapass1', 10);
        const pca = await prisma.user.create({ data: { email: 'uu-pca@test.com', passwordHash: pcaHash, name: 'PCA', role: 'pca', active: true } });
        const pcaToken = await login('uu-pca@test.com', 'pcapass1');
        const res = await put(officeUser.id, { name: 'Nope' }, pcaToken);
        expect(res.status).toBe(403);
        await prisma.user.delete({ where: { id: pca.id } });
    });
});
