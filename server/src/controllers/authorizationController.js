const prisma = require('../lib/prisma');
const { enrichAuthorization, enrichClient } = require('../services/authorizationService');
const audit = require('../services/auditService');

const VALID_SERVICE_CODES = ['PCS', 'SDPC', 'TIMESHEETS', 'TIMESHEET_PCS', 'TIMESHEET_HOMEMAKER', 'TIMESHEET_RESPITE', 'TIMESHEET_COMPANION', 'TIMESHEET_CHORE', 'S5120', 'S5125', 'S5130', 'S5135', 'S5150', 'PAS', 'COPE'];

function validateBody(body) {
    const { serviceCode } = body;
    const errors = [];
    if (!serviceCode || !VALID_SERVICE_CODES.includes(serviceCode)) {
        errors.push(`serviceCode must be one of: ${VALID_SERVICE_CODES.join(', ')}`);
    }
    return errors;
}

async function deactivatePreviousAuths(clientId, serviceCode, excludeId, auditContext) {
    const existing = await prisma.authorization.findMany({
        where: {
            clientId,
            serviceCode,
            manualStatus: 'active',
            archivedAt: null,
            id: { not: excludeId },
        },
    });
    if (existing.length === 0) return;
    await prisma.authorization.updateMany({
        where: { id: { in: existing.map(a => a.id) } },
        data: { manualStatus: 'inactive' },
    });
    for (const auth of existing) {
        audit.logAction({
            ...auditContext,
            action: 'UPDATE',
            entityType: 'Authorization',
            entityId: auth.id,
            entityName: auth.serviceCode,
            changes: [{ field: 'manualStatus', oldValue: 'active', newValue: 'inactive' }],
            metadata: { reason: 'superseded_by_new_auth' },
        });
    }
}

// POST /api/clients/:clientId/authorizations
async function createAuthorization(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const errors = validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const auth = await prisma.authorization.create({
            data: {
                clientId,
                serviceCategory: (req.body.serviceCategory || '').trim(),
                serviceCode: req.body.serviceCode,
                serviceName: (req.body.serviceName || '').trim(),
                authorizationNumber: (req.body.authorizationNumber || '').trim(),
                authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                authorizedHours: parseFloat(req.body.authorizedHours) || 0,
                authorizationStartDate: req.body.authorizationStartDate
                    ? new Date(req.body.authorizationStartDate)
                    : null,
                authorizationEndDate: req.body.authorizationEndDate ? new Date(req.body.authorizationEndDate) : null,
                notes: (req.body.notes || '').trim(),
                accountNumber: (req.body.accountNumber || '').trim(),
                sandataClientId: (req.body.sandataClientId || '').trim(),
            },
        });

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Authorization', entityId: auth.id, entityName: `${client.clientName} - ${auth.serviceCode}` });
        await deactivatePreviousAuths(clientId, req.body.serviceCode, auth.id, {
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        });
        res.status(201).json(enrichAuthorization(auth));
    } catch (err) {
        next(err);
    }
}

// PUT /api/authorizations/:id
async function updateAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const errors = validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const oldAuth = await prisma.authorization.findUnique({ where: { id } });
        const auth = await prisma.authorization.update({
            where: { id },
            data: {
                serviceCategory: (req.body.serviceCategory || '').trim(),
                serviceCode: req.body.serviceCode,
                serviceName: (req.body.serviceName || '').trim(),
                authorizationNumber: (req.body.authorizationNumber || '').trim(),
                authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                authorizedHours: parseFloat(req.body.authorizedHours) || 0,
                authorizationStartDate: req.body.authorizationStartDate
                    ? new Date(req.body.authorizationStartDate)
                    : null,
                authorizationEndDate: req.body.authorizationEndDate ? new Date(req.body.authorizationEndDate) : null,
                notes: (req.body.notes || '').trim(),
                accountNumber: (req.body.accountNumber || '').trim(),
                sandataClientId: (req.body.sandataClientId || '').trim(),
                ...(req.body.manualStatus && { manualStatus: req.body.manualStatus }),
            },
        });

        if (req.body.serviceCode !== oldAuth.serviceCode || (auth.manualStatus === 'active' && oldAuth.manualStatus !== 'active')) {
            await deactivatePreviousAuths(auth.clientId, auth.serviceCode, auth.id, {
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            });
        }

        const changes = audit.diffFields(oldAuth, auth, ['serviceCode', 'serviceName', 'authorizationNumber', 'authorizedUnits', 'authorizedHours', 'authorizationStartDate', 'authorizationEndDate', 'notes', 'accountNumber', 'sandataClientId', 'manualStatus']);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Authorization', entityId: auth.id, entityName: auth.serviceCode, changes });
        res.json(enrichAuthorization(auth));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
        next(err);
    }
}

// PUT /api/authorizations/:id/archive
async function archiveAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const auth = await prisma.authorization.findUnique({ where: { id } });
        if (!auth) return res.status(404).json({ error: 'Authorization not found' });

        const archived = await prisma.authorization.update({
            where: { id },
            data: { archivedAt: new Date() },
        });

        // Log affected shifts for visibility
        const affectedShifts = await prisma.shift.count({
            where: { clientId: auth.clientId, serviceCode: auth.serviceCode, archivedAt: null },
        });

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Authorization', entityId: id, entityName: auth.serviceCode, metadata: { affectedShifts } });
        res.json(enrichAuthorization(archived));
    } catch (err) {
        next(err);
    }
}

// PUT /api/authorizations/:id/restore
async function restoreAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const auth = await prisma.authorization.findUnique({ where: { id } });
        if (!auth) return res.status(404).json({ error: 'Authorization not found' });

        const restored = await prisma.authorization.update({
            where: { id },
            data: { archivedAt: null },
        });

        if ((restored.manualStatus || 'active') === 'active') {
            await deactivatePreviousAuths(restored.clientId, restored.serviceCode, restored.id, {
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            });
        }

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Authorization', entityId: id, entityName: auth.serviceCode });
        res.json(enrichAuthorization(restored));
    } catch (err) {
        next(err);
    }
}

// DELETE /api/authorizations/:id
async function deleteAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const auth = await prisma.authorization.findUnique({ where: { id } });
        if (!auth) return res.status(404).json({ error: 'Authorization not found' });

        await prisma.authorization.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'DELETE', entityType: 'Authorization', entityId: id, entityName: auth.serviceCode });

        const client = await prisma.client.findUnique({
            where: { id: auth.clientId },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });

        res.json(client ? enrichClient(client) : { deleted: true });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/authorizations/:id/account-number
async function updateAccountNumber(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { accountNumber } = req.body;
        const auth = await prisma.authorization.update({
            where: { id },
            data: { accountNumber: (accountNumber || '').trim() },
        });
        // Propagate to active shifts for this client + serviceCode
        await prisma.shift.updateMany({
            where: { clientId: auth.clientId, serviceCode: auth.serviceCode, archivedAt: null },
            data: { accountNumber: (accountNumber || '').trim() },
        });
        res.json(enrichAuthorization(auth));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
        next(err);
    }
}

// PATCH /api/authorizations/:id/sandata-client-id
async function updateSandataClientId(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { sandataClientId } = req.body;
        const auth = await prisma.authorization.update({
            where: { id },
            data: { sandataClientId: (sandataClientId || '').trim() },
        });
        // Propagate to active shifts for this client + serviceCode
        await prisma.shift.updateMany({
            where: { clientId: auth.clientId, serviceCode: auth.serviceCode, archivedAt: null },
            data: { sandataClientId: (sandataClientId || '').trim() },
        });
        res.json(enrichAuthorization(auth));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
        next(err);
    }
}

async function updateAuthManualStatus(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { manualStatus } = req.body;
        if (!['active', 'pending', 'inactive'].includes(manualStatus)) {
            return res.status(400).json({ error: 'Invalid status. Must be active, pending, or inactive.' });
        }
        const oldAuth = await prisma.authorization.findUnique({ where: { id } });
        if (!oldAuth) return res.status(404).json({ error: 'Authorization not found' });

        const auth = await prisma.authorization.update({
            where: { id },
            data: { manualStatus },
        });

        if (manualStatus === 'active') {
            await deactivatePreviousAuths(oldAuth.clientId, auth.serviceCode, auth.id, {
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            });
        }

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Authorization', entityId: id, entityName: auth.serviceCode, changes: [{ field: 'manualStatus', oldValue: oldAuth.manualStatus, newValue: manualStatus }] });
        res.json(enrichAuthorization(auth));
    } catch (err) { next(err); }
}

// POST /api/authorizations/:id/renew
async function renewAuthorization(req, res, next) {
    try {
        const oldId = Number(req.params.id);
        const oldAuth = await prisma.authorization.findUnique({ where: { id: oldId } });
        if (!oldAuth) return res.status(404).json({ error: 'Authorization not found' });

        const errors = validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const clientId = oldAuth.clientId;
        const [newAuth] = await prisma.$transaction([
            prisma.authorization.create({
                data: {
                    clientId,
                    serviceCategory: (req.body.serviceCategory || '').trim(),
                    serviceCode: req.body.serviceCode,
                    serviceName: (req.body.serviceName || '').trim(),
                    authorizationNumber: (req.body.authorizationNumber || '').trim(),
                    authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                    authorizedHours: parseFloat(req.body.authorizedHours) || 0,
                    authorizationStartDate: req.body.authorizationStartDate
                        ? new Date(req.body.authorizationStartDate)
                        : null,
                    authorizationEndDate: req.body.authorizationEndDate
                        ? new Date(req.body.authorizationEndDate)
                        : null,
                    notes: (req.body.notes || '').trim(),
                    accountNumber: (req.body.accountNumber || '').trim(),
                    sandataClientId: (req.body.sandataClientId || '').trim(),
                    manualStatus: 'active',
                },
            }),
            prisma.authorization.update({
                where: { id: oldId },
                data: { manualStatus: 'inactive' },
            }),
        ]);

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Authorization', entityId: newAuth.id, entityName: `${req.body.serviceCode} (renewal)`, metadata: { renewedFromId: oldId } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Authorization', entityId: oldId, entityName: oldAuth.serviceCode, changes: [{ field: 'manualStatus', oldValue: oldAuth.manualStatus, newValue: 'inactive' }], metadata: { reason: 'renewed' } });

        res.status(201).json(enrichAuthorization(newAuth));
    } catch (err) {
        next(err);
    }
}

// POST /api/authorizations/dedup — one-time cleanup of duplicate authorizations
async function dedupAuthorizations(req, res, next) {
    try {
        const auths = await prisma.authorization.findMany({
            where: { archivedAt: null, manualStatus: 'active' },
            orderBy: [{ clientId: 'asc' }, { serviceCode: 'asc' }, { createdAt: 'asc' }],
            include: { client: { select: { clientName: true } } }
        });

        const groups = {};
        for (const a of auths) {
            const key = `${a.clientId}|${a.serviceCode}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        }

        const toDelete = [];
        const toMarkInactive = [];

        for (const [key, items] of Object.entries(groups)) {
            if (items.length <= 1) continue;

            const kept = items[0];
            for (let i = 1; i < items.length; i++) {
                const dupe = items[i];
                const sameUnits = dupe.authorizedUnits === kept.authorizedUnits;
                const noStartDate = !dupe.authorizationStartDate;
                const exactDateMatch =
                    kept.authorizationStartDate?.toISOString()?.split('T')[0] === dupe.authorizationStartDate?.toISOString()?.split('T')[0] &&
                    kept.authorizationEndDate?.toISOString()?.split('T')[0] === dupe.authorizationEndDate?.toISOString()?.split('T')[0];

                if (sameUnits && (noStartDate || exactDateMatch)) {
                    toDelete.push(dupe.id);
                }
            }

            // If oldest has no dates but newer has proper dates with same units, delete the oldest
            if (!kept.authorizationStartDate && !kept.authorizationEndDate) {
                for (let i = 1; i < items.length; i++) {
                    const newer = items[i];
                    if (newer.authorizedUnits === kept.authorizedUnits && newer.authorizationStartDate && !toDelete.includes(newer.id)) {
                        toDelete.push(kept.id);
                        break;
                    }
                }
            }

            // For remaining dupes: if one has an end date in the past, mark it inactive
            const today = new Date();
            const remaining = items.filter(i => !toDelete.includes(i.id));
            if (remaining.length > 1) {
                for (const r of remaining) {
                    if (r.authorizationEndDate && r.authorizationEndDate < today && r.id !== remaining[remaining.length - 1].id) {
                        toMarkInactive.push(r.id);
                    }
                }
            }
        }

        let deletedCount = 0;
        let inactiveCount = 0;

        if (toDelete.length > 0) {
            const result = await prisma.authorization.deleteMany({ where: { id: { in: toDelete } } });
            deletedCount = result.count;
        }

        if (toMarkInactive.length > 0) {
            const result = await prisma.authorization.updateMany({ where: { id: { in: toMarkInactive } }, data: { manualStatus: 'inactive' } });
            inactiveCount = result.count;
        }

        res.json({ deleted: deletedCount, markedInactive: inactiveCount, deletedIds: toDelete, inactiveIds: toMarkInactive });
    } catch (err) { next(err); }
}

module.exports = { createAuthorization, updateAuthorization, archiveAuthorization, restoreAuthorization, deleteAuthorization, updateAccountNumber, updateSandataClientId, updateAuthManualStatus, renewAuthorization, dedupAuthorizations };
