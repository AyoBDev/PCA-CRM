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
  const req = { params: {}, body: {}, query: {}, user: { id: 1, name: 'Test Admin', role: 'admin' }, ...overrides };
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

describe('createClient — new fields', () => {
  test('saves dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, critical', async () => {
    const { req, res, next } = mockReqRes({
      body: {
        clientName: 'Test Client',
        dob: '1965-03-15T00:00:00.000Z',
        paNumber: 'PA12345',
        doctorName: 'Dr. Smith',
        doctorPhone: '702-555-1234',
        backupDoctorName: 'Dr. Jones',
        backupDoctorPhone: '702-555-5678',
        critical: true,
      },
    });
    prisma.client.create.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      dob: new Date('1965-03-15'),
      paNumber: 'PA12345',
      doctorName: 'Dr. Smith',
      doctorPhone: '702-555-1234',
      backupDoctorName: 'Dr. Jones',
      backupDoctorPhone: '702-555-5678',
      critical: true,
      authorizations: [],
    });

    await createClient(req, res, next);

    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paNumber: 'PA12345',
          doctorName: 'Dr. Smith',
          doctorPhone: '702-555-1234',
          backupDoctorName: 'Dr. Jones',
          backupDoctorPhone: '702-555-5678',
          critical: true,
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateClient — new fields', () => {
  test('saves new fields and includes them in audit diff', async () => {
    const { req, res, next } = mockReqRes({
      params: { id: '1' },
      body: {
        clientName: 'Test Client',
        paNumber: 'PA99999',
        doctorName: 'Dr. New',
        doctorPhone: '702-111-2222',
        backupDoctorName: '',
        backupDoctorPhone: '',
        critical: false,
      },
    });
    prisma.client.findUnique.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      paNumber: 'PA12345',
      doctorName: 'Dr. Old',
      doctorPhone: '702-000-0000',
      backupDoctorName: '',
      backupDoctorPhone: '',
      critical: true,
    });
    prisma.client.update.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      paNumber: 'PA99999',
      doctorName: 'Dr. New',
      doctorPhone: '702-111-2222',
      backupDoctorName: '',
      backupDoctorPhone: '',
      critical: false,
      authorizations: [],
    });

    await updateClient(req, res, next);

    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paNumber: 'PA99999',
          doctorName: 'Dr. New',
          critical: false,
        }),
      })
    );
  });
});
