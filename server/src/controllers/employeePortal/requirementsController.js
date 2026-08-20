const prisma = require('../../lib/prisma');
const { uploadFile, downloadFile } = require('../../lib/storage');
const audit = require('../../services/auditService');

async function getCertifications(req, res) {
  const employeeId = req.employee.id;
  const [reqs, certTypes, certs] = await Promise.all([
    prisma.employeeRequirement.findMany({ where: { employeeId, kind: 'certification' } }),
    prisma.certType.findMany(),
    prisma.employeeCertification.findMany({
      where: { employeeId },
      include: {
        uploads: {
          orderBy: { submittedAt: 'desc' },
          select: { id: true, fileName: true, fileType: true, fileSize: true, submittedAt: true },
        },
      },
    }),
  ]);

  const catById = Object.fromEntries(certTypes.map(c => [c.id, c]));
  const certById = Object.fromEntries(certs.map(c => [c.id, c]));

  const certifications = reqs.map(r => {
    const cat = catById[r.catalogTypeId] || {};
    const cert = r.certificationId ? certById[r.certificationId] : null;
    return {
      requirementId: r.id,
      certificationId: cert ? cert.id : null,
      certType: cat.key || (cert ? cert.certType : ''),
      label: cat.label || (cert ? cert.certType : ''),
      status: cert ? cert.status : 'required',
      reviewStatus: r.reviewStatus || 'pending',
      expirationDate: cert ? cert.expirationDate : null,
      requiresExpiry: Boolean(cat.requiresExpiry),
      renewalYears: cat.renewalYears ?? null,
      currentFile: cert && cert.fileName ? { fileName: cert.fileName } : null,
      uploads: cert ? (cert.uploads || []) : [],
    };
  });

  const counts = { approved: 0, pending: 0, actionNeeded: 0, total: certifications.length };
  for (const c of certifications) {
    if (c.status === 'approved' || c.status === 'active') counts.approved++;
    else if (c.status === 'pending' || c.status === 'submitted') counts.pending++;
    else counts.actionNeeded++;
  }

  res.json({ certifications, summary: counts });
}

async function uploadCertification(req, res) {
  const certId = parseInt(req.params.certId);
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const cert = await prisma.employeeCertification.findFirst({
    where: { id: certId, employeeId: req.employee.id },
  });
  if (!cert) return res.status(404).json({ error: 'Certification not found' });

  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
  if (!allowed.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
  }
  if (req.file.size > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });
  }

  const timestamp = Date.now();
  const key = `certs/${req.employee.id}/${cert.certType}/${timestamp}-${req.file.originalname}`;
  await uploadFile(key, req.file.buffer, req.file.mimetype);

  const note = req.body.note || '';
  await prisma.$transaction([
    prisma.certificationUpload.create({
      data: {
        certificationId: certId,
        bucketKey: key,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        note,
      },
    }),
    prisma.employeeCertification.update({
      where: { id: certId },
      data: { status: 'pending' },
    }),
  ]);

  audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'CertificationUpload', entityId: certId, entityName: `${cert.certType} - ${req.file.originalname}`, metadata: { employeeId: req.employee.id, fileName: req.file.originalname } });
  res.json({ success: true, status: 'pending' });
}

const CERT_TYPES = [
  'TB Test',
  'CPR',
  'Annual Training',
  'Cultural Competency',
  'Infection Control',
  'Background Check',
  'ID',
  'Other',
];

async function createCertification(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const certType = (req.body && req.body.certType) || '';
  if (!CERT_TYPES.includes(certType)) return res.status(400).json({ error: 'Invalid certType' });

  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
  if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
  if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });

  const expirationDate = req.body && req.body.expirationDate ? new Date(req.body.expirationDate) : null;
  const timestamp = Date.now();
  const key = `certs/${req.employee.id}/${certType}/${timestamp}-${req.file.originalname}`;
  await uploadFile(key, req.file.buffer, req.file.mimetype);

  const cert = await prisma.employeeCertification.create({
    data: { employeeId: req.employee.id, certType, status: 'pending', expirationDate, fileName: req.file.originalname, fileSize: req.file.size, fileType: req.file.mimetype },
  });

  await prisma.certificationUpload.create({
    data: {
      certificationId: cert.id,
      bucketKey: key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      note: '',
    },
  });

  audit.logAction({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CREATE',
    entityType: 'CertificationUpload',
    entityId: cert.id,
    entityName: `${certType} - ${req.file.originalname}`,
    metadata: { employeeId: req.employee.id, fileName: req.file.originalname, certType, source: 'employee-self-upload' },
  });

  res.json({ success: true, certificationId: cert.id, status: 'pending' });
}

async function downloadCertificationUpload(req, res) {
  const uploadId = parseInt(req.params.uploadId);
  const upload = await prisma.certificationUpload.findFirst({
    where: { id: uploadId, certification: { employeeId: req.employee.id } },
  });
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
}

module.exports = { getCertifications, uploadCertification, createCertification, downloadCertificationUpload };
