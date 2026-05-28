const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

// POST /api/clients/:clientId/documents (multipart — req.file from multer)
async function uploadDocument(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const category = req.body.category;
        if (!category) return res.status(400).json({ error: 'category is required' });

        const doc = await prisma.clientDocument.create({
            data: {
                clientId,
                category,
                fileName: req.file.originalname,
                filePath: `documents/${clientId}/${req.file.originalname}`,
                fileSize: req.file.size,
                mimeType: req.file.mimetype || '',
                fileData: req.file.buffer,
                uploadedBy: req.user.id,
                notes: (req.body.notes || '').trim(),
            },
            include: { uploader: { select: { id: true, name: true } } },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'ClientDocument', entityId: doc.id,
            entityName: `${client.clientName} — ${req.file.originalname}`,
        });

        res.status(201).json(doc);
    } catch (err) {
        next(err);
    }
}

// GET /api/documents/:id/download
async function downloadDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await prisma.clientDocument.findUnique({ where: { id } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        if (doc.fileData) {
            const mimeType = doc.mimeType || 'application/octet-stream';
            const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.fileName)}"`);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', doc.fileData.length);
            return res.send(Buffer.from(doc.fileData));
        }

        // Fallback to filesystem for old uploads
        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.filePath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found. It may have been lost during a deployment. Please re-upload.' });

        res.download(fullPath, doc.fileName);
    } catch (err) {
        next(err);
    }
}

// DELETE /api/documents/:id
async function deleteDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await prisma.clientDocument.findUnique({ where: { id }, include: { client: true } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        await prisma.clientDocument.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'ClientDocument', entityId: id,
            entityName: `${doc.client.clientName} — ${doc.fileName}`,
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { uploadDocument, downloadDocument, deleteDocument };
