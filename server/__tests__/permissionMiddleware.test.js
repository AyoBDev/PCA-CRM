const { requirePermission } = require('../src/middleware/permissionMiddleware');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requirePermission', () => {
  const mw = requirePermission('files');

  test('admin always allowed', () => {
    const req = { user: { role: 'admin', id: 1 } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('pca allowed (permission system does not restrict PCAs)', () => {
    const req = { user: { role: 'pca', id: 2 } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('user with null permissionGroupId allowed (legacy default)', () => {
    const req = { user: { role: 'user', id: 3, permissionGroupId: null, permissions: [] } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('user with group containing permission allowed', () => {
    const req = { user: { role: 'user', id: 4, permissionGroupId: 1, permissions: ['files', 'payroll'] } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('user with group missing permission denied', () => {
    const req = { user: { role: 'user', id: 5, permissionGroupId: 1, permissions: ['payroll'] } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ missingPermission: 'files' }));
  });

  test('unauthenticated returns 401', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('unknown role denied', () => {
    const req = { user: { role: 'visitor', id: 6 } };
    const res = mockRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
