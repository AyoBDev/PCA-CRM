jest.mock('../../services/complianceService', () => ({ approveCertRenewal: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn(() => []) }));
jest.mock('../../lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../../services/storageService', () => ({ tenantKey: (k) => k }));

const compliance = require('../../services/complianceService');
const { updateCertification } = require('../employeeCertController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

beforeEach(() => jest.clearAllMocks());

test('transition to approved calls approveCertRenewal', async () => {
  const old = { id: 10, employeeId: 7, certType: 'cpr', status: 'pending', expirationDate: new Date('2026-09-30') };
  const req = {
    params: { id: '10' },
    body: { status: 'approved', expirationDate: '2028-09-30' },
    user: { id: 3, name: 'HR Amy', role: 'admin' },
    db: { employeeCertification: { findUnique: jest.fn().mockResolvedValue(old) } },
  };
  compliance.approveCertRenewal.mockResolvedValue({ id: 10, status: 'active', currentVersionKey: '55' });
  const res = mockRes();
  await updateCertification(req, res, (e) => { throw e; });
  expect(compliance.approveCertRenewal).toHaveBeenCalledWith(10, expect.any(Date), req.user);
  expect(res.body).toEqual(expect.objectContaining({ status: 'active' }));
});

test('non-approval update does NOT call approveCertRenewal', async () => {
  const old = { id: 10, employeeId: 7, certType: 'cpr', status: 'active', expirationDate: new Date('2026-09-30') };
  const req = {
    params: { id: '10' },
    body: { notes: 'just a note' },
    user: { id: 3, name: 'HR Amy', role: 'admin' },
    db: { employeeCertification: {
      findUnique: jest.fn().mockResolvedValue(old),
      update: jest.fn().mockResolvedValue({ ...old, notes: 'just a note' }),
    } },
  };
  const res = mockRes();
  await updateCertification(req, res, (e) => { throw e; });
  expect(compliance.approveCertRenewal).not.toHaveBeenCalled();
  expect(req.db.employeeCertification.update).toHaveBeenCalled();
});
