// Route-surface tests for POST /api/platform/demo-agency.
//
// The endpoint is destructive (it wipes and rebuilds the demo tenant), so what
// matters here is that it is unreachable except as a superadmin on the platform
// host, and that the slug it targets is fixed server-side.

const express = require('express');
const request = require('supertest');

// `mock`-prefixed so jest's hoisted module factories may reference it.
const mockProvision = jest.fn();

// Build an app that mounts the real platform router behind a stubbed user.
function makeApp({ user, isPlatformHost }) {
    jest.resetModules();
    jest.doMock('../src/middleware/authMiddleware', () => ({
        authenticate: (req, _res, next) => { req.user = user; next(); },
        requireRole: (...roles) => (req, res, next) =>
            (req.user && roles.includes(req.user.role))
                ? next()
                : res.status(403).json({ error: 'Forbidden' }),
    }));
    jest.doMock('../src/controllers/backupController', () => ({ platformBackup: (_q, r) => r.json({}) }));
    jest.doMock('../src/services/demoAgencyService', () => ({ provisionDemoAgency: mockProvision }));
    jest.doMock('../src/middleware/resolveAgency', () => ({ clearAgencyCache: jest.fn() }));
    jest.doMock('../src/lib/prisma', () => ({}));
    jest.doMock('../src/services/auditService', () => ({ logAction: jest.fn() }));

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = user; req.isPlatformHost = isPlatformHost; next(); });
    app.use('/api/platform', require('../src/routes/platform'));
    return app;
}

const SUPERADMIN = { id: 1, name: 'Root', role: 'superadmin' };
const ADMIN = { id: 2, name: 'Agency Admin', role: 'admin' };

describe('POST /api/platform/demo-agency', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProvision.mockResolvedValue({
            agency: { id: 9, name: 'Silver Sage Home Care (Demo)', slug: 'demo' },
            adminEmail: 'admin@demo.local',
            adminPassword: 'Demo-abc123',
            caregiverPassword: 'DemoPass1234!',
            counts: { clients: 8 },
            reset: false,
        });
    });

    it('provisions the demo agency for a superadmin on the platform host', async () => {
        const res = await request(makeApp({ user: SUPERADMIN, isPlatformHost: true }))
            .post('/api/platform/demo-agency').send({});
        expect(res.status).toBe(201);
        expect(mockProvision).toHaveBeenCalledTimes(1);
        expect(res.body.agency.slug).toBe('demo');
        expect(res.body.adminEmail).toBe('admin@demo.local');
    });

    it('returns the one-time admin password so the demoer can sign in', async () => {
        const res = await request(makeApp({ user: SUPERADMIN, isPlatformHost: true }))
            .post('/api/platform/demo-agency').send({});
        expect(res.body.adminPassword).toBe('Demo-abc123');
    });

    it('ignores any slug supplied by the caller — the target is fixed server-side', async () => {
        await request(makeApp({ user: SUPERADMIN, isPlatformHost: true }))
            .post('/api/platform/demo-agency')
            .send({ slug: 'a-real-agency', agencyId: 3 });
        // The service takes no slug/id from the request at all.
        const arg = mockProvision.mock.calls[0][0];
        expect(arg.slug).toBeUndefined();
        expect(arg.agencyId).toBeUndefined();
    });

    it('is 403 for a non-superadmin', async () => {
        const res = await request(makeApp({ user: ADMIN, isPlatformHost: true }))
            .post('/api/platform/demo-agency').send({});
        expect(res.status).toBe(403);
        expect(mockProvision).not.toHaveBeenCalled();
    });

    it('is 404 off the platform host, so the route is not discoverable', async () => {
        const res = await request(makeApp({ user: SUPERADMIN, isPlatformHost: false }))
            .post('/api/platform/demo-agency').send({});
        expect(res.status).toBe(404);
        expect(mockProvision).not.toHaveBeenCalled();
    });
});
