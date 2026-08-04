const prisma = require('../../lib/prisma');
const audit = require('../../services/auditService');
const { markPolicyAck } = require('../../services/requirementService');

// POST /api/employee/policies/:reqId/ack
async function ackPolicy(req, res, next) {
    try {
        const reqId = parseInt(req.params.reqId);
        const requirement = await prisma.employeeRequirement.findFirst({
            where: { id: reqId, employeeId: req.employee.id, kind: 'policy' },
        });
        if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

        const policy = await prisma.policyDocument.findUnique({ where: { id: requirement.catalogTypeId } });

        const ack = await prisma.$transaction(async (tx) => {
            const created = await tx.employeePolicyAck.create({ data: {
                employeeId: req.employee.id,
                policyDocumentId: requirement.catalogTypeId,
                policyVersion: policy ? policy.version : 1,
                ipAddress: req.ip,
            } });
            await markPolicyAck(tx, reqId, created.id);
            return created;
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'Employee', entityId: req.employee.id, entityName: req.employee.name,
            metadata: { action: 'portal_policy_acked', requirementId: reqId, policyAckId: ack.id },
        });

        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { ackPolicy };
