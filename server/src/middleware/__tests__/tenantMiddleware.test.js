jest.mock('../../lib/prisma', () => ({
  agency: { findUnique: jest.fn() },
}));
jest.mock('../../lib/tenantPrisma', () => ({
  tenantClient: jest.fn(() => ({ __tenantClient: true })),
}));

describe('tenantMiddleware', () => {
  let tenantMiddleware, prisma, tenantClient;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    prisma = require('../../lib/prisma');
    ({ tenantClient } = require('../../lib/tenantPrisma'));
    ({ tenantMiddleware } = require('../tenantMiddleware'));
    prisma.agency.findUnique.mockReset();
    tenantClient.mockClear();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  function run(req) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return tenantMiddleware(req, res, next).then(() => ({ req, res, next }));
  }

  test('dev/test: req.agency=null falls back to trusting the JWT agencyId', async () => {
    process.env.NODE_ENV = 'test';
    prisma.agency.findUnique.mockResolvedValue({ id: 5, status: 'active' });
    const { res, next } = await run({ user: { agencyId: 5 }, agency: null });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('production: req.agency=null is rejected with 401 even with a valid agencyId', async () => {
    process.env.NODE_ENV = 'production';
    const { res, next } = await run({ user: { agencyId: 5 }, agency: null });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.agency.findUnique).not.toHaveBeenCalled();
  });

  test('production: req.agency resolved and matching agencyId still works', async () => {
    process.env.NODE_ENV = 'production';
    const agency = { id: 5, status: 'active' };
    const { res, next } = await run({ user: { agencyId: 5 }, agency });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
