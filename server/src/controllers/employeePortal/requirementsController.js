const { uploadFile, downloadFile } = require('../../lib/storage');
const { tenantKey } = require('../../services/storageService');
const audit = require('../../services/auditService');
const { tenantTransaction } = require('../../lib/tenantPrisma');

async function getCertifications(req, res) {
  const employeeId = req.employee.id;
  const [reqs, certTypes, certs] = await Promise.all([
    req.db.employeeRequirement.findMany({ where: { employeeId, kind: 'certification' } }),
    req.db.certType.findMany(),
    req.db.employeeCertification.findMany({
      where: { employeeId },
      include: {
        uploads: {
          orderBy: { submittedAt: 'desc' },
          select: { id: true, fileName: true, fileType: true, fileSize: true, submittedAt: true },
        },
      },
    }),
  ]);

  const certById = Object.fromEntries(certs.map(c => [c.id, c]));
  // Requirement rows and cert records, indexed by cert-type KEY so we can build
  // one card per catalog type (parity with the admin's full-catalog view) and
  // merge in this employee's requirement + record where they exist.
  const reqByCatalogId = Object.fromEntries(reqs.map(r => [r.catalogTypeId, r]));
  const certByType = {};
  for (const c of certs) {
    // Prefer an active/approved record; otherwise keep the most recent one.
    const cur = certByType[c.certType];
    if (!cur || (c.status === 'active' || c.status === 'approved') || (c.id > cur.id)) certByType[c.certType] = c;
  }

  // Base the list on every ACTIVE catalog cert type, so a type the employee has
  // no record/requirement for still appears (as 'required'), matching admin.
  const activeTypes = certTypes.filter(t => t.active !== false);
  const certifications = activeTypes.map(cat => {
    const r = reqByCatalogId[cat.id] || null;
    const cert = (r && r.certificationId ? certById[r.certificationId] : null) || certByType[cat.key] || null;
    return {
      requirementId: r ? r.id : null,
      certificationId: cert ? cert.id : null,
      certType: cat.key,
      label: cat.label || cat.key,
      status: cert ? cert.status : 'required',
      reviewStatus: (r && r.reviewStatus) || 'pending',
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
  const key = tenantKey(`certs/${req.employee.id}/${cert.certType}/${timestamp}-${req.file.originalname}`);
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
  const key = tenantKey(`certs/${req.employee.id}/${certType}/${timestamp}-${req.file.originalname}`);
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

async function downloadCertificationUpload(req, res) {
  const uploadId = parseInt(req.params.uploadId);
  const upload = await req.db.certificationUpload.findFirst({
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
