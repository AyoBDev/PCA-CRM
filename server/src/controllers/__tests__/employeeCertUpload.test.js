// server/src/controllers/__tests__/employeeCertUpload.test.js
jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));
jest.mock('../../services/storageService', () => ({ tenantKey: jest.fn((k) => `agency/1/${k}`) }));

const { uploadFile } = require('../../lib/storage');
const { createCertification, listCertifications } = require('../employeeCertController');

function res() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function mockDb() {
  return {
    employeeCertification: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    certificationUpload: { create: jest.fn() },
    employee: { findUnique: jest.fn() },
  };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('createCertification with a file', () => {
  test('uploads to bucket and writes an attributed CertificationUpload snapshot', async () => {
    const db = mockDb();
    db.employeeCertification.create.mockResolvedValue({
      id: 42, employeeId: 7, certType: 'CPR', expirationDate: new Date('2027-08-09'), fileName: 'cpr.pdf',
    });
    db.employee.findUnique.mockResolvedValue({ id: 7, name: 'Jane Doe' });

    const req = {
      params: { employeeId: '7' },
      body: { certType: 'CPR', expirationDate: '2027-08-09', status: 'active', notes: '' },
      user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
      file: { originalname: 'cpr.pdf', size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x') },
      db,
    };
    const r = res();

    await createCertification(req, r, jest.fn());

    expect(uploadFile).toHaveBeenCalledTimes(1);
    const key = uploadFile.mock.calls[0][0];
    expect(key).toMatch(/^agency\/1\/certs\/7\/CPR\/\d+-cpr\.pdf$/);

    expect(db.certificationUpload.create).toHaveBeenCalledTimes(1);
    const data = db.certificationUpload.create.mock.calls[0][0].data;
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
    const db = mockDb();
    db.employeeCertification.create.mockResolvedValue({ id: 43, employeeId: 7, certType: 'TB' });
    db.employee.findUnique.mockResolvedValue({ id: 7, name: 'Jane Doe' });
    const req = {
      params: { employeeId: '7' },
      body: { certType: 'TB', status: 'active' },
      user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
      file: null,
      db,
    };
    const r = res();

    await createCertification(req, r, jest.fn());

    expect(uploadFile).not.toHaveBeenCalled();
    expect(db.certificationUpload.create).not.toHaveBeenCalled();
  });
});

describe('listCertifications select', () => {
  test('includes attribution + renewal fields in the uploads select', async () => {
    const db = mockDb();
    db.employeeCertification.findMany.mockResolvedValue([]);
    const req = { params: { employeeId: '7' }, db };
    const r = res();
    await listCertifications(req, r, jest.fn());
    const arg = db.employeeCertification.findMany.mock.calls[0][0];
    const uploadSelect = arg.select.uploads.select;
    expect(uploadSelect).toMatchObject({
      uploadedByName: true, effectiveDate: true, expirationDate: true, submittedAt: true,
    });
  });
});
