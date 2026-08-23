const audit = require('../services/auditService');
const { uploadFile, downloadFile } = require('../lib/storage');
const { tenantKey } = require('../services/storageService');

const leadName = (l) => `${l.firstName || ''} ${l.lastName || ''}`.trim() || `Lead #${l.id}`;

// Accepted intake attachment types: images, PDFs, and common Office docs.
const ALLOWED_MIME = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// GET /api/leads/:leadId/documents
async function listLeadDocuments(req, res, next) {
    try {
        const leadId = Number(req.params.leadId);
        const docs = await req.db.leadDocument.findMany({
            where: { leadId },
            orderBy: { createdAt: 'desc' },
            include: { uploader: { select: { id: true, name: true } } },
        });
        res.json(docs);
    } catch (err) {
        next(err);
    }
}

// POST /api/leads/:leadId/documents (multipart — req.file from multer)
async function uploadLeadDocument(req, res, next) {
    try {
        const leadId = Number(req.params.leadId);
        const lead = await req.db.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const mime = req.file.mimetype || 'application/octet-stream';
        if (!ALLOWED_MIME.includes(mime)) {
            return res.status(400).json({ error: 'Unsupported file type. Allowed: images, PDF, Word documents.' });
        }

        const bucketKey = tenantKey(`lead-documents/${leadId}/${Date.now()}-${req.file.originalname}`);
        await uploadFile(bucketKey, req.file.buffer, mime);

        const doc = await req.db.leadDocument.create({
            data: {
                leadId,
                fileName: req.file.originalname,
                filePath: bucketKey,
                fileSize: req.file.size,
                mimeType: mime,
                uploadedBy: req.user?.id || null,
            },
            include: { uploader: { select: { id: true, name: true } } },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'LeadDocument', entityId: doc.id,
            entityName: `${leadName(lead)} — ${req.file.originalname}`,
            metadata: { leadId },
        });

        res.status(201).json(doc);
    } catch (err) {
        next(err);
    }
}

// GET /api/lead-documents/:id/download
async function downloadLeadDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await req.db.leadDocument.findUnique({ where: { id } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const mimeType = doc.mimeType || 'application/octet-stream';
        const disposition = (mimeType === 'application/pdf' || mimeType.startsWith('image/')) ? 'inline' : 'attachment';

        const buffer = await downloadFile(doc.filePath);
        if (!buffer) return res.status(404).json({ error: 'File not found. It may have been lost during a deployment. Please re-upload.' });

        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.fileName)}"`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (err) {
        next(err);
    }
}

// DELETE /api/lead-documents/:id
async function deleteLeadDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await req.db.leadDocument.findUnique({ where: { id }, include: { lead: true } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        await req.db.leadDocument.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'LeadDocument', entityId: id,
            entityName: `${leadName(doc.lead)} — ${doc.fileName}`,
            metadata: { leadId: doc.leadId },
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { listLeadDocuments, uploadLeadDocument, downloadLeadDocument, deleteLeadDocument };
