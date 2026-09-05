jest.mock('../../lib/storage', () => ({ downloadFile: jest.fn(), uploadFile: jest.fn(), deleteFile: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const { downloadFile, deleteFile } = require('../../lib/storage');
const { downloadCertification, downloadCertificationUpload, deleteCertification } = require('../employeeCertController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection — the mock db here
// stands in for that per-request tenant client.
const prisma = {
  employeeCertification: { findUnique: jest.fn(), delete: jest.fn() },
  certificationUpload: { findUnique: jest.fn(), findMany: jest.fn() },
};

function mockReqRes(id = 5) {
  const req = { params: { id: String(id) }, user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 }, db: prisma };
  const res = {
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('downloadCertification', () => {
  test('serves inline fileData when present (legacy path)', async () => {
    const bytes = Buffer.from('legacy-pdf-bytes');
    prisma.employeeCertification.findUnique.mockResolvedValue({
      id: 5, fileName: 'legacy.pdf', fileType: 'application/pdf', fileData: bytes, uploads: [],
    });
    const { req, res } = mockReqRes();

    await downloadCertification(req, res, jest.fn());

    expect(downloadFile).not.toHaveBeenCalled(); // used inline, not the bucket
    expect(res.send).toHaveBeenCalledWith(bytes);
    const headers = res.set.mock.calls[0][0];
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('legacy.pdf');
  });

  test('streams from the bucket when fileData is null (imported path)', async () => {
    const bytes = Buffer.from('bucket-pdf-bytes');
    prisma.employeeCertification.findUnique.mockResolvedValue({
      id: 5, fileName: 'TB_Angela.pdf', fileType: 'application/pdf', fileData: null,
      uploads: [
        { bucketKey: 'certs/9/tb_test/1-TB_Angela.pdf', fileName: 'TB_Angela.pdf', fileType: 'application/pdf' },
      ],
    });
    downloadFile.mockResolvedValue(bytes);
    const { req, res } = mockReqRes();

    await downloadCertification(req, res, jest.fn());

    expect(downloadFile).toHaveBeenCalledWith('certs/9/tb_test/1-TB_Angela.pdf');
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  test('404 when cert not found', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue(null);
    const { req, res } = mockReqRes();

    await downloadCertification(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });

  test('404 when no inline data and no bucket upload exists', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue({
      id: 5, fileName: 'x.pdf', fileType: 'application/pdf', fileData: null, uploads: [],
    });
    const { req, res } = mockReqRes();

    await downloadCertification(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('404 when bucket key exists but the object is missing in storage', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue({
      id: 5, fileName: 'x.pdf', fileType: 'application/pdf', fileData: null,
      uploads: [{ bucketKey: 'certs/9/tb_test/gone.pdf', fileName: 'x.pdf', fileType: 'application/pdf' }],
    });
    downloadFile.mockResolvedValue(null); // object not in bucket
    const { req, res } = mockReqRes();

    await downloadCertification(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('downloadCertificationUpload', () => {
  test('streams a history upload from the bucket by its id', async () => {
    const bytes = Buffer.from('history-file-bytes');
    prisma.certificationUpload.findUnique.mockResolvedValue({
      id: 42, bucketKey: 'certs/9/annual_training/1-old.pdf', fileName: 'old.pdf', fileType: 'application/pdf',
    });
    downloadFile.mockResolvedValue(bytes);
    const { req, res } = mockReqRes(42);

    await downloadCertificationUpload(req, res, jest.fn());

    expect(downloadFile).toHaveBeenCalledWith('certs/9/annual_training/1-old.pdf');
    expect(res.send).toHaveBeenCalledWith(bytes);
    const headers = res.set.mock.calls[0][0];
    expect(headers['Content-Disposition']).toContain('old.pdf');
  });

  test('404 when the upload row does not exist', async () => {
    prisma.certificationUpload.findUnique.mockResolvedValue(null);
    const { req, res } = mockReqRes(42);

    await downloadCertificationUpload(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  test('404 when the upload has no bucketKey', async () => {
    prisma.certificationUpload.findUnique.mockResolvedValue({ id: 42, bucketKey: '', fileName: 'x.pdf' });
    const { req, res } = mockReqRes(42);

    await downloadCertificationUpload(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('404 when the object is missing in storage', async () => {
    prisma.certificationUpload.findUnique.mockResolvedValue({
      id: 42, bucketKey: 'certs/9/annual_training/gone.pdf', fileName: 'x.pdf', fileType: 'application/pdf',
    });
    downloadFile.mockResolvedValue(null);
    const { req, res } = mockReqRes(42);

    await downloadCertificationUpload(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });
});


describe('deleteCertification — storage cleanup', () => {
  // A certification cascades to its CertificationUpload rows (Portfolio
  // History), so deleting one must clear EVERY upload's stored file, not just
  // the newest — otherwise the cascade strands them all.
  test('removes the stored file for every upload on the certification', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue({ id: 5, certType: 'tb_test' });
    prisma.certificationUpload.findMany.mockResolvedValue([
      { id: 1, bucketKey: 'certs/2/tb_test/1-a.pdf' },
      { id: 2, bucketKey: 'certs/2/tb_test/2-b.pdf' },
      { id: 3, bucketKey: 'certs/2/tb_test/3-c.pdf' },
    ]);
    prisma.employeeCertification.delete.mockResolvedValue({});

    const { req, res } = mockReqRes();
    await deleteCertification(req, res, jest.fn());

    expect(deleteFile).toHaveBeenCalledTimes(3);
    expect(deleteFile).toHaveBeenCalledWith('certs/2/tb_test/1-a.pdf');
    expect(deleteFile).toHaveBeenCalledWith('certs/2/tb_test/2-b.pdf');
    expect(deleteFile).toHaveBeenCalledWith('certs/2/tb_test/3-c.pdf');
    expect(prisma.employeeCertification.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  test('skips uploads that have no bucket key', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue({ id: 5, certType: 'tb_test' });
    prisma.certificationUpload.findMany.mockResolvedValue([
      { id: 1, bucketKey: '' },
      { id: 2, bucketKey: null },
      { id: 3, bucketKey: 'certs/2/tb_test/3-c.pdf' },
    ]);
    prisma.employeeCertification.delete.mockResolvedValue({});

    const { req, res } = mockReqRes();
    await deleteCertification(req, res, jest.fn());

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('certs/2/tb_test/3-c.pdf');
  });

  test('still deletes the certification when storage removal fails', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue({ id: 5, certType: 'tb_test' });
    prisma.certificationUpload.findMany.mockResolvedValue([
      { id: 1, bucketKey: 'certs/2/tb_test/1-a.pdf' },
    ]);
    prisma.employeeCertification.delete.mockResolvedValue({});
    deleteFile.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { req, res } = mockReqRes();
    await deleteCertification(req, res, jest.fn());

    expect(prisma.employeeCertification.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('does not touch storage when the certification is missing', async () => {
    prisma.employeeCertification.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes();
    await deleteCertification(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(prisma.employeeCertification.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
