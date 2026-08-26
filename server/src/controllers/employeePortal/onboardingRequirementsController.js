const onboarding = require('../../services/onboardingService');
const audit = require('../../services/auditService');
const lifecycle = require('../../services/onboardingLifecycle');
const { uploadFile } = require('../../lib/storage');
const { tenantKey } = require('../../services/storageService');
const { markSubmitted, markPolicyAck, projectLedger } = require('../../services/requirementService');
const { safeFileName } = require('../../lib/fileNameUtils');
const { enterTokenTenant } = require('../../lib/tokenTenant');
const { tenantTransaction } = require('../../lib/tenantPrisma');

// First real onboarding data moves the employee off invitation_pending. Safe
// no-op when already past it (e.g. pending_review) — transition() throws on
// an illegal move, so swallow only that case and let anything else propagate.
async function markInProgress(db, employeeId) {
    try { await lifecycle.transition(db, employeeId, 'onboarding_in_progress'); }
    catch (e) { if (!/Illegal onboarding transition/.test(e.message)) throw e; }
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

// Resolves the token via the owner connection (token lookup crosses tenants by
// design), then enters the employee's tenant context before running `fn` — so
// every subsequent DB call in `fn` goes through req.db / tenantKey() correctly.
async function withTokenEmployee(req, res, token, fn) {
    const { valid, employee } = await onboarding.validateToken(token);
    if (!valid) return res.status(400).json({ error: 'Invalid link' });
    return enterTokenTenant(req, res, employee.agencyId, () => fn(employee));
}

// Thin wrapper kept for backward compatibility — the projection itself now
// lives in requirementService.projectLedger() so the onboarding (token-auth)
// and portal (JWT-auth) code paths share one implementation.
async function buildLedgerView(db, employeeId) {
    return projectLedger(db, employeeId);
}

async function savePersonal(req, res, next) {
    try {
        await withTokenEmployee(req, res, req.params.token, async (employee) => {
            const { address, dob, gender, preferredLanguage, ssn } = req.body;
            await req.db.employee.update({ where: { id: employee.id }, data: { address, dob, gender, preferredLanguage, ssn } });
            await markInProgress(req.db, employee.id);
            // Public (token-auth) mutation → userId 0. Log only which fields were touched, never PHI values (dob/ssn).
            const fields = Object.keys({ address, dob, gender, preferredLanguage, ssn }).filter((k) => req.body[k] !== undefined);
            audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_personal_saved', fields } });
            res.json({ success: true });
        });
    } catch (err) { next(err); }
}

async function saveEmergency(req, res, next) {
    try {
        await withTokenEmployee(req, res, req.params.token, async (employee) => {
            const { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } = req.body;
            await req.db.employee.update({ where: { id: employee.id }, data: { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } });
            await markInProgress(req.db, employee.id);
            audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_emergency_saved' } });
            res.json({ success: true });
        });
    } catch (err) { next(err); }
}

async function uploadDocument(req, res, next) {
    try {
        await withTokenEmployee(req, res, req.params.token, async (employee) => {
            if (!req.file) return res.status(400).json({ error: 'No file provided' });
            if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
            if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });
            const reqId = parseInt(req.params.reqId);
            // Certifications are fulfilled by uploading a file too (CPR card, TB result, etc.),
            // so this endpoint accepts both document- and certification-kind requirements.
            const requirement = await req.db.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: { in: ['document', 'certification'] } } });
            if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
            const key = tenantKey(`employee-docs/${employee.id}/${requirement.catalogTypeId}/${Date.now()}-${safeFileName(req.file.originalname)}`);
            await uploadFile(key, req.file.buffer, req.file.mimetype);
            await tenantTransaction(employee.agencyId, async (tx) => {
                const doc = await tx.employeeDocument.create({ data: {
                    employeeId: employee.id, documentTypeId: requirement.catalogTypeId, storageKey: key,
                    fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
                    expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
                    agencyId: employee.agencyId,
                } });
                await markSubmitted(tx, reqId, { documentId: doc.id });
            });
            audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_document_uploaded', requirementId: reqId } });
            res.json({ success: true });
        });
    } catch (err) { next(err); }
}

async function ackPolicy(req, res, next) {
    try {
        await withTokenEmployee(req, res, req.params.token, async (employee) => {
            const reqId = parseInt(req.params.reqId);
            const requirement = await req.db.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: 'policy' } });
            if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
            const policy = await req.db.policyDocument.findUnique({ where: { id: requirement.catalogTypeId } });
            await tenantTransaction(employee.agencyId, async (tx) => {
                const ack = await tx.employeePolicyAck.create({ data: { employeeId: employee.id, policyDocumentId: requirement.catalogTypeId, policyVersion: policy ? policy.version : 1, ipAddress: req.ip, agencyId: employee.agencyId } });
                await markPolicyAck(tx, reqId, ack.id);
            });
            audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_policy_acked', requirementId: reqId } });
            res.json({ success: true });
        });
    } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency, buildLedgerView, uploadDocument, ackPolicy };
