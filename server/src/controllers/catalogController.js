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
            const query = req.query || {};
            const includeInactive = query.all === '1' || query.includeInactive === 'true';
            const where = includeInactive ? {} : { active: true };
            const rows = await model().findMany({ where, orderBy: { sortOrder: 'asc' } });
            res.json({ [resKey]: rows });
        } catch (err) { next(err); }
    };
}

const EDITABLE = {
    documents: ['label', 'requiresExpiry', 'sortOrder'],
    'cert-types': ['label', 'requiresExpiry', 'renewalYears', 'sortOrder'],
    policies: ['title', 'body', 'version', 'sortOrder'],
};

// Create allows everything update allows, plus the unique `key` field
// (only set at creation time, never editable afterward).
const CREATABLE = {
    documents: [...EDITABLE.documents, 'key'],
    'cert-types': [...EDITABLE['cert-types'], 'key'],
    policies: [...EDITABLE.policies, 'key'],
};

function pick(obj, keys) {
    const out = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

function create(kind) {
    return async (req, res, next) => {
        try {
            const { model, entity } = MODELS[kind];
            const data = pick(req.body, CREATABLE[kind]);
            const row = await model().create({ data });
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

function update(kind) {
    return async (req, res, next) => {
        try {
            const { model, entity } = MODELS[kind];
            const id = parseInt(req.params.id);
            const data = pick(req.body, EDITABLE[kind]);
            const row = await model().update({ where: { id }, data });
            audit.logAction({
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
                action: 'UPDATE', entityType: entity, entityId: row.id, entityName: row.label || row.title,
            });
            res.json(row);
        } catch (err) { next(err); }
    };
}

function setActive(kind) {
    return async (req, res, next) => {
        try {
            const { model, entity } = MODELS[kind];
            const id = parseInt(req.params.id);
            const active = Boolean(req.body.active);
            const row = await model().update({ where: { id }, data: { active } });
            audit.logAction({
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
                action: active ? 'RESTORE' : 'ARCHIVE', entityType: entity, entityId: row.id, entityName: row.label || row.title,
            });
            res.json(row);
        } catch (err) { next(err); }
    };
}

function reorder(kind) {
    return async (req, res, next) => {
        try {
            const { model, entity } = MODELS[kind];
            const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
            await prisma.$transaction(ids.map((id, index) =>
                model().update({ where: { id: parseInt(id) }, data: { sortOrder: index } })
            ));
            audit.logAction({
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
                action: 'UPDATE', entityType: entity, entityId: 0, entityName: `${kind} reorder`,
                metadata: { action: 'catalog_reorder', ids },
            });
            res.json({ success: true });
        } catch (err) { next(err); }
    };
}

module.exports = {
    listDocuments: list('documents'), createDocument: create('documents'), updateDocument: update('documents'), setDocumentActive: setActive('documents'), reorderDocuments: reorder('documents'),
    listCertTypes: list('cert-types'), createCertType: create('cert-types'), updateCertType: update('cert-types'), setCertTypeActive: setActive('cert-types'), reorderCertTypes: reorder('cert-types'),
    listPolicies: list('policies'), createPolicy: create('policies'), updatePolicy: update('policies'), setPolicyActive: setActive('policies'), reorderPolicies: reorder('policies'),
};
