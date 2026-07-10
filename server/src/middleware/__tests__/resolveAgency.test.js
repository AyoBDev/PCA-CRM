jest.mock('../../lib/prisma', () => ({
  agency: { findUnique: jest.fn() },
}));

describe('resolveAgency', () => {
  let resolveAgency, clearAgencyCache, prisma;
  beforeEach(() => {
    jest.resetModules();
    process.env.BASE_DOMAIN = 'nvbestpca.com';
    prisma = require('../../lib/prisma');
    ({ resolveAgency, clearAgencyCache } = require('../resolveAgency'));
    clearAgencyCache();
    prisma.agency.findUnique.mockReset();
  });

  function run(hostname, path = '/api/clients') {
    const req = { hostname, path };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return resolveAgency(req, res, next).then(() => ({ req, res, next }));
  }

  test('subdomain resolves to agency', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 2, slug: 'acme', status: 'active' });
    const { req, next } = await run('acme.nvbestpca.com');
    expect(prisma.agency.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
    expect(req.agency).toMatchObject({ id: 2, slug: 'acme' });
    expect(next).toHaveBeenCalled();
  });

  test('apex domain sets req.agency = null', async () => {
    const { req, next } = await run('nvbestpca.com');
    expect(req.agency).toBeNull();
    expect(next).toHaveBeenCalled();
    expect(prisma.agency.findUnique).not.toHaveBeenCalled();
  });

  test('unknown subdomain on /api returns 404', async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    const { res, next } = await run('ghost.nvbestpca.com');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('unknown subdomain on non-API path passes through for the SPA', async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    const { req, next } = await run('ghost.nvbestpca.com', '/login');
    expect(req.agency).toBeNull();
    expect(req.agencyNotFound).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('lookup is cached (second call hits cache)', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 2, slug: 'acme', status: 'active' });
    await run('acme.nvbestpca.com');
    await run('acme.nvbestpca.com');
    expect(prisma.agency.findUnique).toHaveBeenCalledTimes(1);
  });

  test('nested subdomains are rejected', async () => {
    const { res } = await run('a.b.nvbestpca.com');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('loopback hosts are treated as apex (supertest default)', async () => {
    const a = await run('127.0.0.1');
    expect(a.req.agency).toBeNull();
    expect(a.next).toHaveBeenCalled();
    const b = await run('::1', '/api/clients');
    expect(b.req.agency).toBeNull();
    expect(b.next).toHaveBeenCalled();
    expect(prisma.agency.findUnique).not.toHaveBeenCalled();
  });
});
