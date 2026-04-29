const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

// GET /api/insurance-types
async function listInsuranceTypes(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const types = await prisma.insuranceType.findMany({
            where,
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
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'InsuranceType', entityId: type.id, entityName: type.name });
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
        const oldType = await prisma.insuranceType.findUnique({ where: { id } });
        const type = await prisma.insuranceType.update({
            where: { id },
            data: {
                name: name.trim().toUpperCase(),
                color: color || '#9E9E9E',
            },
        });
        const changes = audit.diffFields(oldType, type, ['name', 'color']);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'InsuranceType', entityId: type.id, entityName: type.name, changes });
        res.json(type);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Insurance type not found' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'Insurance type already exists' });
        next(err);
    }
}

// DELETE /api/insurance-types/:id  (soft-delete → archive)
async function deleteInsuranceType(req, res, next) {
    try {
        const id = Number(req.params.id);
        const type = await prisma.insuranceType.findUnique({ where: { id } });
        if (!type) return res.status(404).json({ error: 'Insurance type not found' });
        const archived = await prisma.insuranceType.update({ where: { id }, data: { archivedAt: new Date() } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'InsuranceType', entityId: id, entityName: type.name });
        res.json(archived);
    } catch (err) { next(err); }
}

// PUT /api/insurance-types/:id/restore
async function restoreInsuranceType(req, res, next) {
    try {
        const id = Number(req.params.id);
        const type = await prisma.insuranceType.findUnique({ where: { id } });
        if (!type) return res.status(404).json({ error: 'Insurance type not found' });
        const restored = await prisma.insuranceType.update({ where: { id }, data: { archivedAt: null } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'InsuranceType', entityId: id, entityName: restored.name });
        res.json(restored);
    } catch (err) { next(err); }
}

async function permanentlyDeleteInsuranceType(req, res, next) {
    try {
        const id = Number(req.params.id);
        const type = await prisma.insuranceType.findUnique({ where: { id } });
        if (!type) return res.status(404).json({ error: 'Insurance type not found' });
        if (!type.archivedAt) return res.status(400).json({ error: 'Only archived insurance types can be permanently deleted' });
        await prisma.insuranceType.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'InsuranceType', entityId: id, entityName: type.name });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteInsuranceTypes(req, res, next) {
    try {
        const result = await prisma.insuranceType.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'InsuranceType', entityId: 0, metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

module.exports = { listInsuranceTypes, createInsuranceType, updateInsuranceType, deleteInsuranceType, restoreInsuranceType, permanentlyDeleteInsuranceType, bulkPermanentlyDeleteInsuranceTypes };
