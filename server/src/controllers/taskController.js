const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

async function listTasks(req, res, next) {
    try {
        const { status, urgency, assignedToUserId, assignedToRole, entityType, entityId, dueBefore, dueAfter, page = 1 } = req.query;
        const limit = 25;
        const skip = (Number(page) - 1) * limit;

        const where = {};
        if (status) where.status = status;
        if (urgency) where.urgency = urgency;
        if (assignedToUserId) where.assignedToUserId = Number(assignedToUserId);
        if (assignedToRole) where.assignedToRole = assignedToRole;
        if (entityType) where.entityType = entityType;
        if (entityId) where.entityId = Number(entityId);
        if (dueBefore || dueAfter) {
            where.dueDate = {};
            if (dueBefore) where.dueDate.lte = new Date(dueBefore);
            if (dueAfter) where.dueDate.gte = new Date(dueAfter);
        }

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
                orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
                skip,
                take: limit,
            }),
            prisma.task.count({ where }),
        ]);

        res.json({ tasks, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const task = await prisma.task.findUnique({
            where: { id: Number(req.params.id) },
            include: {
                assignedToUser: { select: { id: true, name: true, email: true, role: true } },
                trigger: true,
            },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function createTask(req, res, next) {
    try {
        const { title, description, notes, urgency, dueDate, assignedToUserId, assignedToRole, entityType, entityId } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const data = {
            title,
            description: description || '',
            notes: notes || '',
            urgency: urgency || 'medium',
            assignedToRole: assignedToRole || null,
            entityType: entityType || null,
            entityId: entityId ? Number(entityId) : null,
        };
        if (dueDate) data.dueDate = new Date(dueDate);
        if (assignedToUserId) data.assignedToUserId = Number(assignedToUserId);

        const task = await prisma.task.create({
            data,
            include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
        });

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes: [],
            metadata: {},
        });

        res.status(201).json(task);
    } catch (err) {
        next(err);
    }
}

async function updateTask(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        const { title, description, notes, status, urgency, dueDate, assignedToUserId, assignedToRole } = req.body;
        const data = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (notes !== undefined) data.notes = notes;
        if (urgency !== undefined) data.urgency = urgency;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (assignedToUserId !== undefined) data.assignedToUserId = assignedToUserId ? Number(assignedToUserId) : null;
        if (assignedToRole !== undefined) data.assignedToRole = assignedToRole || null;

        if (status !== undefined) {
            data.status = status;
            if (status === 'completed' && existing.status !== 'completed') {
                data.completedAt = new Date();
            }
            if (status !== 'completed') {
                data.completedAt = null;
            }
        }

        const task = await prisma.task.update({
            where: { id },
            data,
            include: { assignedToUser: { select: { id: true, name: true, email: true, role: true } } },
        });

        const changes = audit.diffFields(existing, task, ['title', 'status', 'urgency', 'assignedToUserId', 'assignedToRole', 'notes']);
        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: status === 'completed' ? 'COMPLETE' : status === 'cancelled' ? 'CANCEL' : 'UPDATE',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes,
            metadata: {},
        });

        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function deleteTask(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        const task = await prisma.task.update({
            where: { id },
            data: { status: 'cancelled' },
        });

        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CANCEL',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            changes: [{ field: 'status', oldValue: existing.status, newValue: 'cancelled' }],
            metadata: {},
        });

        res.json(task);
    } catch (err) {
        next(err);
    }
}

async function bulkUpdateTasks(req, res, next) {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || !status) {
            return res.status(400).json({ error: 'ids (array) and status are required' });
        }

        const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const data = { status };
        if (status === 'completed') data.completedAt = new Date();
        if (status !== 'completed') data.completedAt = null;

        await prisma.task.updateMany({
            where: { id: { in: ids.map(Number) } },
            data,
        });

        for (const id of ids) {
            audit.logAction({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: status === 'completed' ? 'COMPLETE' : status === 'cancelled' ? 'CANCEL' : 'UPDATE',
                entityType: 'Task',
                entityId: Number(id),
                entityName: '',
                changes: [{ field: 'status', oldValue: '', newValue: status }],
                metadata: { bulk: true },
            });
        }

        res.json({ updated: ids.length });
    } catch (err) {
        next(err);
    }
}

async function getTaskSummary(req, res, next) {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const [overdue, dueToday, dueThisWeek, totalOpen, byUrgency] = await Promise.all([
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { lt: todayStart } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { gte: todayStart, lt: todayEnd } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] }, dueDate: { gte: todayStart, lt: weekEnd } },
            }),
            prisma.task.count({
                where: { status: { in: ['open', 'in_progress'] } },
            }),
            prisma.task.groupBy({
                by: ['urgency'],
                where: { status: { in: ['open', 'in_progress'] } },
                _count: true,
            }),
        ]);

        const urgencyMap = {};
        for (const row of byUrgency) {
            urgencyMap[row.urgency] = row._count;
        }

        res.json({ overdue, dueToday, dueThisWeek, totalOpen, byUrgency: urgencyMap });
    } catch (err) {
        next(err);
    }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, bulkUpdateTasks, getTaskSummary };
