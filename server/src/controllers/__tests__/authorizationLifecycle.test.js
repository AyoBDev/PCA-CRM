const prisma = require('../../lib/prisma');
const ctrl = require('../authorizationController');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}
const user = { id: 1, name: 'Tester', role: 'admin' };

describe('renewAuthorization', () => {
    let client, oldAuth;
    beforeEach(async () => {
        client = await prisma.client.create({ data: { clientName: 'Renew Test' } });
        oldAuth = await prisma.authorization.create({
            data: {
                clientId: client.id, serviceCode: 'PCS', serviceName: 'Personal Care',
                authorizationNumber: 'A-OLD', authorizedUnits: 40,
                authorizationStartDate: new Date('2025-06-01T00:00:00'),
                authorizationEndDate: new Date('2026-05-31T00:00:00'),
                accountNumber: 'ACCT-1', sandataClientId: 'SAND-1', manualStatus: 'active',
            },
        });
    });
    afterEach(async () => {
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('closes old auth day-before new start and links the chain', async () => {
        const req = {
            params: { id: String(oldAuth.id) }, user,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: '2026-06-01', authorizationEndDate: '2027-05-31',
                notes: 'Hours Increased — 40 to 48',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const newAuth = await prisma.authorization.findUnique({ where: { id: res.body.id } });
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });

        // Old auto-closes the day before the new start; no overlap.
        expect(reloadedOld.authorizationEndDate.toISOString().slice(0, 10)).toBe('2026-05-31');
        expect(reloadedOld.manualStatus).toBe('inactive');
        expect(reloadedOld.closedAt).not.toBeNull();
        expect(reloadedOld.renewedToId).toBe(newAuth.id);
        // New links back and inherits account/sandata.
        expect(newAuth.renewedFromId).toBe(oldAuth.id);
        expect(newAuth.manualStatus).toBe('active');
        expect(newAuth.accountNumber).toBe('ACCT-1');
        expect(newAuth.sandataClientId).toBe('SAND-1');
        expect(newAuth.notes).toBe('Hours Increased — 40 to 48');
    });
});

describe('inactivateAuthorization', () => {
    let client, auth;
    beforeEach(async () => {
        client = await prisma.client.create({ data: { clientName: 'Inactive Test' } });
        auth = await prisma.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        });
    });
    afterEach(async () => {
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('marks inactive with end date, reason, and note', async () => {
        const req = {
            params: { id: String(auth.id) }, user,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency', inactiveNote: 'Moved to Henderson.' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.manualStatus).toBe('inactive');
        expect(reloaded.inactiveReason).toBe('Client transferred to another agency');
        expect(reloaded.inactiveNote).toBe('Moved to Henderson.');
        expect(reloaded.authorizationEndDate.toISOString().slice(0, 10)).toBe('2026-03-15');
        expect(reloaded.closedAt).not.toBeNull();
    });

    it('rejects a blank/missing inactiveReason with 400 and leaves the auth active', async () => {
        const req = {
            params: { id: String(auth.id) }, user,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: '   ', inactiveNote: 'Moved to Henderson.' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Reason is required' });
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.manualStatus).not.toBe('inactive');
    });

    it('rejects a missing authorizationEndDate with 400 and leaves the auth active', async () => {
        const req = {
            params: { id: String(auth.id) }, user,
            body: { inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'End date is required' });
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.manualStatus).not.toBe('inactive');
    });

    it('rejects a malformed authorizationEndDate with 400 and leaves the auth active', async () => {
        const req = {
            params: { id: String(auth.id) }, user,
            body: { authorizationEndDate: 'not-a-date', inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid end date' });
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.manualStatus).not.toBe('inactive');
    });

    it('rejects an invalid id with 400', async () => {
        const req = {
            params: { id: 'abc' }, user,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid id' });
    });

    it('returns 404 for a well-formed body pointing at a nonexistent id', async () => {
        const req = {
            params: { id: String(auth.id + 999999) }, user,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(404);
    });
});

describe('updateAuthManualStatus validation', () => {
    it('rejects pending', async () => {
        const req = { params: { id: '1' }, user, body: { manualStatus: 'pending' } };
        const res = mockRes();
        await ctrl.updateAuthManualStatus(req, res, () => {});
        expect(res.statusCode).toBe(400);
    });
});

describe('notes separation', () => {
    it('editing an auth note does not touch client.notes', async () => {
        const client = await prisma.client.create({ data: { clientName: 'Sep Test', notes: 'GATE 1234' } });
        const auth = await prisma.authorization.create({ data: { clientId: client.id, serviceCode: 'PCS', notes: 'orig' } });
        const req = { params: { id: String(auth.id) }, user, body: { serviceCode: 'PCS', notes: 'renewal note edited' } };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });
        const reloadedClient = await prisma.client.findUnique({ where: { id: client.id } });
        expect(reloadedClient.notes).toBe('GATE 1234');
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });
});
