const audit = require('../services/auditService');
const { uploadFile, downloadFile } = require('../lib/storage');
const { tenantKey } = require('../services/storageService');
const { approveCertRenewal } = require('../services/complianceService');

// Upload the file to the bucket BEFORE any cert record is written, so a bucket
// failure aborts the request without persisting a partial/orphaned cert row.
async function uploadFileToBucket(employeeId, certType, file) {
    const timestamp = Date.now();
    const bucketKey = tenantKey(`certs/${employeeId}/${certType}/${timestamp}-${file.originalname}`);
    await uploadFile(bucketKey, file.buffer, file.mimetype || 'application/octet-stream');
    return bucketKey;
}

async function writeUploadRow(db, cert, file, user, bucketKey) {
    await db.certificationUpload.create({
        data: {
            certificationId: cert.id,
            bucketKey,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype || 'application/octet-stream',
            uploadedById: user?.id ?? null,
            uploadedByName: user?.name || '',
            effectiveDate: new Date(),
            expirationDate: cert.expirationDate || null,
        },
    });
}

async function listCertifications(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const certs = await req.db.employeeCertification.findMany({
            where: { employeeId },
            orderBy: [{ certType: 'asc' }, { createdAt: 'desc' }],
            select: {
                id: true,
                employeeId: true,
                certType: true,
                expirationDate: true,
                status: true,
                fileName: true,
                fileSize: true,
                fileType: true,
                notes: true,
                createdAt: true,
                updatedAt: true,
                uploads: {
                    select: { id: true, fileName: true, fileSize: true, fileType: true, note: true, submittedAt: true, uploadedByName: true, effectiveDate: true, expirationDate: true },
                    orderBy: { submittedAt: 'desc' },
                },
            },
        });
        res.json(certs);
    } catch (err) { next(err); }
}

async function createCertification(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const { certType, expirationDate, status, notes } = req.body;
        const file = req.file;

        const data = {
            employeeId,
            certType,
            expirationDate: expirationDate ? new Date(expirationDate) : null,
            status: status || 'active',
            notes: notes || '',
        };

        let bucketKey = null;
        if (file) {
            data.fileName = file.originalname;
            data.fileSize = file.size;
            data.fileType = file.mimetype;
            data.fileData = file.buffer;
            bucketKey = await uploadFileToBucket(employeeId, certType, file);
        }

        const cert = await req.db.employeeCertification.create({ data });

        if (file) await writeUploadRow(req.db, cert, file, req.user, bucketKey);

        const employee = await req.db.employee.findUnique({ where: { id: employeeId } });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'EmployeeCertification', entityId: cert.id,
            entityName: `${certType} - ${employee?.name || employeeId}`, changes: [], metadata: {},
        });

        const { fileData, ...result } = cert;
        res.status(201).json(result);
    } catch (err) { next(err); }
}

async function updateCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { expirationDate, status, notes } = req.body;
        const file = req.file;

        const old = await req.db.employeeCertification.findUnique({ where: { id } });
        if (!old) return res.status(404).json({ error: 'Certification not found' });

        const isApprovalTransition =
            (status === 'approved' || status === 'active') &&
            old.status !== 'approved' && old.status !== 'active';

        if (isApprovalTransition && !file) {
            const newExp = expirationDate !== undefined
                ? (expirationDate ? new Date(expirationDate) : old.expirationDate)
                : old.expirationDate;
            const cert = await approveCertRenewal(id, newExp, req.user);
            audit.logAction({
                userId: req.user.id, userName: req.user.name, userRole: req.user.role,
                action: 'UPDATE', entityType: 'EmployeeCertification', entityId: id,
                entityName: cert.certType || old.certType, changes: [],
                metadata: { action: 'cert_renewal_approved' },
            });
            const { fileData, ...result } = cert;
            return res.json(result);
        }

        const data = {};
        if (expirationDate !== undefined) data.expirationDate = expirationDate ? new Date(expirationDate) : null;
        if (status !== undefined) data.status = status;
        if (notes !== undefined) data.notes = notes;

        let bucketKey = null;
        if (file) {
            data.fileName = file.originalname;
            data.fileSize = file.size;
            data.fileType = file.mimetype;
            data.fileData = file.buffer;
            bucketKey = await uploadFileToBucket(old.employeeId, old.certType, file);
        }

        const cert = await req.db.employeeCertification.update({ where: { id }, data });

        if (file) await writeUploadRow(req.db, cert, file, req.user, bucketKey);

        const changes = audit.diffFields(old, cert, ['expirationDate', 'status', 'notes', 'fileName']);
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'EmployeeCertification', entityId: id,
            entityName: `${cert.certType}`, changes, metadata: {},
        });

        const { fileData, ...result } = cert;
        res.json(result);
    } catch (err) { next(err); }
}

async function deleteCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const cert = await req.db.employeeCertification.findUnique({ where: { id } });
        if (!cert) return res.status(404).json({ error: 'Certification not found' });

        await req.db.employeeCertification.delete({ where: { id } });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'DELETE', entityType: 'EmployeeCertification', entityId: id,
            entityName: cert.certType, changes: [], metadata: {},
        });

        res.json({ success: true });
    } catch (err) { next(err); }
}

async function downloadCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const cert = await req.db.employeeCertification.findUnique({
            where: { id },
            include: { uploads: { orderBy: { submittedAt: 'desc' } } },
        });
        if (!cert) return res.status(404).json({ error: 'File not found' });

        // Legacy / app-uploaded certs keep bytes inline. Imported certs store the
        // file only in the bucket (no inline fileData) — stream it from there.
        let buffer;
        let fileName = cert.fileName;
        let fileType = cert.fileType;
        if (cert.fileData) {
            buffer = Buffer.from(cert.fileData);
        } else {
            // Pick the active upload: prefer the one whose fileName matches the
            // cert's active file, else the most recently submitted upload.
            const uploads = cert.uploads || [];
            const active = uploads.find(u => u.fileName === cert.fileName) || uploads[0];
            if (!active || !active.bucketKey) return res.status(404).json({ error: 'File not found' });
            buffer = await downloadFile(active.bucketKey);
            if (!buffer) return res.status(404).json({ error: 'File not found in storage' });
            fileName = active.fileName || fileName;
            fileType = active.fileType || fileType;
        }

        const isPdf = fileType === 'application/pdf';
        res.set({
            'Content-Type': fileType || 'application/octet-stream',
            'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (err) { next(err); }
}

// Download a single CertificationUpload (e.g. an archived history attachment) by
// its id, streaming the file from the bucket. History files are bucket-only, so
// this is the only way to view them from the UI.
async function downloadCertificationUpload(req, res, next) {
    try {
        const id = Number(req.params.id);
        const upload = await req.db.certificationUpload.findUnique({ where: { id } });
        if (!upload || !upload.bucketKey) return res.status(404).json({ error: 'File not found' });

        const buffer = await downloadFile(upload.bucketKey);
        if (!buffer) return res.status(404).json({ error: 'File not found in storage' });

        const isPdf = upload.fileType === 'application/pdf';
        res.set({
            'Content-Type': upload.fileType || 'application/octet-stream',
            'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename="${upload.fileName}"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (err) { next(err); }
}

module.exports = { listCertifications, createCertification, updateCertification, deleteCertification, downloadCertification, downloadCertificationUpload };
