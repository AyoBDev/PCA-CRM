const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'auth-documents');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

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

        const authDir = path.join(UPLOAD_DIR, String(authId));
        ensureDir(authDir);

        const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(authDir, safeName);
        fs.writeFileSync(filePath, req.file.buffer);

        const doc = await prisma.authorization_documents.create({
            data: {
                authorization_id: authId,
                file_name: req.file.originalname,
                file_path: `auth-documents/${authId}/${safeName}`,
                file_size: req.file.size,
                mime_type: req.file.mimetype || '',
                uploaded_by: req.user.id,
                notes: (req.body.notes || '').trim(),
            },
            include: { users: { select: { id: true, name: true } } },
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

        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.file_path);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

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

        // Delete file from disk
        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

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
