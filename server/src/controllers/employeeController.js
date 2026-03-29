const prisma = require('../lib/prisma');

async function listEmployees(req, res, next) {
    try {
        const where = {};
        if (req.query.active === 'true') where.active = true;
        if (req.query.active === 'false') where.active = false;

        const employees = await prisma.employee.findMany({
            where,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(employees);
    } catch (err) { next(err); }
}

async function getEmployee(req, res, next) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { id: Number(req.params.id) },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        res.json(employee);
    } catch (err) { next(err); }
}

async function createEmployee(req, res, next) {
    try {
        const { name, phone, email, userId } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

        const employee = await prisma.employee.create({
            data: {
                name: name.trim(),
                phone: phone || '',
                email: email || '',
                userId: userId || null,
            },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        res.status(201).json(employee);
    } catch (err) { next(err); }
}

async function updateEmployee(req, res, next) {
    try {
        const { name, phone, email, userId, active } = req.body;
        const data = {};
        if (name !== undefined) data.name = name.trim();
        if (phone !== undefined) data.phone = phone;
        if (email !== undefined) data.email = email;
        if (userId !== undefined) data.userId = userId;
        if (active !== undefined) data.active = active;

        const employee = await prisma.employee.update({
            where: { id: Number(req.params.id) },
            data,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        res.json(employee);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
        next(err);
    }
}

async function deleteEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const shiftCount = await prisma.shift.count({ where: { employeeId: id } });
        if (shiftCount > 0) {
            return res.status(409).json({
                error: `Cannot delete employee with ${shiftCount} shift(s). Reassign or delete their shifts first.`,
            });
        }
        await prisma.employee.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
        next(err);
    }
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee };
