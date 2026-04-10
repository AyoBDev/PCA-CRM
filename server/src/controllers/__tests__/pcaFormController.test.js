jest.mock('../../lib/prisma', () => ({
  permanentLink: {
    findUnique: jest.fn(),
  },
  timesheet: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  timesheetEntry: {
    update: jest.fn(),
  },
}));

const prisma = require('../../lib/prisma');
const { getPcaForm, updatePcaForm } = require('../pcaFormController');

function mockReqRes(overrides = {}) {
  const req = { params: {}, body: {}, query: {}, ...overrides };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

const activeLink = {
  id: 1,
  token: 'test-token',
  clientId: 10,
  pcaName: 'Jane Doe',
  active: true,
  client: {
    id: 10,
    clientName: 'John Client',
    enabledServices: '["PAS","Homemaker","Respite"]',
  },
};

const sampleTimesheet = {
  id: 100,
  clientId: 10,
  pcaName: 'Jane Doe',
  status: 'draft',
  entries: [
    { id: 1, dayOfWeek: 0, dateOfService: '2026-04-05' },
    { id: 2, dayOfWeek: 1, dateOfService: '2026-04-06' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────────
// getPcaForm
// ────────────────────────────────────────────────────────────────────────────────

describe('getPcaForm', () => {
  test('returns 404 for invalid token', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { token: 'bad-token' } });

    await getPcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid link' });
  });

  test('returns 403 for deactivated link', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue({ ...activeLink, active: false });
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'This link has been deactivated' });
  });

  test('returns existing draft timesheet', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    expect(prisma.timesheet.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pcaName: 'Jane Doe',
        timesheet: sampleTimesheet,
        client: expect.objectContaining({ clientName: 'John Client' }),
      })
    );
  });

  test('auto-creates timesheet if none exists for current week', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(null);
    prisma.timesheet.create.mockResolvedValue(sampleTimesheet);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    expect(prisma.timesheet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: activeLink.clientId,
          pcaName: activeLink.pcaName,
          entries: expect.objectContaining({ create: expect.any(Array) }),
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ timesheet: sampleTimesheet })
    );
  });

  test('created timesheet has 7 entries', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(null);
    prisma.timesheet.create.mockResolvedValue(sampleTimesheet);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    const createCall = prisma.timesheet.create.mock.calls[0][0];
    expect(createCall.data.entries.create).toHaveLength(7);
    expect(createCall.data.entries.create[0].dayOfWeek).toBe(0);
    expect(createCall.data.entries.create[6].dayOfWeek).toBe(6);
  });

  test('returns parsed enabledServices in client object', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    const call = res.json.mock.calls[0][0];
    expect(call.client.enabledServices).toEqual(['PAS', 'Homemaker', 'Respite']);
  });

  test('calls next with error on unexpected exception', async () => {
    const err = new Error('DB error');
    prisma.permanentLink.findUnique.mockRejectedValue(err);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// updatePcaForm — save mode
// ────────────────────────────────────────────────────────────────────────────────

describe('updatePcaForm save', () => {
  const updatedTimesheet = { ...sampleTimesheet, totalPasHours: 2 };

  beforeEach(() => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);
    prisma.timesheetEntry.update.mockResolvedValue({});
    prisma.timesheet.update.mockResolvedValue({});
    prisma.timesheet.findUnique.mockResolvedValue(updatedTimesheet);
  });

  test('saves entries without validation and returns updated timesheet', async () => {
    const entries = [
      {
        id: 1,
        dayOfWeek: 0,
        adlActivities: '{"bathing":true}',
        adlTimeIn: '08:00',
        adlTimeOut: '10:00',
        adlPcaInitials: 'JD',
        adlClientInitials: 'JC',
        iadlActivities: '{}',
        iadlTimeIn: null,
        iadlTimeOut: null,
        iadlPcaInitials: '',
        iadlClientInitials: '',
        respiteActivities: '{}',
        respiteTimeIn: null,
        respiteTimeOut: null,
        respitePcaInitials: '',
        respiteClientInitials: '',
      },
    ];

    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries },
    });

    await updatePcaForm(req, res, next);

    expect(prisma.timesheetEntry.update).toHaveBeenCalledTimes(1);
    expect(prisma.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleTimesheet.id },
        data: expect.not.objectContaining({ status: 'submitted' }),
      })
    );
    expect(res.json).toHaveBeenCalledWith({ timesheet: updatedTimesheet });
  });

  test('returns 404 when no timesheet found for current week', async () => {
    prisma.timesheet.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [] },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'No timesheet found for current week' });
  });

  test('returns 400 when timesheet already submitted', async () => {
    prisma.timesheet.findFirst.mockResolvedValue({ ...sampleTimesheet, status: 'submitted' });
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [] },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Timesheet already submitted' });
  });

  test('skips entries without an id', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [{ dayOfWeek: 0 /* no id */ }] },
    });

    await updatePcaForm(req, res, next);

    expect(prisma.timesheetEntry.update).not.toHaveBeenCalled();
  });

  test('returns 404 for invalid token', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({
      params: { token: 'bad' },
      body: { action: 'save', entries: [] },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 403 for deactivated link', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue({ ...activeLink, active: false });
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [] },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// updatePcaForm — submit mode
// ────────────────────────────────────────────────────────────────────────────────

describe('updatePcaForm submit', () => {
  const validSignatures = {
    pcaFullName: 'Jane Doe',
    pcaSignature: 'data:image/png;base64,abc',
    recipientName: 'John Client',
    recipientSignature: 'data:image/png;base64,xyz',
  };

  const updatedTimesheet = { ...sampleTimesheet, status: 'submitted' };

  beforeEach(() => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);
    prisma.timesheetEntry.update.mockResolvedValue({});
    prisma.timesheet.update.mockResolvedValue({});
    prisma.timesheet.findUnique.mockResolvedValue(updatedTimesheet);
  });

  test('rejects submission when signatures are missing', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [],
        pcaFullName: 'Jane Doe',
        // missing pcaSignature, recipientName, recipientSignature
      },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'All signatures and names are required' });
  });

  test('rejects when ADL has activities but missing time', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 0,
            adlActivities: '{"bathing":true}',
            adlTimeIn: null,
            adlTimeOut: null,
            adlPcaInitials: 'JD',
            adlClientInitials: 'JC',
            iadlActivities: '{}',
            iadlTimeIn: null,
            iadlTimeOut: null,
            iadlPcaInitials: '',
            iadlClientInitials: '',
            respiteActivities: '{}',
            respiteTimeIn: null,
            respiteTimeOut: null,
            respitePcaInitials: '',
            respiteClientInitials: '',
          },
        ],
        ...validSignatures,
      },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const errorMsg = res.json.mock.calls[0][0].error;
    expect(errorMsg).toContain('ADL has activities but missing time in/out');
  });

  test('rejects when ADL has activities but missing initials', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 1,
            adlActivities: '{"bathing":true}',
            adlTimeIn: '08:00',
            adlTimeOut: '10:00',
            adlPcaInitials: '',
            adlClientInitials: '',
            iadlActivities: '{}',
            iadlTimeIn: null,
            iadlTimeOut: null,
            iadlPcaInitials: '',
            iadlClientInitials: '',
            respiteActivities: '{}',
            respiteTimeIn: null,
            respiteTimeOut: null,
            respitePcaInitials: '',
            respiteClientInitials: '',
          },
        ],
        ...validSignatures,
      },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const errorMsg = res.json.mock.calls[0][0].error;
    expect(errorMsg).toContain('ADL missing initials');
  });

  test('rejects overlapping Homemaker and Respite times', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 2,
            adlActivities: '{}',
            adlTimeIn: null,
            adlTimeOut: null,
            adlPcaInitials: '',
            adlClientInitials: '',
            // Homemaker 09:00–11:00
            iadlActivities: '{"cooking":true}',
            iadlTimeIn: '09:00',
            iadlTimeOut: '11:00',
            iadlPcaInitials: 'JD',
            iadlClientInitials: 'JC',
            // Respite 10:00–12:00 — overlaps with Homemaker
            respiteActivities: '{"companionship":true}',
            respiteTimeIn: '10:00',
            respiteTimeOut: '12:00',
            respitePcaInitials: 'JD',
            respiteClientInitials: 'JC',
          },
        ],
        ...validSignatures,
      },
    });

    await updatePcaForm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const errorMsg = res.json.mock.calls[0][0].error;
    expect(errorMsg).toContain('Homemaker and Respite times overlap');
  });

  test('accepts valid submit with no activities and saves with submitted status', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 0,
            adlActivities: '{}',
            adlTimeIn: null,
            adlTimeOut: null,
            adlPcaInitials: '',
            adlClientInitials: '',
            iadlActivities: '{}',
            iadlTimeIn: null,
            iadlTimeOut: null,
            iadlPcaInitials: '',
            iadlClientInitials: '',
            respiteActivities: '{}',
            respiteTimeIn: null,
            respiteTimeOut: null,
            respitePcaInitials: '',
            respiteClientInitials: '',
          },
        ],
        ...validSignatures,
      },
    });

    await updatePcaForm(req, res, next);

    expect(prisma.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'submitted',
          pcaFullName: validSignatures.pcaFullName,
          pcaSignature: validSignatures.pcaSignature,
          recipientName: validSignatures.recipientName,
          recipientSignature: validSignatures.recipientSignature,
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith({ timesheet: updatedTimesheet });
  });

  test('filters out disabled services before validation — Homemaker/Respite overlap ignored when Respite not enabled', async () => {
    // Link with only PAS + Homemaker (no Respite)
    const linkNoRespite = {
      ...activeLink,
      client: {
        ...activeLink.client,
        enabledServices: '["PAS","Homemaker"]',
      },
    };
    prisma.permanentLink.findUnique.mockResolvedValue(linkNoRespite);

    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 0,
            adlActivities: '{}',
            adlTimeIn: null,
            adlTimeOut: null,
            adlPcaInitials: '',
            adlClientInitials: '',
            iadlActivities: '{}',
            iadlTimeIn: null,
            iadlTimeOut: null,
            iadlPcaInitials: '',
            iadlClientInitials: '',
            // Even though respite data is present it should be stripped
            respiteActivities: '{"companionship":true}',
            respiteTimeIn: '10:00',
            respiteTimeOut: '12:00',
            respitePcaInitials: 'JD',
            respiteClientInitials: 'JC',
          },
        ],
        ...validSignatures,
      },
    });

    await updatePcaForm(req, res, next);

    // Should NOT reject — Respite is filtered out
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ timesheet: updatedTimesheet });
  });
});
