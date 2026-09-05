jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn(), deleteFile: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const { downloadFile, deleteFile } = require('../../lib/storage');
const { downloadDocument, deleteDocument } = require('../documentController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
  clientDocument: { findUnique: jest.fn(), delete: jest.fn() },
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


describe('deleteDocument — storage cleanup', () => {
  const DOC = {
    id: 7, fileName: 'a.pdf', filePath: 'client-documents/1/123-a.pdf', fileData: null,
    client: { clientName: 'Jane Doe' },
  };

  test('removes the bucket object as well as the DB row', async () => {
    prisma.clientDocument.findUnique.mockResolvedValue(DOC);
    prisma.clientDocument.delete.mockResolvedValue(DOC);

    const { req, res } = mockReqRes();
    await deleteDocument(req, res, jest.fn());

    expect(deleteFile).toHaveBeenCalledWith(DOC.filePath);
    expect(prisma.clientDocument.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('skips storage for legacy rows that kept bytes inline', async () => {
    prisma.clientDocument.findUnique.mockResolvedValue({
      ...DOC, filePath: null, fileData: Buffer.from('inline'),
    });
    prisma.clientDocument.delete.mockResolvedValue({});

    const { req, res } = mockReqRes();
    await deleteDocument(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(prisma.clientDocument.delete).toHaveBeenCalled();
  });

  test('still deletes the row when storage removal fails', async () => {
    prisma.clientDocument.findUnique.mockResolvedValue(DOC);
    prisma.clientDocument.delete.mockResolvedValue(DOC);
    deleteFile.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { req, res } = mockReqRes();
    await deleteDocument(req, res, jest.fn());

    expect(prisma.clientDocument.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('does not touch storage when the row is missing', async () => {
    prisma.clientDocument.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes();
    await deleteDocument(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
