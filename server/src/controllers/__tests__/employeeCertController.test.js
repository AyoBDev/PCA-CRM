jest.mock('../../lib/prisma', () => ({
  employeeCertification: { findUnique: jest.fn() },
}));
jest.mock('../../lib/storage', () => ({ downloadFile: jest.fn() }));

const prisma = require('../../lib/prisma');
const { downloadFile } = require('../../lib/storage');
const { downloadCertification } = require('../employeeCertController');

function mockReqRes(id = 5) {
  const req = { params: { id: String(id) }, user: { id: 1, name: 'Admin', role: 'admin' } };
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
