jest.mock('../../lib/prisma', () => ({}));
jest.mock('../../../prisma/seedAgencyDefaults', () => ({ seedAgencyDefaults: jest.fn() }));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: jest.fn() }));
jest.mock('../../lib/tenantContext', () => ({ runWithTenant: (ctx, fn) => fn() }));

const { hostInfo } = require('../platformController');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('hostInfo', () => {
  test('platform host (req.isPlatformHost) returns type platform', () => {
    const req = { isPlatformHost: true, agency: null };
    const res = mockRes();
    hostInfo(req, res);
    expect(res.json).toHaveBeenCalledWith({ type: 'platform' });
  });

  test('agency host (req.agency set) returns type agency with name/slug', () => {
    const req = { isPlatformHost: false, agency: { name: 'Acme Care', slug: 'acme' } };
    const res = mockRes();
    hostInfo(req, res);
    expect(res.json).toHaveBeenCalledWith({ type: 'agency', agency: { name: 'Acme Care', slug: 'acme' } });
  });

  test('neither flag set (production apex) returns type landing', () => {
    const req = { isPlatformHost: false, agency: null };
    const res = mockRes();
    hostInfo(req, res);
    expect(res.json).toHaveBeenCalledWith({ type: 'landing' });
  });
});
