const prisma = require('../lib/prisma');
const { enrichAuthorization, enrichClient } = require('../services/authorizationService');

const VALID_SERVICE_CODES = ['PCS', 'SDPC', 'TIMESHEETS', 'S5125', 'S5130', 'S5135', 'S5150', 'PAS'];

function validateBody(body) {
    const { serviceCode, authorizationEndDate } = body;
    const errors = [];
    if (!serviceCode || !VALID_SERVICE_CODES.includes(serviceCode)) {
        errors.push(`serviceCode must be one of: ${VALID_SERVICE_CODES.join(', ')}`);
    }
    if (!authorizationEndDate || isNaN(Date.parse(authorizationEndDate))) {
        errors.push('authorizationEndDate must be a valid date (YYYY-MM-DD)');
    }
    return errors;
}

// POST /api/clients/:clientId/authorizations
async function createAuthorization(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const errors = validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const auth = await prisma.authorization.create({
            data: {
                clientId,
                serviceCategory: (req.body.serviceCategory || '').trim(),
                serviceCode: req.body.serviceCode,
                serviceName: (req.body.serviceName || '').trim(),
                authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                authorizationStartDate: req.body.authorizationStartDate
                    ? new Date(req.body.authorizationStartDate)
                    : null,
                authorizationEndDate: new Date(req.body.authorizationEndDate),
                notes: (req.body.notes || '').trim(),
            },
        });

        res.status(201).json(enrichAuthorization(auth));
    } catch (err) {
        next(err);
    }
}

// PUT /api/authorizations/:id
async function updateAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const errors = validateBody(req.body);
        if (errors.length) return res.status(400).json({ errors });

        const auth = await prisma.authorization.update({
            where: { id },
            data: {
                serviceCategory: (req.body.serviceCategory || '').trim(),
                serviceCode: req.body.serviceCode,
                serviceName: (req.body.serviceName || '').trim(),
                authorizedUnits: parseInt(req.body.authorizedUnits) || 0,
                authorizationStartDate: req.body.authorizationStartDate
                    ? new Date(req.body.authorizationStartDate)
                    : null,
                authorizationEndDate: new Date(req.body.authorizationEndDate),
                notes: (req.body.notes || '').trim(),
            },
        });

        res.json(enrichAuthorization(auth));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
        next(err);
    }
}

// DELETE /api/authorizations/:id
async function deleteAuthorization(req, res, next) {
    try {
        const id = Number(req.params.id);
        const auth = await prisma.authorization.findUnique({ where: { id } });
        if (!auth) return res.status(404).json({ error: 'Authorization not found' });

        await prisma.authorization.delete({ where: { id } });

        const client = await prisma.client.findUnique({
            where: { id: auth.clientId },
            include: { authorizations: { orderBy: { createdAt: 'asc' } } },
        });

        res.json(client ? enrichClient(client) : { deleted: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { createAuthorization, updateAuthorization, deleteAuthorization };
