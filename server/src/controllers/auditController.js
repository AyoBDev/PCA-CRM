const auditService = require('../services/auditService');

// GET /api/audit-logs?entityType=Client&page=1&limit=25
async function getAuditLogs(req, res, next) {
    try {
        const { entityType, page = 1, limit = 25 } = req.query;
        const result = await auditService.getPageLogs(entityType, {
            page: Number(page),
            limit: Math.min(Number(limit), 100),
        });
        res.json(result);
    } catch (err) { next(err); }
}

// GET /api/audit-logs/:entityType/:entityId
async function getEntityAuditLogs(req, res, next) {
    try {
        const { entityType, entityId } = req.params;
        const { page = 1, limit = 25 } = req.query;
        const result = await auditService.getEntityLogs(entityType, Number(entityId), {
            page: Number(page),
            limit: Math.min(Number(limit), 100),
        });
        res.json(result);
    } catch (err) { next(err); }
}

module.exports = { getAuditLogs, getEntityAuditLogs };
