const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// POST /api/clients/:clientId/documents (multipart — req.file from multer)
async function uploadDocument(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const category = req.body.category;
        if (!category) return res.status(400).json({ error: 'category is required' });

        const clientDir = path.join(UPLOAD_DIR, String(clientId));
        ensureDir(clientDir);

        const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(clientDir, safeName);
        fs.writeFileSync(filePath, req.file.buffer);

        const doc = await prisma.clientDocument.create({
            data: {
                clientId,
                category,
                fileName: req.file.originalname,
                filePath: `documents/${clientId}/${safeName}`,
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
        const doc = await prisma.clientDocument.findUnique({ where: { id } });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.filePath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

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

        // Delete file from disk
        const fullPath = path.join(__dirname, '..', '..', 'uploads', doc.filePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

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
