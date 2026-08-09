// server/src/controllers/__tests__/employeeCertUpload.test.js
jest.mock('../../lib/prisma', () => ({
  employeeCertification: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  certificationUpload: { create: jest.fn() },
  employee: { findUnique: jest.fn() },
}));
jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));

const prisma = require('../../lib/prisma');
const { uploadFile } = require('../../lib/storage');
const { createCertification } = require('../employeeCertController');

function res() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('createCertification with a file', () => {
  test('uploads to bucket and writes an attributed CertificationUpload snapshot', async () => {
    prisma.employeeCertification.create.mockResolvedValue({
      id: 42, employeeId: 7, certType: 'CPR', expirationDate: new Date('2027-08-09'), fileName: 'cpr.pdf',
    });
    prisma.employee.findUnique.mockResolvedValue({ id: 7, name: 'Jane Doe' });

    const req = {
      params: { employeeId: '7' },
      body: { certType: 'CPR', expirationDate: '2027-08-09', status: 'active', notes: '' },
      user: { id: 1, name: 'Admin', role: 'admin' },
      file: { originalname: 'cpr.pdf', size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x') },
    };
    const r = res();

    await createCertification(req, r, jest.fn());

    expect(uploadFile).toHaveBeenCalledTimes(1);
    const key = uploadFile.mock.calls[0][0];
    expect(key).toMatch(/^certs\/7\/CPR\/\d+-cpr\.pdf$/);

    expect(prisma.certificationUpload.create).toHaveBeenCalledTimes(1);
    const data = prisma.certificationUpload.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      certificationId: 42,
      bucketKey: key,
      fileName: 'cpr.pdf',
      fileType: 'application/pdf',
      uploadedById: 1,
      uploadedByName: 'Admin',
    });
    expect(data.expirationDate).toBeInstanceOf(Date);
    expect(data.effectiveDate).toBeInstanceOf(Date);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  test('no file => no bucket upload and no snapshot row', async () => {
    prisma.employeeCertification.create.mockResolvedValue({ id: 43, employeeId: 7, certType: 'TB' });
    prisma.employee.findUnique.mockResolvedValue({ id: 7, name: 'Jane Doe' });
    const req = {
      params: { employeeId: '7' },
      body: { certType: 'TB', status: 'active' },
      user: { id: 1, name: 'Admin', role: 'admin' },
      file: null,
    };
    const r = res();

    await createCertification(req, r, jest.fn());

    expect(uploadFile).not.toHaveBeenCalled();
    expect(prisma.certificationUpload.create).not.toHaveBeenCalled();
  });
});
