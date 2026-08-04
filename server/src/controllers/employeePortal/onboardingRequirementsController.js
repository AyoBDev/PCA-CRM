const path = require('path');
const prisma = require('../../lib/prisma');
const onboarding = require('../../services/onboardingService');
const audit = require('../../services/auditService');
const { uploadFile } = require('../../lib/storage');
const { markSubmitted, markPolicyAck } = require('../../services/requirementService');

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

// Strip any directory components and unsafe characters from a client-supplied
// filename before it becomes part of a storage key. On the local-filesystem
// storage backend an un-sanitized name (e.g. "../../etc/evil") would let this
// PUBLIC endpoint write outside the uploads dir via path.join.
function safeFileName(name) {
    const base = path.basename(String(name || '')).replace(/[^A-Za-z0-9._-]/g, '_');
    return base && base !== '.' && base !== '..' ? base : 'file';
}

async function resolveEmployee(token) {
    const { valid, employee } = await onboarding.validateToken(token);
    if (!valid) return null;
    return employee;
}

async function buildLedgerView(employeeId) {
    const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId } });
    const [docs, certs, policies] = await Promise.all([
        prisma.documentType.findMany(), prisma.certType.findMany(), prisma.policyDocument.findMany(),
    ]);
    const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
    const dMap = byId(docs), cMap = byId(certs), pMap = byId(policies);
    return reqs.map(r => {
        const cat = r.kind === 'document' ? dMap[r.catalogTypeId] : r.kind === 'certification' ? cMap[r.catalogTypeId] : pMap[r.catalogTypeId];
        return { id: r.id, kind: r.kind, catalogTypeId: r.catalogTypeId, status: r.status, label: cat ? (cat.label || cat.title) : '', requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false };
    });
}

async function savePersonal(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const { address, dob, gender, preferredLanguage, ssn } = req.body;
        await prisma.employee.update({ where: { id: employee.id }, data: { address, dob, gender, preferredLanguage, ssn } });
        // Public (token-auth) mutation → userId 0. Log only which fields were touched, never PHI values (dob/ssn).
        const fields = Object.keys({ address, dob, gender, preferredLanguage, ssn }).filter((k) => req.body[k] !== undefined);
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_personal_saved', fields } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function saveEmergency(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } = req.body;
        await prisma.employee.update({ where: { id: employee.id }, data: { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_emergency_saved' } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function uploadDocument(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        if (!req.file) return res.status(400).json({ error: 'No file provided' });
        if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
        if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });
        const reqId = parseInt(req.params.reqId);
        const requirement = await prisma.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: 'document' } });
        if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
        const key = `employee-docs/${employee.id}/${requirement.catalogTypeId}/${Date.now()}-${safeFileName(req.file.originalname)}`;
        await uploadFile(key, req.file.buffer, req.file.mimetype);
        await prisma.$transaction(async (tx) => {
            const doc = await tx.employeeDocument.create({ data: {
                employeeId: employee.id, documentTypeId: requirement.catalogTypeId, storageKey: key,
                fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
                expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
            } });
            await markSubmitted(tx, reqId, { documentId: doc.id });
        });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_document_uploaded', requirementId: reqId } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function ackPolicy(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const reqId = parseInt(req.params.reqId);
        const requirement = await prisma.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: 'policy' } });
        if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
        const policy = await prisma.policyDocument.findUnique({ where: { id: requirement.catalogTypeId } });
        await prisma.$transaction(async (tx) => {
            const ack = await tx.employeePolicyAck.create({ data: { employeeId: employee.id, policyDocumentId: requirement.catalogTypeId, policyVersion: policy ? policy.version : 1, ipAddress: req.ip } });
            await markPolicyAck(tx, reqId, ack.id);
        });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_policy_acked', requirementId: reqId } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency, buildLedgerView, uploadDocument, ackPolicy };
