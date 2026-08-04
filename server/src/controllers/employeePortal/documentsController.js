const prisma = require('../../lib/prisma');
const audit = require('../../services/auditService');
const { uploadFile } = require('../../lib/storage');
const { markSubmitted, projectLedger } = require('../../services/requirementService');
const { safeFileName } = require('../../lib/fileNameUtils');

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

// GET /api/employee/requirements
async function getRequirements(req, res, next) {
    try {
        const requirements = await projectLedger(req.employee.id);
        res.json({ requirements });
    } catch (err) { next(err); }
}

// GET /api/employee/documents
async function getDocuments(req, res, next) {
    try {
        const documents = await prisma.employeeDocument.findMany({
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
        const requirement = await prisma.employeeRequirement.findFirst({
            where: { id: reqId, employeeId: req.employee.id, kind: 'document' },
        });
        if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

        // Never let the client-supplied filename flow into the storage key
        // unsanitized — see fileNameUtils.safeFileName for why.
        const key = `employee-docs/${req.employee.id}/${requirement.catalogTypeId}/${Date.now()}-${safeFileName(req.file.originalname)}`;
        await uploadFile(key, req.file.buffer, req.file.mimetype);

        const doc = await prisma.$transaction(async (tx) => {
            const created = await tx.employeeDocument.create({ data: {
                employeeId: req.employee.id, documentTypeId: requirement.catalogTypeId, storageKey: key,
                fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
                expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
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

module.exports = { getRequirements, getDocuments, uploadDocument };
