jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn() }));

const { downloadFile } = require('../../lib/storage');
const { downloadAuthDocument } = require('../authDocumentController');

// Controllers read the DB via req.db (tenant-scoped client set by
// tenantMiddleware), not the owner lib/prisma connection.
const prisma = {
  authorization_documents: { findUnique: jest.fn() },
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
