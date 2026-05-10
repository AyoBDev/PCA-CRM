const prisma = require('../lib/prisma');

async function listActivities(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = 25;
        const skip = (page - 1) * limit;

        const [activities, total] = await Promise.all([
            prisma.clientActivity.findMany({
                where: { clientId },
                include: { user: { select: { id: true, name: true } } },
                orderBy: { occurredAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.clientActivity.count({ where: { clientId } }),
        ]);

        res.json({ activities, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        next(err);
    }
}

async function createActivity(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const userId = req.user.id;
        const { type, subject, description, contactName, occurredAt } = req.body;

        if (!type || !subject) {
            return res.status(400).json({ error: 'type and subject are required' });
        }

        const activity = await prisma.clientActivity.create({
            data: {
                clientId,
                userId,
                type,
                subject: subject.trim(),
                description: (description || '').trim(),
                contactName: (contactName || '').trim(),
                occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
            },
            include: { user: { select: { id: true, name: true } } },
        });

        res.status(201).json(activity);
    } catch (err) {
        next(err);
    }
}

async function deleteActivity(req, res, next) {
    try {
        const id = Number(req.params.id);
        await prisma.clientActivity.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { listActivities, createActivity, deleteActivity };
