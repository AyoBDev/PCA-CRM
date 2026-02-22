const prisma = require('../lib/prisma');

// GET /api/services
async function listServices(req, res, next) {
    try {
        const services = await prisma.service.findMany({
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

// DELETE /api/services/:id
async function deleteService(req, res, next) {
    try {
        const id = Number(req.params.id);
        await prisma.service.delete({ where: { id } });
        res.status(204).end();
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Service not found' });
        next(err);
    }
}

module.exports = { listServices, createService, updateService, deleteService };
