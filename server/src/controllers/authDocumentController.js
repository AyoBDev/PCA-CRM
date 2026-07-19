const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const { uploadFile, downloadFile } = require('../lib/storage');

// POST /api/authorizations/:authId/documents (multipart — req.file from multer)
async function uploadAuthDocument(req, res, next) {
    try {
        const authId = Number(req.params.authId);
        const auth = await prisma.authorization.findUnique({
            where: { id: authId },
            include: { client: true }
        });
        if (!auth) return res.status(404).json({ error: 'Authorization not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Store the file in the object bucket (not inline in the DB). The bucket
        // key is kept in file_path; downloadAuthDocument streams it back from there.
        const bucketKey = `auth-documents/${authId}/${Date.now()}-${req.file.originalname}`;
        await uploadFile(bucketKey, req.file.buffer, req.file.mimetype || 'application/octet-stream');

        const doc = await prisma.authorization_documents.create({
            data: {
                authorization_id: authId,
                file_name: req.file.originalname,
                file_path: bucketKey,
                file_size: req.file.size,
                mime_type: req.file.mimetype || '',
                uploaded_by: req.user.id,
                notes: (req.body.notes || '').trim(),
            },
            select: {
                id: true, authorization_id: true, file_name: true, file_path: true,
                file_size: true, mime_type: true, uploaded_by: true, notes: true, created_at: true,
                users: { select: { id: true, name: true } },
            },
        });


        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'AuthorizationDocument', entityId: doc.id,
            entityName: `${auth.client.clientName} — ${auth.serviceCode} — ${req.file.originalname}`,
        });

        res.status(201).json(doc);
    } catch (err) {
        next(err);
    }
}

// GET /api/auth-documents/:id/download
async function downloadAuthDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await prisma.authorization_documents.findUnique({ where: { id } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const mimeType = doc.mime_type || 'application/octet-stream';
        const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';

        // Legacy records kept bytes inline; serve those directly.
        if (doc.file_data) {
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.file_name)}"`);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', doc.file_data.length);
            return res.send(Buffer.from(doc.file_data));
        }

        // Current records store the file in the object bucket (key = file_path).
        if (doc.file_path) {
            const buffer = await downloadFile(doc.file_path);
            if (buffer) {
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.file_name)}"`);
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', buffer.length);
                return res.send(buffer);
            }
        }

        // Last-resort fallback to the old local filesystem for very old uploads.
        const fs = require('fs');
        const path = require('path');
        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.file_path);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found. It may have been lost during a deployment. Please re-upload.' });

        res.download(fullPath, doc.file_name);
    } catch (err) {
        next(err);
    }
}

// DELETE /api/auth-documents/:id
async function deleteAuthDocument(req, res, next) {
    try {
        const id = Number(req.params.id);
        const doc = await prisma.authorization_documents.findUnique({
            where: { id },
            include: {
                authorizations: {
                    include: { client: true }
                }
            }
        });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        await prisma.authorization_documents.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'AuthorizationDocument', entityId: id,
            entityName: `${doc.authorizations.client.clientName} — ${doc.authorizations.serviceCode} — ${doc.file_name}`,
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { uploadAuthDocument, downloadAuthDocument, deleteAuthDocument };
