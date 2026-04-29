const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

// GET /api/services
async function listServices(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const services = await prisma.service.findMany({
            where,
            orderBy: [{ category: 'asc' }, { code: 'asc' }],
        });
        res.json(services);
    } catch (err) {
        next(err);
    }
}

// POST /api/services
async function createService(req, res, next) {
    try {
        const { category, code, name } = req.body;
        if (!code || typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ error: 'code is required' });
        }
        const service = await prisma.service.create({
            data: {
                category: (category || '').trim().toUpperCase(),
                code: code.trim().toUpperCase(),
                name: (name || '').trim(),
            },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Service', entityId: service.id, entityName: service.code });
        res.status(201).json(service);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Service code already exists' });
        next(err);
    }
}

// PUT /api/services/:id
async function updateService(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { category, code, name } = req.body;
        if (!code || typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ error: 'code is required' });
        }
        const oldService = await prisma.service.findUnique({ where: { id } });
        const service = await prisma.service.update({
            where: { id },
            data: {
                category: (category || '').trim().toUpperCase(),
                code: code.trim().toUpperCase(),
                name: (name || '').trim(),
            },
        });
        const changes = audit.diffFields(oldService, service, ['category', 'code', 'name']);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Service', entityId: service.id, entityName: service.code, changes });
        res.json(service);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Service not found' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'Service code already exists' });
        next(err);
    }
}

// DELETE /api/services/:id  (soft-delete → archive)
async function deleteService(req, res, next) {
    try {
        const id = Number(req.params.id);
        const svc = await prisma.service.findUnique({ where: { id } });
        if (!svc) return res.status(404).json({ error: 'Service not found' });
        const archived = await prisma.service.update({ where: { id }, data: { archivedAt: new Date() } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Service', entityId: id, entityName: svc.code });
        res.json(archived);
    } catch (err) { next(err); }
}

// PUT /api/services/:id/restore
async function restoreService(req, res, next) {
    try {
        const id = Number(req.params.id);
        const svc = await prisma.service.findUnique({ where: { id } });
        if (!svc) return res.status(404).json({ error: 'Service not found' });
        const restored = await prisma.service.update({ where: { id }, data: { archivedAt: null } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Service', entityId: id, entityName: restored.code });
        res.json(restored);
    } catch (err) { next(err); }
}

async function permanentlyDeleteService(req, res, next) {
    try {
        const id = Number(req.params.id);
        const svc = await prisma.service.findUnique({ where: { id } });
        if (!svc) return res.status(404).json({ error: 'Service not found' });
        if (!svc.archivedAt) return res.status(400).json({ error: 'Only archived services can be permanently deleted' });
        await prisma.service.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'Service', entityId: id, entityName: svc.code });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteServices(req, res, next) {
    try {
        const result = await prisma.service.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'Service', entityId: 0, metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

module.exports = { listServices, createService, updateService, deleteService, restoreService, permanentlyDeleteService, bulkPermanentlyDeleteServices };
