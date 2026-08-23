const audit = require('../../services/auditService');
const { uploadFile } = require('../../lib/storage');
const { markSubmitted, projectLedger } = require('../../services/requirementService');
const { safeFileName } = require('../../lib/fileNameUtils');
const { tenantKey } = require('../../services/storageService');
const { tenantTransaction } = require('../../lib/tenantPrisma');

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

// GET /api/employee/requirements
async function getRequirements(req, res, next) {
    try {
        const requirements = await projectLedger(req.db, req.employee.id);
        res.json({ requirements });
    } catch (err) { next(err); }
}

// GET /api/employee/documents
async function getDocuments(req, res, next) {
    try {
        const documents = await req.db.employeeDocument.findMany({
            where: { employeeId: req.employee.id },
            orderBy: { uploadedAt: 'desc' },
        });
        res.json({ documents });
    } catch (err) { next(err); }
}

// POST /api/employee/documents/:reqId  (multipart, field "file")
async function uploadDocument(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });
        if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
        if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });

        const reqId = parseInt(req.params.reqId);
        // Certifications are also fulfilled by uploading a file, so accept both kinds.
        const requirement = await req.db.employeeRequirement.findFirst({
            where: { id: reqId, employeeId: req.employee.id, kind: { in: ['document', 'certification'] } },
        });
        if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

        // Never let the client-supplied filename flow into the storage key
        // unsanitized — see fileNameUtils.safeFileName for why.
        const key = tenantKey(`employee-docs/${req.employee.id}/${requirement.catalogTypeId}/${Date.now()}-${safeFileName(req.file.originalname)}`);
        await uploadFile(key, req.file.buffer, req.file.mimetype);

        const doc = await tenantTransaction(req.user.agencyId, async (tx) => {
            const created = await tx.employeeDocument.create({ data: {
                employeeId: req.employee.id, documentTypeId: requirement.catalogTypeId, storageKey: key,
                fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
                expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
                agencyId: req.user.agencyId,
            } });
            await markSubmitted(tx, reqId, { documentId: created.id });
            return created;
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'Employee', entityId: req.employee.id, entityName: req.employee.name,
            metadata: { action: 'portal_document_uploaded', requirementId: reqId, documentId: doc.id },
        });

        res.json({ success: true });
    } catch (err) { next(err); }
}

// GET /api/employee/onboarding/my-link
// Lets a LOGGED-IN employee who is still onboarding (pending_review / changes_requested)
// retrieve their own onboarding token, so they can reach the onboarding wizard directly
// in-app — a second point of entry that doesn't depend on the email link. Mints a fresh
// token if none is currently usable. Only valid while onboarding; otherwise 400.
async function getMyOnboardingLink(req, res, next) {
    try {
        const emp = req.employee;
        const ONBOARDING_STATES = ['pending_review', 'changes_requested', 'onboarding_in_progress', 'invitation_pending'];
        if (!ONBOARDING_STATES.includes(emp.onboardingStatus)) {
            return res.status(400).json({ error: 'Not currently onboarding' });
        }
        const onboarding = require('../../services/onboardingService');
        let token = await req.db.onboardingToken.findFirst({
            where: { employeeId: emp.id, status: 'pending', expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
        if (!token) token = await onboarding.createOnboardingToken(req.db, emp.id);
        res.json({ token: token.token });
    } catch (err) { next(err); }
}

module.exports = { getRequirements, getDocuments, uploadDocument, getMyOnboardingLink };
