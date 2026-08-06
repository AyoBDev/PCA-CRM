const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

const MODELS = {
    documents: { model: () => prisma.documentType, resKey: 'documentTypes', entity: 'DocumentType' },
    'cert-types': { model: () => prisma.certType, resKey: 'certTypes', entity: 'CertType' },
    policies: { model: () => prisma.policyDocument, resKey: 'policyDocuments', entity: 'PolicyDocument' },
};

function list(kind) {
    return async (req, res, next) => {
        try {
            const { model, resKey } = MODELS[kind];
            const rows = await model().findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
            res.json({ [resKey]: rows });
        } catch (err) { next(err); }
    };
}

function create(kind) {
    return async (req, res, next) => {
        try {
            const { model, entity } = MODELS[kind];
            const row = await model().create({ data: req.body });
            audit.logAction({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'CREATE',
                entityType: entity,
                entityId: row.id,
                entityName: row.label || row.title,
            });
            res.status(201).json(row);
        } catch (err) { next(err); }
    };
}

module.exports = {
    listDocuments: list('documents'), createDocument: create('documents'),
    listCertTypes: list('cert-types'), createCertType: create('cert-types'),
    listPolicies: list('policies'), createPolicy: create('policies'),
};
