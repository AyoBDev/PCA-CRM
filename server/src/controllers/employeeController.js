const prisma = require('../lib/prisma');

async function listEmployees(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
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
        const employee = await prisma.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const archived = await prisma.employee.update({ where: { id }, data: { archivedAt: new Date() } });
        res.json(archived);
    } catch (err) { next(err); }
}

async function restoreEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await prisma.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const restored = await prisma.employee.update({
            where: { id }, data: { archivedAt: null },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        res.json(restored);
    } catch (err) { next(err); }
}

async function permanentlyDeleteEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const emp = await prisma.employee.findUnique({ where: { id } });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        if (!emp.archivedAt) return res.status(400).json({ error: 'Only archived employees can be permanently deleted' });
        // Clear shifts referencing this employee (Shift uses onDelete: Restrict)
        await prisma.shift.deleteMany({ where: { employeeId: id } });
        await prisma.employee.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, restoreEmployee, permanentlyDeleteEmployee };
