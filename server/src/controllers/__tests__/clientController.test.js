jest.mock('../../lib/prisma', () => ({
  client: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('../../services/authorizationService', () => ({
  enrichClient: (c) => c,
}));

const prisma = require('../../lib/prisma');
const { createClient, updateClient } = require('../clientController');

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

describe('createClient', () => {
  test('saves enabledServices when provided', async () => {
    const { req, res, next } = mockReqRes({
      body: {
        clientName: 'Test Client',
        enabledServices: '["PAS","Respite"]',
      },
    });
    prisma.client.create.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      enabledServices: '["PAS","Respite"]',
      authorizations: [],
    });

    await createClient(req, res, next);

    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledServices: '["PAS","Respite"]',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('defaults enabledServices when not provided', async () => {
    const { req, res, next } = mockReqRes({
      body: { clientName: 'Test Client' },
    });
    prisma.client.create.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      enabledServices: '["PAS","Homemaker"]',
      authorizations: [],
    });

    await createClient(req, res, next);

    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledServices: '["PAS","Homemaker"]',
        }),
      })
    );
  });
});

describe('updateClient', () => {
  test('updates enabledServices', async () => {
    const { req, res, next } = mockReqRes({
      params: { id: '1' },
      body: {
        clientName: 'Test Client',
        enabledServices: '["PAS","Homemaker","Respite"]',
      },
    });
    prisma.client.update.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      enabledServices: '["PAS","Homemaker","Respite"]',
      authorizations: [],
    });

    await updateClient(req, res, next);

    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledServices: '["PAS","Homemaker","Respite"]',
        }),
      })
    );
  });
});
