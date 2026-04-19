const prisma = require('../lib/prisma');
const { enrichClient } = require('../services/authorizationService');

// GET /api/clients
async function listClients(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const clients = await prisma.client.findMany({
            where,
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(clients.map(enrichClient));
    } catch (err) {
        next(err);
    }
}

// GET /api/clients/:id
async function getClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({
            where: { id },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json(enrichClient(client));
    } catch (err) {
        next(err);
    }
}

// POST /api/clients
async function createClient(req, res, next) {
    try {
        const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices } = req.body;
        if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
            return res.status(400).json({ error: 'clientName is required' });
        }
        const client = await prisma.client.create({
            data: {
                clientName: clientName.trim(),
                medicaidId: (medicaidId || '').trim(),
                insuranceType: insuranceType || 'MEDICAID',
                address: (address || '').trim(),
                phone: (phone || '').trim(),
                gateCode: (gateCode || '').trim(),
                notes: (notes || '').trim(),
                enabledServices: enabledServices || '["PAS","Homemaker"]',
            },
            include: { authorizations: true },
        });
        res.status(201).json(enrichClient(client));
    } catch (err) {
        next(err);
    }
}

// PUT /api/clients/:id
async function updateClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices } = req.body;
        if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
            return res.status(400).json({ error: 'clientName is required' });
        }
        const client = await prisma.client.update({
            where: { id },
            data: {
                clientName: clientName.trim(),
                medicaidId: (medicaidId || '').trim(),
                insuranceType: insuranceType || 'MEDICAID',
                address: (address || '').trim(),
                phone: (phone || '').trim(),
                gateCode: (gateCode || '').trim(),
                notes: (notes || '').trim(),
                enabledServices: enabledServices || '["PAS","Homemaker"]',
            },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        res.json(enrichClient(client));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
        next(err);
    }
}

// PATCH /api/clients/:id
async function patchClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { address, phone, gateCode, notes, enabledServices } = req.body;
        const data = {};
        if (address !== undefined) data.address = address;
        if (phone !== undefined) data.phone = phone;
        if (gateCode !== undefined) data.gateCode = gateCode;
        if (notes !== undefined) data.notes = notes;
        if (enabledServices !== undefined) data.enabledServices = enabledServices;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const client = await prisma.client.update({
            where: { id },
            data,
            include: { authorizations: true },
        });
        res.json(client);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
        next(err);
    }
}

// DELETE /api/clients/:id  (soft-delete → archive)
async function deleteClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
        const archived = await prisma.client.update({ where: { id }, data: { archivedAt: now }, include: { authorizations: true } });
        res.json(archived);
    } catch (err) {
        next(err);
    }
}

// POST /api/clients/bulk-delete  (soft-delete → archive)
async function bulkDelete(req, res, next) {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }
        const numericIds = ids.map(Number).filter(n => !isNaN(n));
        const now = new Date();
        await prisma.shift.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.timesheet.updateMany({ where: { clientId: { in: numericIds }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.client.updateMany({ where: { id: { in: numericIds } }, data: { archivedAt: now } });
        res.json({ archived: numericIds.length });
    } catch (err) {
        next(err);
    }
}

// PUT /api/clients/:id/restore
async function restoreClient(req, res, next) {
    try {
        const id = Number(req.params.id);
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        await prisma.shift.updateMany({ where: { clientId: id, archivedAt: { not: null } }, data: { archivedAt: null } });
        await prisma.timesheet.updateMany({ where: { clientId: id, archivedAt: { not: null } }, data: { archivedAt: null } });
        const restored = await prisma.client.update({
            where: { id }, data: { archivedAt: null },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });
        res.json(enrichClient(restored));
    } catch (err) {
        next(err);
    }
}

// POST /api/clients/bulk-import
async function bulkImport(req, res, next) {
    try {
        const { clients: rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'clients array is required' });
        }

        const results = [];

        for (const row of rows) {
            if (!row.clientName || !row.clientName.trim()) continue;

            // Create or find client
            let client = await prisma.client.findFirst({
                where: { clientName: row.clientName.trim() },
            });

            if (!client) {
                client = await prisma.client.create({
                    data: {
                        clientName: row.clientName.trim(),
                        medicaidId: (row.medicaidId || '').trim(),
                        insuranceType: row.insuranceType || 'MEDICAID',
                    },
                });
            }

            // Create authorizations if provided
            if (Array.isArray(row.authorizations)) {
                for (const auth of row.authorizations) {
                    if (!auth.serviceCode) continue;
                    await prisma.authorization.create({
                        data: {
                            clientId: client.id,
                            serviceCategory: (auth.serviceCategory || '').trim(),
                            serviceCode: auth.serviceCode.trim(),
                            serviceName: (auth.serviceName || '').trim(),
                            authorizedUnits: parseInt(auth.authorizedUnits) || 0,
                            authorizationStartDate: auth.authorizationStartDate
                                ? new Date(auth.authorizationStartDate)
                                : null,
                            authorizationEndDate: auth.authorizationEndDate
                                ? new Date(auth.authorizationEndDate)
                                : null,
                            notes: (auth.notes || '').trim(),
                        },
                    });
                }
            }

            results.push({ clientName: client.clientName, id: client.id });
        }

        // Return all clients enriched
        const allClients = await prisma.client.findMany({
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
        });

        res.status(201).json({
            imported: results.length,
            clients: allClients.map(enrichClient),
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { listClients, getClient, createClient, updateClient, patchClient, deleteClient, bulkDelete, bulkImport, restoreClient };
