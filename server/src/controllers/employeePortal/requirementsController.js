const { uploadFile } = require('../../lib/storage');
const audit = require('../../services/auditService');
const { tenantTransaction } = require('../../lib/tenantPrisma');

async function getCertifications(req, res) {
  const certs = await req.db.employeeCertification.findMany({
    where: { employeeId: req.employee.id },
    select: {
      id: true, certType: true, expirationDate: true, status: true, notes: true, updatedAt: true,
    },
    orderBy: { certType: 'asc' },
  });

  const counts = { approved: 0, pending: 0, actionNeeded: 0, total: certs.length };
  for (const c of certs) {
    if (c.status === 'approved' || c.status === 'active') counts.approved++;
    else if (c.status === 'pending') counts.pending++;
    else counts.actionNeeded++;
  }

  res.json({ certifications: certs, summary: counts });
}

async function uploadCertification(req, res) {
  const certId = parseInt(req.params.certId);
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const cert = await req.db.employeeCertification.findFirst({
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
  // Batch $transaction([...]) arrays are not supported on the extended tenant
  // client — use an interactive transaction and stamp agencyId explicitly.
  await tenantTransaction(req.employee.agencyId, async (tx) => {
    await tx.certificationUpload.create({
      data: {
        agencyId: req.employee.agencyId,
        certificationId: certId,
        bucketKey: key,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        note,
      },
    });
    await tx.employeeCertification.update({
      where: { id: certId },
      data: { status: 'pending' },
    });
  });

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

  const cert = await req.db.employeeCertification.create({
    data: { employeeId: req.employee.id, certType, status: 'pending', expirationDate, fileName: req.file.originalname, fileSize: req.file.size, fileType: req.file.mimetype },
  });

  await req.db.certificationUpload.create({
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

module.exports = { getCertifications, uploadCertification, createCertification };
