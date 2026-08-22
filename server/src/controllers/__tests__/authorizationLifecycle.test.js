const prisma = require('../../lib/prisma');
const { tenantClient } = require('../../lib/tenantPrisma');
const ctrl = require('../authorizationController');
const { enrichAuthorization, filterAuthsByWeek } = require('../../services/authorizationService');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}
// Controllers read req.db; use a real tenant-scoped client so creates
// auto-stamp agencyId (agency 1 = the seeded default agency).
const db = tenantClient(1);
const user = { id: 1, name: 'Tester', role: 'admin', agencyId: 1 };

describe('renewAuthorization', () => {
    let client, oldAuth;
    beforeEach(async () => {
        client = await db.client.create({ data: { clientName: 'Renew Test' } });
        oldAuth = await db.authorization.create({
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
            params: { id: String(oldAuth.id) }, user, db,
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

    // A renewal whose new start date is in the FUTURE must not retire the current
    // authorization before that date arrives. The old auth stays `active` (its
    // end date is moved to the day before the new start), so date-range filtering
    // keeps showing the current units in the Scheduler / Care Plan until the new
    // auth's start date, at which point the end date makes it drop out naturally.
    it('keeps the old auth active when the new start date is in the future', async () => {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        const futureStr = future.toISOString().slice(0, 10);
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: futureStr, authorizationEndDate: '2099-05-31',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });
        // Still active — must remain visible until the new auth's start date.
        expect(reloadedOld.manualStatus).toBe('active');
        // End date moved to the day before the new start so the two never overlap.
        const expectedEnd = new Date(futureStr + 'T00:00:00');
        expectedEnd.setDate(expectedEnd.getDate() - 1);
        expect(reloadedOld.authorizationEndDate.toISOString().slice(0, 10))
            .toBe(expectedEnd.toISOString().slice(0, 10));
        // Chain links still recorded so the renewal history is intact.
        expect(reloadedOld.renewedToId).toBe(res.body.id);
        expect(reloadedOld.closedAt).not.toBeNull();
    });

    // A renewal effective today (or in the past) genuinely closes the current
    // authorization immediately, so it should flip to inactive right away.
    it('retires the old auth immediately when the new start date is today or earlier', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: todayStr, authorizationEndDate: '2099-05-31',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });
        expect(reloadedOld.manualStatus).toBe('inactive');
    });

    // Explicit "Start immediately" override: even with a FUTURE start date, when
    // the modal chose immediate activation the current auth is retired now.
    it('retires the old auth now when renewalActivation is "immediate" despite a future start', async () => {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: future.toISOString().slice(0, 10),
                authorizationEndDate: '2099-05-31', renewalActivation: 'immediate',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });
        expect(reloadedOld.manualStatus).toBe('inactive');
    });

    // Explicit "Wait until start date" with a future start keeps the old auth active.
    it('keeps the old auth active when renewalActivation is "scheduled" and start is future', async () => {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: future.toISOString().slice(0, 10),
                authorizationEndDate: '2099-05-31', renewalActivation: 'scheduled',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(201);
        const reloadedOld = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });
        expect(reloadedOld.manualStatus).toBe('active');
    });

    // End-to-end guard on the actual Scheduler / Care Plan gate: after a
    // future-dated renewal, weekly authorization filtering must surface the
    // CURRENT auth (with its current units) for weeks before the new start, and
    // switch to the NEW auth for weeks on/after the new start. Reproduces the
    // reported bug where the current auth vanished (0 units) the moment a future
    // renewal was entered.
    it('filterAuthsByWeek shows current auth before the new start and the new auth after', async () => {
        // Old auth window: 2026-06-01 → 2026-12-31 (40 units). New auth: 2027-01-01 → ...
        await prisma.authorization.update({
            where: { id: oldAuth.id },
            data: {
                authorizationStartDate: new Date('2026-06-01T00:00:00'),
                authorizationEndDate: new Date('2026-12-31T00:00:00'),
                authorizedUnits: 40,
            },
        });
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', serviceName: 'Personal Care', authorizationNumber: 'A-NEW',
                authorizedUnits: 48, authorizationStartDate: '2027-01-01', authorizationEndDate: '2027-12-31',
            },
        };
        const res = mockRes();
        await ctrl.renewAuthorization(req, res, (e) => { throw e; });
        expect(res.statusCode).toBe(201);

        const auths = await prisma.authorization.findMany({ where: { clientId: client.id } });

        // A week in December 2026 (before the new start) → the current 40-unit auth.
        const beforeWeek = filterAuthsByWeek(auths, '2026-12-06', '2026-12-12');
        expect(beforeWeek).toHaveLength(1);
        expect(beforeWeek[0].authorizedUnits).toBe(40);
        expect(beforeWeek[0].id).toBe(oldAuth.id);

        // A week in January 2027 (on/after the new start) → the new 48-unit auth.
        const afterWeek = filterAuthsByWeek(auths, '2027-01-03', '2027-01-09');
        expect(afterWeek).toHaveLength(1);
        expect(afterWeek[0].authorizedUnits).toBe(48);
        expect(afterWeek[0].id).toBe(res.body.id);
    });
});

describe('inactivateAuthorization', () => {
    let client, auth;
    beforeEach(async () => {
        client = await db.client.create({ data: { clientName: 'Inactive Test' } });
        auth = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        });
    });
    afterEach(async () => {
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('marks inactive with end date, reason, and note', async () => {
        const req = {
            params: { id: String(auth.id) }, user, db,
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
            params: { id: String(auth.id) }, user, db,
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
            params: { id: String(auth.id) }, user, db,
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
            params: { id: String(auth.id) }, user, db,
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
            params: { id: 'abc' }, user, db,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid id' });
    });

    it('returns 404 for a well-formed body pointing at a nonexistent id', async () => {
        const req = {
            params: { id: String(auth.id + 999999) }, user, db,
            body: { authorizationEndDate: '2026-03-15', inactiveReason: 'Client transferred to another agency' },
        };
        const res = mockRes();
        await ctrl.inactivateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(404);
    });
});

describe('updateAuthManualStatus validation', () => {
    it('rejects pending', async () => {
        const req = { params: { id: '1' }, user, db, body: { manualStatus: 'pending' } };
        const res = mockRes();
        await ctrl.updateAuthManualStatus(req, res, () => {});
        expect(res.statusCode).toBe(400);
    });
});

describe('enrichAuthorization passthrough', () => {
    it('includes renewedFromId, renewedToId, inactiveReason, inactiveNote, closedAt', async () => {
        const client = await db.client.create({ data: { clientName: 'Enrich Passthrough Test' } });
        const oldAuth = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'inactive' },
        });
        const closedAt = new Date('2026-05-31T12:00:00Z');
        const newAuth = await db.authorization.create({
            data: {
                clientId: client.id, serviceCode: 'PCS', authorizedUnits: 48, manualStatus: 'active',
                renewedFromId: oldAuth.id,
            },
        });
        const updatedOld = await prisma.authorization.update({
            where: { id: oldAuth.id },
            data: {
                renewedToId: newAuth.id,
                inactiveReason: 'Client transferred to another agency',
                inactiveNote: 'Moved to Henderson.',
                closedAt,
            },
        });

        const enriched = enrichAuthorization(updatedOld);

        expect(enriched.renewedToId).toBe(newAuth.id);
        expect(enriched.renewedFromId).toBeNull();
        expect(enriched.inactiveReason).toBe('Client transferred to another agency');
        expect(enriched.inactiveNote).toBe('Moved to Henderson.');
        expect(enriched.closedAt).not.toBeNull();

        const enrichedNew = enrichAuthorization(newAuth);
        expect(enrichedNew.renewedFromId).toBe(oldAuth.id);

        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });
});

describe('updateAuthorization — lifecycle field clearing + skipDeactivate', () => {
    it('accepts and persists renewedToId/closedAt when present in the body (renew-undo restore)', async () => {
        const client = await db.client.create({ data: { clientName: 'Update Renew Fields Test' } });
        const oldAuth = await db.authorization.create({
            data: {
                clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40,
                authorizationEndDate: new Date('2026-05-31T00:00:00'),
                manualStatus: 'inactive', closedAt: new Date(), inactiveReason: '', inactiveNote: '',
            },
        });
        const newAuth = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 48, manualStatus: 'active', renewedFromId: oldAuth.id },
        });
        await prisma.authorization.update({ where: { id: oldAuth.id }, data: { renewedToId: newAuth.id } });

        // Undo restores the old auth's original end date and clears the renewal chain link.
        const req = {
            params: { id: String(oldAuth.id) }, user, db,
            body: {
                serviceCode: 'PCS', authorizedUnits: 40, authorizationEndDate: '2027-05-31',
                manualStatus: 'active', renewedToId: null, closedAt: null, skipDeactivate: true,
            },
        };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloaded = await prisma.authorization.findUnique({ where: { id: oldAuth.id } });
        expect(reloaded.renewedToId).toBeNull();
        expect(reloaded.closedAt).toBeNull();
        expect(reloaded.authorizationEndDate.toISOString().slice(0, 10)).toBe('2027-05-31');
        expect(reloaded.manualStatus).toBe('active');

        // Sibling (the new auth) must NOT have been deactivated by this undo.
        const reloadedNew = await prisma.authorization.findUnique({ where: { id: newAuth.id } });
        expect(reloadedNew.manualStatus).toBe('active');

        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('clears inactiveReason/inactiveNote/closedAt when present in the body (inactivate-undo restore)', async () => {
        const client = await db.client.create({ data: { clientName: 'Update Inactivate Fields Test' } });
        const auth = await db.authorization.create({
            data: {
                clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'inactive',
                inactiveReason: 'Client transferred to another agency', inactiveNote: 'Moved to Henderson.', closedAt: new Date(),
            },
        });

        const req = {
            params: { id: String(auth.id) }, user, db,
            body: {
                serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active',
                inactiveReason: '', inactiveNote: '', closedAt: null, skipDeactivate: true,
            },
        };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloaded = await prisma.authorization.findUnique({ where: { id: auth.id } });
        expect(reloaded.inactiveReason).toBe('');
        expect(reloaded.inactiveNote).toBe('');
        expect(reloaded.closedAt).toBeNull();
        expect(reloaded.manualStatus).toBe('active');

        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('skipDeactivate:true prevents a same-code sibling from being auto-inactivated', async () => {
        const client = await db.client.create({ data: { clientName: 'Skip Deactivate Test' } });
        const auth = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'inactive' },
        });
        const sibling = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        });

        const req = {
            params: { id: String(auth.id) }, user, db,
            body: { serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active', skipDeactivate: true },
        };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloadedSibling = await prisma.authorization.findUnique({ where: { id: sibling.id } });
        expect(reloadedSibling.manualStatus).toBe('active');

        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });

    it('without skipDeactivate, activating an auth still deactivates a same-code sibling (regression guard)', async () => {
        const client = await db.client.create({ data: { clientName: 'No Skip Deactivate Test' } });
        const auth = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'inactive' },
        });
        const sibling = await db.authorization.create({
            data: { clientId: client.id, serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        });

        const req = {
            params: { id: String(auth.id) }, user, db,
            body: { serviceCode: 'PCS', authorizedUnits: 40, manualStatus: 'active' },
        };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });

        expect(res.statusCode).toBe(200);
        const reloadedSibling = await prisma.authorization.findUnique({ where: { id: sibling.id } });
        expect(reloadedSibling.manualStatus).toBe('inactive');

        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });
});

describe('notes separation', () => {
    it('editing an auth note does not touch client.notes', async () => {
        const client = await db.client.create({ data: { clientName: 'Sep Test', notes: 'GATE 1234' } });
        const auth = await db.authorization.create({ data: { clientId: client.id, serviceCode: 'PCS', notes: 'orig' } });
        const req = { params: { id: String(auth.id) }, user, db, body: { serviceCode: 'PCS', notes: 'renewal note edited' } };
        const res = mockRes();
        await ctrl.updateAuthorization(req, res, (e) => { throw e; });
        const reloadedClient = await prisma.client.findUnique({ where: { id: client.id } });
        expect(reloadedClient.notes).toBe('GATE 1234');
        await prisma.authorization.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
    });
});
