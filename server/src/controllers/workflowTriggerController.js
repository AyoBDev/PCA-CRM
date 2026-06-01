const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

async function listWorkflowTriggers(req, res, next) {
    try {
        const triggers = await prisma.workflowTrigger.findMany({
            include: { assignToUser: { select: { id: true, name: true, email: true } } },
            orderBy: { id: 'asc' },
        });
        res.json(triggers);
    } catch (err) {
        next(err);
    }
}

async function updateWorkflowTrigger(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.workflowTrigger.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Trigger not found' });

        const { enabled, thresholdDays, urgency, assignToRole, assignToUserId } = req.body;
        const data = {};
        if (enabled !== undefined) data.enabled = enabled;
        if (thresholdDays !== undefined) data.thresholdDays = Number(thresholdDays);
        if (urgency !== undefined) data.urgency = urgency;
        if (assignToRole !== undefined) data.assignToRole = assignToRole || null;
        if (assignToUserId !== undefined) data.assignToUserId = assignToUserId ? Number(assignToUserId) : null;

        const trigger = await prisma.workflowTrigger.update({
            where: { id },
            data,
            include: { assignToUser: { select: { id: true, name: true, email: true } } },
        });

        const changes = audit.diffFields(existing, trigger, ['enabled', 'thresholdDays', 'urgency', 'assignToRole', 'assignToUserId']);
        audit.logAction({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE',
            entityType: 'WorkflowTrigger',
            entityId: trigger.id,
            entityName: trigger.name,
            changes,
            metadata: {},
        });

        res.json(trigger);
    } catch (err) {
        next(err);
    }
}

module.exports = { listWorkflowTriggers, updateWorkflowTrigger };
