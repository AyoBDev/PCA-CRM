jest.mock('../../services/auditService', () => ({
    logAction: jest.fn(),
    diffFields: jest.fn(() => []),
}));

const bcrypt = require('bcryptjs');
const audit = require('../../services/auditService');
const { updateUser } = require('../authController');

// updateUser reads and writes exclusively through req.db (the agency-scoped
// tenant client). These tests supply a mocked req.db so we verify BOTH the
// behavior and that the controller never touches the RLS-bypassing owner
// client — findFirst (not findUnique) is used for the email check because
// email alone is no longer a unique key under multi-tenancy.
function makeDb() {
    return {
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        permissionGroup: {
            findUnique: jest.fn(),
        },
    };
}

function mockReqRes(overrides = {}) {
    const db = overrides.db || makeDb();
    const req = {
        params: { id: '2' },
        body: {},
        user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
        db,
        ...overrides,
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return { req, res, next, db };
}

const INACTIVE_USER = {
    id: 2, email: 'office@agency.test', name: 'Araceli Mongalvo',
    role: 'user', phone: '', active: false, permissionGroupId: null, permissionsVersion: 3,
};

describe('updateUser', () => {
    test('renames the target using req.db.user.update (never the owner client)', async () => {
        const { req, res, next, db } = mockReqRes({ body: { name: 'New Hire' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, name: 'New Hire' });

        await updateUser(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.user.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ name: 'New Hire' }) })
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Hire' }));
    });

    test('email uniqueness check uses agency-scoped findFirst, not findUnique', async () => {
        const { req, res, next, db } = mockReqRes({ body: { email: 'Office@Agency.Test' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.findFirst.mockResolvedValue({ ...INACTIVE_USER }); // same row -> allowed
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, email: 'office@agency.test' });

        await updateUser(req, res, next);

        expect(db.user.findFirst).toHaveBeenCalledWith({ where: { email: 'office@agency.test' } });
        expect(res.status).not.toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ email: 'office@agency.test' }));
    });

    test('409 when the email belongs to a different user in the agency', async () => {
        const { req, res, next, db } = mockReqRes({ body: { email: 'taken@agency.test' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.findFirst.mockResolvedValue({ id: 99, email: 'taken@agency.test' }); // different row

        await updateUser(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(db.user.update).not.toHaveBeenCalled();
    });

    test('reactivate + new password hashes password and bumps permissionsVersion', async () => {
        const { req, res, next, db } = mockReqRes({ body: { password: 'brandnew1', active: true } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, active: true });

        await updateUser(req, res, next);

        const data = db.user.update.mock.calls[0][0].data;
        expect(data.active).toBe(true);
        expect(data.passwordHash).toBeDefined();
        expect(await bcrypt.compare('brandnew1', data.passwordHash)).toBe(true);
        expect(data.permissionsVersion).toEqual({ increment: 1 });
    });

    test('role change bumps permissionsVersion', async () => {
        const { req, res, next, db } = mockReqRes({ body: { role: 'pca' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, role: 'pca' });

        await updateUser(req, res, next);

        expect(db.user.update.mock.calls[0][0].data.permissionsVersion).toEqual({ increment: 1 });
    });

    test('name-only change does NOT bump permissionsVersion', async () => {
        const { req, res, next, db } = mockReqRes({ body: { name: 'Just A Rename' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, name: 'Just A Rename' });

        await updateUser(req, res, next);

        expect(db.user.update.mock.calls[0][0].data.permissionsVersion).toBeUndefined();
    });

    test('404 when the user is not in this agency (findUnique returns null)', async () => {
        const { req, res, next, db } = mockReqRes({ body: { name: 'X' } });
        db.user.findUnique.mockResolvedValue(null);

        await updateUser(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(db.user.update).not.toHaveBeenCalled();
    });

    test('self-guard: admin cannot change own role or active', async () => {
        const db1 = makeDb();
        db1.user.findUnique.mockResolvedValue({ ...INACTIVE_USER, id: 1, role: 'admin', active: true });
        const r1 = mockReqRes({ params: { id: '1' }, body: { role: 'user' }, db: db1 });
        await updateUser(r1.req, r1.res, r1.next);
        expect(r1.res.status).toHaveBeenCalledWith(400);
        expect(db1.user.update).not.toHaveBeenCalled();

        const db2 = makeDb();
        db2.user.findUnique.mockResolvedValue({ ...INACTIVE_USER, id: 1, role: 'admin', active: true });
        const r2 = mockReqRes({ params: { id: '1' }, body: { active: false }, db: db2 });
        await updateUser(r2.req, r2.res, r2.next);
        expect(r2.res.status).toHaveBeenCalledWith(400);
    });

    test('permission group validated via req.db.permissionGroup', async () => {
        const { req, res, next, db } = mockReqRes({ body: { role: 'user', permissionGroupId: 5 } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.permissionGroup.findUnique.mockResolvedValue({ id: 5, archivedAt: null });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, permissionGroupId: 5 });

        await updateUser(req, res, next);

        expect(db.permissionGroup.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
        expect(db.user.update.mock.calls[0][0].data.permissionGroupId).toBe(5);
    });

    test('audit UPDATE logged with passwordChanged flag but no plaintext', async () => {
        const { req, res, next, db } = mockReqRes({ body: { name: 'Audited', password: 'brandnew1' } });
        db.user.findUnique.mockResolvedValue({ ...INACTIVE_USER });
        db.user.update.mockResolvedValue({ ...INACTIVE_USER, name: 'Audited' });

        await updateUser(req, res, next);

        expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'UPDATE', entityType: 'User', entityId: 2,
            metadata: { passwordChanged: true },
        }));
        const logged = JSON.stringify(audit.logAction.mock.calls[0][0]);
        expect(logged).not.toContain('brandnew1');
    });
});
