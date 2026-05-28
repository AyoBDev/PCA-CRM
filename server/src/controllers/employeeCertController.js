const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

async function listCertifications(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const certs = await prisma.employeeCertification.findMany({
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

        if (file) {
            data.fileName = file.originalname;
            data.fileSize = file.size;
            data.fileType = file.mimetype;
            data.fileData = file.buffer;
        }

        const cert = await prisma.employeeCertification.create({ data });

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
        audit.logAction(
            req.user.id, req.user.name, req.user.role,
            'CREATE', 'EmployeeCertification', cert.id,
            `${certType} - ${employee?.name || employeeId}`, [], {}
        );

        const { fileData, ...result } = cert;
        res.status(201).json(result);
    } catch (err) { next(err); }
}

async function updateCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { expirationDate, status, notes } = req.body;
        const file = req.file;

        const old = await prisma.employeeCertification.findUnique({ where: { id } });
        if (!old) return res.status(404).json({ error: 'Certification not found' });

        const data = {};
        if (expirationDate !== undefined) data.expirationDate = expirationDate ? new Date(expirationDate) : null;
        if (status !== undefined) data.status = status;
        if (notes !== undefined) data.notes = notes;

        if (file) {
            data.fileName = file.originalname;
            data.fileSize = file.size;
            data.fileType = file.mimetype;
            data.fileData = file.buffer;
        }

        const cert = await prisma.employeeCertification.update({ where: { id }, data });

        const changes = audit.diffFields(old, cert, ['expirationDate', 'status', 'notes', 'fileName']);
        audit.logAction(
            req.user.id, req.user.name, req.user.role,
            'UPDATE', 'EmployeeCertification', id,
            `${cert.certType}`, changes, {}
        );

        const { fileData, ...result } = cert;
        res.json(result);
    } catch (err) { next(err); }
}

async function deleteCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const cert = await prisma.employeeCertification.findUnique({ where: { id } });
        if (!cert) return res.status(404).json({ error: 'Certification not found' });

        await prisma.employeeCertification.delete({ where: { id } });

        audit.logAction(
            req.user.id, req.user.name, req.user.role,
            'DELETE', 'EmployeeCertification', id,
            cert.certType, [], {}
        );

        res.json({ success: true });
    } catch (err) { next(err); }
}

async function downloadCertification(req, res, next) {
    try {
        const id = Number(req.params.id);
        const cert = await prisma.employeeCertification.findUnique({ where: { id } });
        if (!cert || !cert.fileData) return res.status(404).json({ error: 'File not found' });

        const isPdf = cert.fileType === 'application/pdf';
        res.set({
            'Content-Type': cert.fileType || 'application/octet-stream',
            'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename="${cert.fileName}"`,
            'Content-Length': Buffer.from(cert.fileData).length,
        });
        res.send(Buffer.from(cert.fileData));
    } catch (err) { next(err); }
}

module.exports = { listCertifications, createCertification, updateCertification, deleteCertification, downloadCertification };
