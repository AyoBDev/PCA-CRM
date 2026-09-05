const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');

// When a user's password changes, every existing session for that user must be
// invalidated so they are forced to log in again with the new password.
// The app already invalidates a token whenever its `permissionsVersion` no
// longer matches the DB (authMiddleware returns 401 `permissions_changed`,
// which the frontend turns into an auto-logout). So a password change must
// bump `permissionsVersion`.

const ADMIN_EMAIL = 'pwlogout-admin@test.com';
const USER_EMAIL = 'pwlogout-user@test.com';
const OLD_PASSWORD = 'oldpass123';
const NEW_PASSWORD = 'newpass456';

let adminToken;
let targetUser;

// These fixtures use fixed emails, so a run that crashes before afterAll
// leaves rows behind and every later run dies on the (agency_id, email)
// unique constraint. Clearing first makes the suite self-healing instead of
// needing the rows removed by hand.
async function purgeFixtures() {
    const users = await prisma.user.findMany({
        where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } },
        select: { id: true },
    });
    if (users.length) {
        const userIds = users.map((u) => u.id);
        await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
}

beforeAll(async () => {
    await purgeFixtures();

    const adminHash = await bcrypt.hash('secret123', 10);
    const userHash = await bcrypt.hash(OLD_PASSWORD, 10);

    await prisma.user.create({
        data: { email: ADMIN_EMAIL, passwordHash: adminHash, name: 'PwLogout Admin', role: 'admin', agencyId: 1 },
    });
    targetUser = await prisma.user.create({
        data: { email: USER_EMAIL, passwordHash: userHash, name: 'PwLogout User', role: 'user', status: 'active', active: true, agencyId: 1 },
    });

    adminToken = (await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: ADMIN_EMAIL, password: 'secret123' })).body.token;
});

afterAll(async () => {
    // Reuses the same purge as beforeAll: it is keyed off the fixture emails
    // rather than targetUser, so it still cleans up when beforeAll failed
    // partway (dereferencing targetUser.id there would throw and mask the
    // original error).
    await purgeFixtures();
});

describe('admin reset-password logs the user out of existing sessions', () => {
    it('invalidates the old token and lets the user back in with the new password', async () => {
        // 1. User logs in and gets a working token.
        const loginRes = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: USER_EMAIL, password: OLD_PASSWORD });
        expect(loginRes.status).toBe(200);
        const oldToken = loginRes.body.token;

        // The token works before the password change.
        const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
        expect(before.status).toBe(200);

        // 2. Admin resets the user's password.
        const resetRes = await request(app)
            .put(`/api/auth/users/${targetUser.id}/reset-password`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ password: NEW_PASSWORD });
        expect(resetRes.status).toBe(200);

        // 3. The old token is now rejected -> the user is forced to log out.
        const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
        expect(after.status).toBe(401);
        expect(after.body.error).toBe('permissions_changed');

        // 4. The old password no longer works, the new one does.
        const oldPwLogin = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: USER_EMAIL, password: OLD_PASSWORD });
        expect(oldPwLogin.status).toBe(401);

        const newPwLogin = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: USER_EMAIL, password: NEW_PASSWORD });
        expect(newPwLogin.status).toBe(200);
        expect(newPwLogin.body.token).toBeTruthy();
    });
});

describe('self-service reset-password-with-token logs the user out of existing sessions', () => {
    it('invalidates the old token after the user resets their own password', async () => {
        // Start from the NEW_PASSWORD state left by the previous test.
        const loginRes = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: USER_EMAIL, password: NEW_PASSWORD });
        expect(loginRes.status).toBe(200);
        const oldToken = loginRes.body.token;

        const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
        expect(before.status).toBe(200);

        // Create a valid reset token directly (mirrors what forgot-password issues).
        const resetToken = await prisma.passwordResetToken.create({
            data: { userId: targetUser.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000), agencyId: 1 },
        });

        const finalPassword = 'finalpass789';
        const res = await request(app)
            .post('/api/auth/reset-password-with-token')
            .set('Host', 'nvbest.localhost')
            .send({ token: resetToken.token, password: finalPassword });
        expect(res.status).toBe(200);

        // The session held before the reset is now invalid.
        const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
        expect(after.status).toBe(401);
        expect(after.body.error).toBe('permissions_changed');

        // The new password works.
        const newLogin = await request(app).post('/api/auth/login').set('Host', 'nvbest.localhost').send({ email: USER_EMAIL, password: finalPassword });
        expect(newLogin.status).toBe(200);
    });
});
