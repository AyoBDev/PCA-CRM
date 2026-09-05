jest.mock('../../lib/storage', () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  deleteFile: jest.fn(),
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));

const { deleteFile } = require('../../lib/storage');
const audit = require('../../services/auditService');
const { deleteLeadDocument } = require('../leadDocumentController');

// Controllers read the DB via req.db (tenant-scoped client set by tenantMiddleware).
const prisma = {
  leadDocument: { findUnique: jest.fn(), delete: jest.fn() },
};

function mockReqRes(id = 7) {
  const req = {
    params: { id: String(id) },
    user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
    db: prisma,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

const DOC = {
  id: 7,
  leadId: 52,
  fileName: 'referral.pdf',
  filePath: 'agency/1/lead-documents/52/123-referral.pdf',
  lead: { id: 52, firstName: 'Jamison', lastName: 'Cooper' },
};

beforeEach(() => { jest.clearAllMocks(); });

describe('deleteLeadDocument — storage cleanup', () => {
  test('removes the stored file as well as the DB row', async () => {
    prisma.leadDocument.findUnique.mockResolvedValue(DOC);
    prisma.leadDocument.delete.mockResolvedValue(DOC);

    const { req, res } = mockReqRes();
    await deleteLeadDocument(req, res, jest.fn());

    expect(deleteFile).toHaveBeenCalledWith(DOC.filePath);
    expect(prisma.leadDocument.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('still deletes the DB row when the stored file is already gone', async () => {
    prisma.leadDocument.findUnique.mockResolvedValue(DOC);
    prisma.leadDocument.delete.mockResolvedValue(DOC);
    deleteFile.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { req, res } = mockReqRes();
    await deleteLeadDocument(req, res, jest.fn());

    // A storage failure must not strand the row — the user asked for it gone.
    expect(prisma.leadDocument.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(audit.logAction).toHaveBeenCalled();
  });

  test('does not touch storage when the document row is missing', async () => {
    prisma.leadDocument.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes();
    await deleteLeadDocument(req, res, jest.fn());

    expect(deleteFile).not.toHaveBeenCalled();
    expect(prisma.leadDocument.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
