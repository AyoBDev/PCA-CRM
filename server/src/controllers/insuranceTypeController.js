const prisma = require('../lib/prisma');

// GET /api/insurance-types
async function listInsuranceTypes(req, res, next) {
    try {
        const types = await prisma.insuranceType.findMany({
            orderBy: { name: 'asc' },
        });
        res.json(types);
    } catch (err) {
        next(err);
    }
}

// POST /api/insurance-types
async function createInsuranceType(req, res, next) {
    try {
        const { name, color } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        const type = await prisma.insuranceType.create({
            data: {
                name: name.trim().toUpperCase(),
                color: color || '#9E9E9E',
            },
        });
        res.status(201).json(type);
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Insurance type already exists' });
        }
        next(err);
    }
}

// PUT /api/insurance-types/:id
async function updateInsuranceType(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { name, color } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        const type = await prisma.insuranceType.update({
            where: { id },
            data: {
                name: name.trim().toUpperCase(),
                color: color || '#9E9E9E',
            },
        });
        res.json(type);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Insurance type not found' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'Insurance type already exists' });
        next(err);
    }
}

// DELETE /api/insurance-types/:id
async function deleteInsuranceType(req, res, next) {
    try {
        const id = Number(req.params.id);
        await prisma.insuranceType.delete({ where: { id } });
        res.status(204).end();
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Insurance type not found' });
        next(err);
    }
}

module.exports = { listInsuranceTypes, createInsuranceType, updateInsuranceType, deleteInsuranceType };
