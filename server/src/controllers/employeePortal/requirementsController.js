const prisma = require('../../lib/prisma');
const { uploadFile } = require('../../lib/storage');

async function getCertifications(req, res) {
  const certs = await prisma.employeeCertification.findMany({
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

  res.json({ success: true, status: 'pending' });
}

module.exports = { getCertifications, uploadCertification };
