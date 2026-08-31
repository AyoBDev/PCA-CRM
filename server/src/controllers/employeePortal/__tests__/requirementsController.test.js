jest.mock('../../../lib/prisma', () => ({
  employeeCertification: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  certificationUpload: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  employeeRequirement: { findMany: jest.fn() },
  certType: { findMany: jest.fn() },
  $transaction: jest.fn(async (ops) => Array.isArray(ops) ? Promise.all(ops.map(o => typeof o === 'function' ? o() : o)) : ops),
}));
jest.mock('../../../lib/storage', () => ({ uploadFile: jest.fn().mockResolvedValue(), downloadFile: jest.fn() }));
jest.mock('../../../services/storageService', () => ({ tenantKey: jest.fn((k) => k) }));
jest.mock('../../../services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../../../lib/prisma');
const { uploadFile, downloadFile } = require('../../../lib/storage');
const audit = require('../../../services/auditService');
const { createCertification } = require('../requirementsController');

function mockReqRes(file, body = {}) {
  const req = {
    employee: { id: 7, agencyId: 1 },
    user: { id: 11, name: 'Tester', role: 'pca', agencyId: 1 },
    db: prisma,
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

const { getCertifications } = require('../requirementsController');

describe('getCertifications (ledger-driven)', () => {
  test('returns one entry per certification requirement, joined to catalog + cert + uploads', async () => {
    prisma.employeeRequirement.findMany.mockResolvedValue([
      { id: 40, kind: 'certification', catalogTypeId: 1, status: 'submitted', reviewStatus: 'pending', certificationId: 90 },
    ]);
    prisma.certType.findMany.mockResolvedValue([
      { id: 1, key: 'cpr', label: 'CPR', requiresExpiry: true, renewalYears: 2 },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 90, certType: 'cpr', status: 'pending', expirationDate: null, fileName: 'cpr.pdf',
        uploads: [{ id: 500, fileName: 'cpr.pdf', fileType: 'application/pdf', fileSize: 10, submittedAt: new Date('2026-08-01') }] },
    ]);
    const res = mockReqRes().res;
    await getCertifications({ employee: { id: 7 }, db: prisma }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.certifications).toHaveLength(1);
    expect(payload.certifications[0]).toMatchObject({
      requirementId: 40, certificationId: 90, certType: 'cpr', label: 'CPR',
      requiresExpiry: true, renewalYears: 2, reviewStatus: 'pending',
      currentFile: { fileName: 'cpr.pdf' },
    });
    expect(payload.certifications[0].uploads).toHaveLength(1);
  });

  test('scopes cert + requirement queries to the calling employee', async () => {
    prisma.employeeRequirement.findMany.mockResolvedValue([]);
    prisma.certType.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    const res = mockReqRes().res;
    await getCertifications({ employee: { id: 7 }, db: prisma }, res);
    expect(prisma.employeeRequirement.findMany.mock.calls[0][0].where).toMatchObject({ employeeId: 7, kind: 'certification' });
    expect(prisma.employeeCertification.findMany.mock.calls[0][0].where).toMatchObject({ employeeId: 7 });
  });

  test('shows one card per ACTIVE catalog cert type, even without a requirement row (parity with admin)', async () => {
    // Employee has a requirement + cert for CPR only, but the catalog defines
    // three active renewable types. All three must appear so the employee app's
    // count matches the admin's full-catalog view.
    prisma.employeeRequirement.findMany.mockResolvedValue([
      { id: 40, kind: 'certification', catalogTypeId: 1, status: 'submitted', reviewStatus: 'approved', certificationId: 90 },
    ]);
    prisma.certType.findMany.mockResolvedValue([
      { id: 1, key: 'cpr', label: 'CPR', requiresExpiry: true, renewalYears: 2, active: true },
      { id: 2, key: 'tb_test', label: 'TB Test', requiresExpiry: true, renewalYears: 1, active: true },
      { id: 3, key: 'background_check', label: 'Background Check', requiresExpiry: true, renewalYears: 5, active: true },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 90, certType: 'cpr', status: 'active', expirationDate: null, fileName: 'cpr.pdf', uploads: [] },
    ]);
    const res = mockReqRes().res;
    await getCertifications({ employee: { id: 7 }, db: prisma }, res);

    const payload = res.json.mock.calls[0][0];
    const byType = Object.fromEntries(payload.certifications.map(c => [c.certType, c]));
    expect(Object.keys(byType).sort()).toEqual(['background_check', 'cpr', 'tb_test']);
    // The CPR one keeps its record; the others show as required with no file.
    expect(byType.cpr).toMatchObject({ certType: 'cpr', certificationId: 90, status: 'active' });
    expect(byType.tb_test).toMatchObject({ certType: 'tb_test', label: 'TB Test', status: 'required', certificationId: null });
    expect(byType.background_check).toMatchObject({ certType: 'background_check', status: 'required' });
    expect(payload.summary.total).toBe(3);
  });

  test('excludes inactive catalog cert types', async () => {
    prisma.employeeRequirement.findMany.mockResolvedValue([]);
    prisma.certType.findMany.mockResolvedValue([
      { id: 1, key: 'cpr', label: 'CPR', requiresExpiry: true, renewalYears: 2, active: true },
      { id: 9, key: 'retired', label: 'Retired', requiresExpiry: true, renewalYears: 1, active: false },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    const res = mockReqRes().res;
    await getCertifications({ employee: { id: 7 }, db: prisma }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.certifications.map(c => c.certType)).toEqual(['cpr']);
  });
});

const { downloadCertificationUpload } = require('../requirementsController');

describe('downloadCertificationUpload (employee-scoped)', () => {
  function res() {
    return { set: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  }
  test('404 when the upload is not the caller employee\'s', async () => {
    prisma.certificationUpload.findFirst.mockResolvedValue(null);
    const r = res();
    await downloadCertificationUpload({ employee: { id: 7 }, params: { uploadId: '500' }, db: prisma }, r);
    expect(r.status).toHaveBeenCalledWith(404);
    // and the scoping predicate reaches into the parent certification's employeeId
    expect(prisma.certificationUpload.findFirst.mock.calls[0][0].where.certification.employeeId).toBe(7);
  });

  test('streams the file on the happy path', async () => {
    prisma.certificationUpload.findFirst.mockResolvedValue({ id: 500, bucketKey: 'k', fileName: 'cpr.pdf', fileType: 'application/pdf' });
    downloadFile.mockResolvedValue(Buffer.from('pdf'));
    const r = res();
    await downloadCertificationUpload({ employee: { id: 7 }, params: { uploadId: '500' }, db: prisma }, r);
    expect(downloadFile).toHaveBeenCalledWith('k');
    expect(r.send).toHaveBeenCalled();
  });
});
