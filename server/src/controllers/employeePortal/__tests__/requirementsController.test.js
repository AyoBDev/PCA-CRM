jest.mock('../../../lib/prisma', () => ({
  employeeCertification: { create: jest.fn(), findFirst: jest.fn() },
  certificationUpload: { create: jest.fn() },
  $transaction: jest.fn(async (ops) => Array.isArray(ops) ? Promise.all(ops.map(o => typeof o === 'function' ? o() : o)) : ops),
}));
jest.mock('../../../lib/storage', () => ({ uploadFile: jest.fn().mockResolvedValue() }));
jest.mock('../../../services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../../../lib/prisma');
const { uploadFile } = require('../../../lib/storage');
const audit = require('../../../services/auditService');
const { createCertification } = require('../requirementsController');

function mockReqRes(file, body = {}) {
  const req = {
    employee: { id: 7 },
    user: { id: 11, name: 'Tester', role: 'pca' },
    file,
    body,
  };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('createCertification', () => {
  test('rejects when no file is provided', async () => {
    const { req, res } = mockReqRes(undefined, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects unknown certType', async () => {
    const { req, res } = mockReqRes({ originalname: 'cpr.pdf', size: 100, buffer: Buffer.from(''), mimetype: 'application/pdf' }, { certType: 'Not Real' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects oversized file', async () => {
    const { req, res } = mockReqRes({ originalname: 'big.pdf', size: 12 * 1024 * 1024, buffer: Buffer.from(''), mimetype: 'application/pdf' }, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects disallowed mimetype', async () => {
    const { req, res } = mockReqRes({ originalname: 'x.exe', size: 100, buffer: Buffer.from(''), mimetype: 'application/x-msdownload' }, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('creates cert + upload + audit on happy path', async () => {
    prisma.employeeCertification.create.mockResolvedValue({ id: 99, certType: 'CPR', employeeId: 7, status: 'pending' });
    prisma.certificationUpload.create.mockResolvedValue({ id: 500 });

    const file = { originalname: 'cpr.pdf', size: 100, buffer: Buffer.from('hello'), mimetype: 'application/pdf' };
    const { req, res } = mockReqRes(file, { certType: 'CPR', expirationDate: '2027-01-01' });
    await createCertification(req, res);

    expect(uploadFile).toHaveBeenCalled();
    expect(prisma.employeeCertification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employeeId: 7, certType: 'CPR', status: 'pending' }),
    }));
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'CertificationUpload',
      userId: 11,
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
