const prisma = require('../lib/prisma');

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
        const service = await prisma.service.update({
            where: { id },
            data: {
                category: (category || '').trim().toUpperCase(),
                code: code.trim().toUpperCase(),
                name: (name || '').trim(),
            },
        });
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
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteServices(req, res, next) {
    try {
        const result = await prisma.service.deleteMany({ where: { archivedAt: { not: null } } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

module.exports = { listServices, createService, updateService, deleteService, restoreService, permanentlyDeleteService, bulkPermanentlyDeleteServices };
