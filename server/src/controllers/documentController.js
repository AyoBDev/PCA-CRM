const fs = require('fs');
const path = require('path');
const audit = require('../services/auditService');
const { uploadFile, downloadFile, deleteFile } = require('../lib/storage');

// POST /api/clients/:clientId/documents (multipart — req.file from multer)
async function uploadDocument(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const client = await req.db.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const category = req.body.category;
        if (!category) return res.status(400).json({ error: 'category is required' });

        // Store the file in the object bucket (not inline in the DB). The bucket
        // key is kept in filePath; downloadDocument streams it back from there.
        const bucketKey = `client-documents/${clientId}/${Date.now()}-${req.file.originalname}`;
        await uploadFile(bucketKey, req.file.buffer, req.file.mimetype || 'application/octet-stream');

        const doc = await req.db.clientDocument.create({
            data: {
                clientId,
                category,
                fileName: req.file.originalname,
                filePath: bucketKey,
                fileSize: req.file.size,
                mimeType: req.file.mimetype || '',
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
        const doc = await req.db.clientDocument.findUnique({ where: { id } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const mimeType = doc.mimeType || 'application/octet-stream';
        const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';

        // Legacy records kept bytes inline; serve those directly.
        if (doc.fileData) {
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.fileName)}"`);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', doc.fileData.length);
            return res.send(Buffer.from(doc.fileData));
        }

        // Current records store the file in the object bucket (key = filePath).
        if (doc.filePath) {
            const buffer = await downloadFile(doc.filePath);
            if (buffer) {
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.fileName)}"`);
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', buffer.length);
                return res.send(buffer);
            }
        }

        // Last-resort fallback to the old local filesystem for very old uploads.
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
        const doc = await req.db.clientDocument.findUnique({ where: { id }, include: { client: true } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        // Drop the stored bytes too, so deleting a document doesn't leave an
        // orphaned object behind. Legacy rows kept bytes inline (fileData) and
        // have no bucket object to remove. Best-effort: a storage failure must
        // not strand the row the user asked to delete.
        if (doc.filePath && !doc.fileData) {
            try {
                await deleteFile(doc.filePath);
            } catch (err) {
                console.error(`[clientDocument] failed to delete stored file ${doc.filePath}:`, err.message);
            }
        }

        await req.db.clientDocument.delete({ where: { id } });

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
