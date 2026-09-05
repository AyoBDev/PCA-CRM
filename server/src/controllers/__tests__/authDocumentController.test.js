jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn(), deleteFile: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const { downloadFile, deleteFile } = require('../../lib/storage');
const { downloadAuthDocument, deleteAuthDocument } = require('../authDocumentController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
  authorization_documents: { findUnique: jest.fn(), delete: jest.fn() },
};

function mockReqRes(id = 3) {
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

describe('downloadAuthDocument (authorization documents)', () => {
  test('serves inline file_data when present (legacy)', async () => {
    const bytes = Buffer.from('legacy-auth-bytes');
    prisma.authorization_documents.findUnique.mockResolvedValue({
      id: 3, file_name: 'auth.pdf', mime_type: 'application/pdf', file_data: bytes, file_path: 'auth-documents/9/auth.pdf',
    });
    const { req, res } = mockReqRes();
    await downloadAuthDocument(req, res, jest.fn());
    expect(downloadFile).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  test('streams from the bucket when file_data is null', async () => {
    const bytes = Buffer.from('bucket-auth-bytes');
    prisma.authorization_documents.findUnique.mockResolvedValue({
      id: 3, file_name: 'auth.pdf', mime_type: 'application/pdf', file_data: null, file_path: 'auth-documents/9/1-auth.pdf',
    });
    downloadFile.mockResolvedValue(bytes);
    const { req, res } = mockReqRes();
    await downloadAuthDocument(req, res, jest.fn());
    expect(downloadFile).toHaveBeenCalledWith('auth-documents/9/1-auth.pdf');
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  test('404 when document row not found', async () => {
    prisma.authorization_documents.findUnique.mockResolvedValue(null);
    const { req, res } = mockReqRes();
    await downloadAuthDocument(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});


describe('deleteAuthDocument — storage cleanup', () => {
  const DOC = {
    id: 3, file_name: 'auth.pdf', file_path: 'auth-documents/9/1-auth.pdf', file_data: null,
    authorizations: { serviceCode: 'PCS', client: { clientName: 'Jane Doe' } },
  };

  test('removes the bucket object as well as the DB row', async () => {
    prisma.authorization_documents.findUnique.mockResolvedValue(DOC);
    prisma.authorization_documents.delete.mockResolvedValue(DOC);

    const { req, res } = mockReqRes();
    await deleteAuthDocument(req, res, jest.fn());

    expect(deleteFile).toHaveBeenCalledWith(DOC.file_path);
    expect(prisma.authorization_documents.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('skips storage for legacy rows that kept bytes inline', async () => {
    prisma.authorization_documents.findUnique.mockResolvedValue({
      ...DOC, file_path: null, file_data: Buffer.from('inline'),
    });
    prisma.authorization_documents.delete.mockResolvedValue({});

    const { req, res } = mockReqRes();
    await deleteAuthDocument(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(prisma.authorization_documents.delete).toHaveBeenCalled();
  });

  test('still deletes the row when storage removal fails', async () => {
    prisma.authorization_documents.findUnique.mockResolvedValue(DOC);
    prisma.authorization_documents.delete.mockResolvedValue(DOC);
    deleteFile.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { req, res } = mockReqRes();
    await deleteAuthDocument(req, res, jest.fn());

    expect(prisma.authorization_documents.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('does not touch storage when the row is missing', async () => {
    prisma.authorization_documents.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes();
    await deleteAuthDocument(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
