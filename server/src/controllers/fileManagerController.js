const prisma = require('../lib/prisma');
const storage = require('../services/storageService');
const audit = require('../services/auditService');

// GET /api/files/folders?parentId=X (null for root)
async function listFolders(req, res, next) {
    try {
        const parentId = req.query.parentId ? Number(req.query.parentId) : null;
        const folders = await prisma.adminFolder.findMany({
            where: { parentId },
            orderBy: { name: 'asc' },
        });
        const files = await prisma.adminFile.findMany({
            where: { folderId: parentId || -1 },
            orderBy: { name: 'asc' },
            include: { uploader: { select: { id: true, name: true } } },
        });
        res.json({ folders, files });
    } catch (err) { next(err); }
}

// GET /api/files/folders/:id
async function getFolder(req, res, next) {
    try {
        const id = Number(req.params.id);
        const folder = await prisma.adminFolder.findUnique({ where: { id } });
        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        const children = await prisma.adminFolder.findMany({
            where: { parentId: id },
            orderBy: { name: 'asc' },
        });
        const files = await prisma.adminFile.findMany({
            where: { folderId: id },
            orderBy: { name: 'asc' },
            include: { uploader: { select: { id: true, name: true } } },
        });
        res.json({ folder, children, files });
    } catch (err) { next(err); }
}

// POST /api/files/folders
async function createFolder(req, res, next) {
    try {
        const { name, parentId } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name is required' });

        const pid = parentId ? Number(parentId) : null;
        let parentPath = '';
        if (pid) {
            const parent = await prisma.adminFolder.findUnique({ where: { id: pid } });
            if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
            parentPath = parent.path;
        }

        const duplicate = await prisma.adminFolder.findFirst({
            where: { name: name.trim(), parentId: pid },
        });
        if (duplicate) return res.status(409).json({ error: 'A folder with that name already exists here' });

        const folder = await prisma.adminFolder.create({
            data: {
                name: name.trim(),
                parentId: pid,
                path: `${parentPath}/${name.trim()}`,
            },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'AdminFolder', entityId: folder.id,
            entityName: folder.path,
        });

        res.status(201).json(folder);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A folder with that name already exists here' });
        next(err);
    }
}

// PATCH /api/files/folders/:id
async function updateFolder(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { name, parentId } = req.body;

        const folder = await prisma.adminFolder.findUnique({ where: { id } });
        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        const data = {};
        if (name && name.trim()) data.name = name.trim();
        if (parentId !== undefined) data.parentId = parentId ? Number(parentId) : null;

        // Recompute path
        let parentPath = '';
        const newParentId = data.parentId !== undefined ? data.parentId : folder.parentId;
        if (newParentId) {
            const parent = await prisma.adminFolder.findUnique({ where: { id: newParentId } });
            if (parent) parentPath = parent.path;
        }
        data.path = `${parentPath}/${data.name || folder.name}`;

        const updated = await prisma.adminFolder.update({ where: { id }, data });

        // Recursively update children paths
        await updateChildPaths(id, updated.path);

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'AdminFolder', entityId: id,
            entityName: updated.path,
            changes: audit.diffFields(folder, updated, ['name', 'path', 'parentId']),
        });

        res.json(updated);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A folder with that name already exists here' });
        next(err);
    }
}

async function updateChildPaths(parentId, parentPath) {
    const children = await prisma.adminFolder.findMany({ where: { parentId } });
    for (const child of children) {
        const newPath = `${parentPath}/${child.name}`;
        await prisma.adminFolder.update({ where: { id: child.id }, data: { path: newPath } });
        await updateChildPaths(child.id, newPath);
    }
}

// DELETE /api/files/folders/:id
async function deleteFolder(req, res, next) {
    try {
        const id = Number(req.params.id);
        const folder = await prisma.adminFolder.findUnique({ where: { id } });
        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        // Collect all file storage keys for S3 cleanup
        const storageKeys = await collectStorageKeys(id);
        if (storageKeys.length) await storage.removeBatch(storageKeys);

        await prisma.adminFolder.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'AdminFolder', entityId: id,
            entityName: folder.path,
            metadata: { filesDeleted: storageKeys.length },
        });

        res.status(204).end();
    } catch (err) { next(err); }
}

async function collectStorageKeys(folderId) {
    const keys = [];
    const files = await prisma.adminFile.findMany({ where: { folderId }, select: { storageKey: true } });
    keys.push(...files.map(f => f.storageKey));
    const children = await prisma.adminFolder.findMany({ where: { parentId: folderId }, select: { id: true } });
    for (const child of children) {
        keys.push(...await collectStorageKeys(child.id));
    }
    return keys;
}

// POST /api/files/upload (multipart, folderId in body)
async function uploadFile(req, res, next) {
    try {
        const folderId = Number(req.body.folderId);
        if (!folderId) return res.status(400).json({ error: 'folderId is required' });

        const folder = await prisma.adminFolder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const storageKey = `admin-files${folder.path}/${Date.now()}-${req.file.originalname}`;

        await storage.upload(storageKey, req.file.buffer, req.file.mimetype || 'application/octet-stream');

        const file = await prisma.adminFile.create({
            data: {
                name: req.file.originalname,
                folderId,
                storageKey,
                fileSize: req.file.size,
                mimeType: req.file.mimetype || '',
                uploadedBy: req.user.id,
            },
            include: { uploader: { select: { id: true, name: true } } },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'AdminFile', entityId: file.id,
            entityName: `${folder.path}/${file.name}`,
        });

        res.status(201).json(file);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A file with that name already exists in this folder' });
        next(err);
    }
}

// GET /api/files/:id/download
async function downloadFile(req, res, next) {
    try {
        const id = Number(req.params.id);
        const file = await prisma.adminFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        const stream = await storage.download(file.storageKey);
        if (!stream) return res.status(404).json({ error: 'File data not found in storage' });

        const mimeType = file.mimeType || 'application/octet-stream';
        const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', mimeType);

        if (stream.pipe) {
            stream.pipe(res);
        } else {
            const { Readable } = require('stream');
            Readable.fromWeb(stream.transformToWebStream()).pipe(res);
        }
    } catch (err) { next(err); }
}

// PATCH /api/files/:id
async function updateFile(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { name, folderId } = req.body;

        const file = await prisma.adminFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        const data = {};
        if (name && name.trim()) data.name = name.trim();
        if (folderId) data.folderId = Number(folderId);

        const updated = await prisma.adminFile.update({ where: { id }, data });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'AdminFile', entityId: id,
            entityName: updated.name,
            changes: audit.diffFields(file, updated, ['name', 'folderId']),
        });

        res.json(updated);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A file with that name already exists in this folder' });
        next(err);
    }
}

// DELETE /api/files/:id
async function deleteFile(req, res, next) {
    try {
        const id = Number(req.params.id);
        const file = await prisma.adminFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        await storage.remove(file.storageKey);
        await prisma.adminFile.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'AdminFile', entityId: id,
            entityName: file.name,
        });

        res.status(204).end();
    } catch (err) { next(err); }
}

// POST /api/files/copy
async function copyFile(req, res, next) {
    try {
        const { fileIds, targetFolderId } = req.body;
        if (!fileIds?.length || !targetFolderId) {
            return res.status(400).json({ error: 'fileIds and targetFolderId are required' });
        }

        const target = await prisma.adminFolder.findUnique({ where: { id: Number(targetFolderId) } });
        if (!target) return res.status(404).json({ error: 'Target folder not found' });

        const copies = [];
        for (const fileId of fileIds) {
            const original = await prisma.adminFile.findUnique({ where: { id: Number(fileId) } });
            if (!original) continue;

            const stream = await storage.download(original.storageKey);
            if (!stream) continue;

            // Read the stream into a buffer
            const chunks = [];
            if (stream.pipe) {
                for await (const chunk of stream) chunks.push(chunk);
            } else {
                const webStream = stream.transformToWebStream();
                const reader = webStream.getReader();
                let done = false;
                while (!done) {
                    const { value, done: d } = await reader.read();
                    if (value) chunks.push(value);
                    done = d;
                }
            }
            const buffer = Buffer.concat(chunks);

            const newKey = `admin-files${target.path}/${Date.now()}-${original.name}`;
            await storage.upload(newKey, buffer, original.mimeType || 'application/octet-stream');

            const copy = await prisma.adminFile.create({
                data: {
                    name: original.name,
                    folderId: Number(targetFolderId),
                    storageKey: newKey,
                    fileSize: original.fileSize,
                    mimeType: original.mimeType,
                    uploadedBy: req.user.id,
                },
                include: { uploader: { select: { id: true, name: true } } },
            });
            copies.push(copy);
        }

        res.status(201).json(copies);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A file with that name already exists in the target folder' });
        next(err);
    }
}

// GET /api/files/search?q=term
async function searchFiles(req, res, next) {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ folders: [], files: [] });

        const folders = await prisma.adminFolder.findMany({
            where: { name: { contains: q, mode: 'insensitive' } },
            orderBy: { path: 'asc' },
            take: 50,
        });
        const files = await prisma.adminFile.findMany({
            where: { name: { contains: q, mode: 'insensitive' } },
            orderBy: { name: 'asc' },
            include: { folder: { select: { path: true } }, uploader: { select: { id: true, name: true } } },
            take: 50,
        });

        res.json({ folders, files });
    } catch (err) { next(err); }
}

// GET /api/files/export — stream all files as a zip
async function exportFiles(req, res, next) {
    try {
        const archiver = require('archiver');
        const allFiles = await prisma.adminFile.findMany({
            include: { folder: { select: { path: true } } },
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="admin-files-export.zip"`);

        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(res);

        for (const file of allFiles) {
            const stream = await storage.download(file.storageKey);
            if (!stream) continue;
            const filePath = `${file.folder.path}/${file.name}`.replace(/^\//, '');
            archive.append(stream, { name: filePath });
        }

        await archive.finalize();
    } catch (err) { next(err); }
}

module.exports = {
    listFolders,
    getFolder,
    createFolder,
    updateFolder,
    deleteFolder,
    uploadFile,
    downloadFile,
    updateFile,
    deleteFile,
    copyFile,
    searchFiles,
    exportFiles,
};
