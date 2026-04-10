jest.mock('../../lib/prisma', () => ({
  permanentLink: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require('../../lib/prisma');
const {
  createPermanentLink,
  listPermanentLinks,
  deletePermanentLink,
} = require('../permanentLinkController');

function mockReqRes(overrides = {}) {
  const req = { params: {}, body: {}, query: {}, ...overrides };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('createPermanentLink', () => {
  test('creates link and returns token URL', async () => {
    const { req, res, next } = mockReqRes({
      body: { clientId: 1, pcaName: 'Jane Doe' },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:4000'),
    });
    prisma.permanentLink.create = jest.fn().mockResolvedValue({
      id: 1,
      token: 'abc-123',
      clientId: 1,
      pcaName: 'Jane Doe',
      active: true,
      client: { clientName: 'John Client' },
    });

    await createPermanentLink(req, res, next);

    expect(prisma.permanentLink.create).toHaveBeenCalledWith({
      data: { clientId: 1, pcaName: 'Jane Doe' },
      include: { client: true },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'abc-123',
        url: 'http://localhost:4000/pca-form/abc-123',
      })
    );
  });

  test('returns 400 if clientId or pcaName missing', async () => {
    const { req, res, next } = mockReqRes({ body: { clientId: 1 } });

    await createPermanentLink(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 409 on duplicate', async () => {
    const { req, res, next } = mockReqRes({
      body: { clientId: 1, pcaName: 'Jane' },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:4000'),
    });
    prisma.permanentLink.create = jest.fn().mockRejectedValue({ code: 'P2002' });

    await createPermanentLink(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('listPermanentLinks', () => {
  test('returns all links with client info', async () => {
    const links = [
      { id: 1, token: 'abc', pcaName: 'Jane', active: true, client: { clientName: 'John' } },
    ];
    prisma.permanentLink.findMany = jest.fn().mockResolvedValue(links);
    const { req, res, next } = mockReqRes();

    await listPermanentLinks(req, res, next);

    expect(res.json).toHaveBeenCalledWith(links);
  });
});

describe('deletePermanentLink', () => {
  test('deactivates link', async () => {
    prisma.permanentLink.update = jest.fn().mockResolvedValue({ id: 1, active: false });
    const { req, res, next } = mockReqRes({ params: { id: '1' } });

    await deletePermanentLink(req, res, next);

    expect(prisma.permanentLink.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { active: false },
    });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
