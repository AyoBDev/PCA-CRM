jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn() }));

const { downloadFile } = require('../../lib/storage');
const { downloadDocument } = require('../documentController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
  clientDocument: { findUnique: jest.fn() },
};

function mockReqRes(id = 7) {
  const req = { params: { id: String(id) }, user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 }, db: prisma };
  const res = {
    setHeader: jest.fn(),
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    download: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('downloadDocument (client documents)', () => {
  test('serves inline fileData when present (legacy)', async () => {
    const bytes = Buffer.from('legacy-bytes');
    prisma.clientDocument.findUnique.mockResolvedValue({
      id: 7, fileName: 'a.pdf', mimeType: 'application/pdf', fileData: bytes, filePath: 'documents/1/a.pdf',
    });
    const { req, res } = mockReqRes();
    await downloadDocument(req, res, jest.fn());
    expect(downloadFile).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  test('streams from the bucket when fileData is null', async () => {
    const bytes = Buffer.from('bucket-bytes');
    prisma.clientDocument.findUnique.mockResolvedValue({
      id: 7, fileName: 'a.pdf', mimeType: 'application/pdf', fileData: null, filePath: 'client-documents/1/1-a.pdf',
    });
    downloadFile.mockResolvedValue(bytes);
    const { req, res } = mockReqRes();
    await downloadDocument(req, res, jest.fn());
    expect(downloadFile).toHaveBeenCalledWith('client-documents/1/1-a.pdf');
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  test('404 when document row not found', async () => {
    prisma.clientDocument.findUnique.mockResolvedValue(null);
    const { req, res } = mockReqRes();
    await downloadDocument(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
