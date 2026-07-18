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
  authorization: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  service: {
    findMany: jest.fn().mockResolvedValue([]),
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

// Default authorization set matching activeLink.client.enabledServices
// (PAS + Homemaker + Respite). Sections are only exposed to the caregiver when
// backed by an active authorization, so tests that exercise those sections need
// the matching auths present. Individual tests override this as needed.
const defaultAuths = [
  { serviceCode: 'PCS', serviceName: 'Personal Care Services', serviceCategory: 'PAS', authorizedUnits: 400, authorizationStartDate: null, authorizationEndDate: null, manualStatus: 'active', archivedAt: null },
  { serviceCode: 'S5130', serviceName: 'Homemaker', serviceCategory: 'Homemaker', authorizedUnits: 400, authorizationStartDate: null, authorizationEndDate: null, manualStatus: 'active', archivedAt: null },
  { serviceCode: 'S5150', serviceName: 'Respite', serviceCategory: 'Respite', authorizedUnits: 400, authorizationStartDate: null, authorizationEndDate: null, manualStatus: 'active', archivedAt: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.authorization.findMany.mockResolvedValue(defaultAuths);
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

  test('returns placeholder entries if no timesheet exists for current week', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(activeLink);
    prisma.timesheet.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });

    await getPcaForm(req, res, next);

    // getPcaForm no longer auto-creates — it returns placeholder entries
    expect(prisma.timesheet.create).not.toHaveBeenCalled();
    const call = res.json.mock.calls[0][0];
    expect(call.timesheet.id).toBeNull();
    expect(call.timesheet.entries).toHaveLength(7);
    expect(call.timesheet.entries[0].dayOfWeek).toBe(0);
    expect(call.timesheet.entries[6].dayOfWeek).toBe(6);
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
    const call = res.json.mock.calls[0][0];
    expect(call.timesheet).toEqual(updatedTimesheet);
    expect(call.client).toBeDefined();
    expect(call.pcaName).toBe('Jane Doe');
    expect(call.authLimits).toBeDefined();
  });

  test('auto-creates timesheet when none exists for current week', async () => {
    prisma.timesheet.findFirst.mockResolvedValue(null);
    prisma.timesheet.create.mockResolvedValue(sampleTimesheet);
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [] },
    });

    await updatePcaForm(req, res, next);

    expect(prisma.timesheet.create).toHaveBeenCalled();
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

  test('maps entries by dayOfWeek when no id provided', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: { action: 'save', entries: [{ dayOfWeek: 0 /* no id — matched by dayOfWeek */ }] },
    });

    await updatePcaForm(req, res, next);

    // Entry with dayOfWeek: 0 matches dbEntry id: 1 from sampleTimesheet
    expect(prisma.timesheetEntry.update).toHaveBeenCalledTimes(1);
    expect(prisma.timesheetEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
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

  test('rejects submit when no service tasks are selected', async () => {
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

    // The hasAnyTask guard blocks a submit with no activities selected.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.timesheet.update).not.toHaveBeenCalled();
  });

  test('accepts a valid submit with at least one task and saves with submitted status', async () => {
    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'submit',
        entries: [
          {
            id: 1,
            dayOfWeek: 0,
            adlActivities: '{"bathing":true}',
            adlTimeIn: '09:00',
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
    const call = res.json.mock.calls[0][0];
    expect(call.timesheet).toEqual(updatedTimesheet);
    expect(call.client).toBeDefined();
    expect(call.authLimits).toBeDefined();
  });

  test('preserves hours on DRAFT SAVE for an admin-enabled section even without a matching authorization', async () => {
    // Client's stored enabledServices lists Homemaker, but the client has ONLY a
    // PAS authorization for this week. On a draft SAVE, the caregiver's Homemaker
    // hours must be PRESERVED (not silently stripped) — authorization is enforced
    // at SUBMIT time, not by discarding hours on save.
    prisma.permanentLink.findUnique.mockResolvedValue({
      ...activeLink,
      client: { ...activeLink.client, enabledServices: '["PAS","Homemaker"]' },
    });
    prisma.authorization.findMany.mockResolvedValue([
      {
        serviceCode: 'PCS',
        serviceName: 'Personal Care Services',
        serviceCategory: 'PAS',
        authorizedUnits: 400,
        authorizationStartDate: null,
        authorizationEndDate: null,
        manualStatus: 'active',
        archivedAt: null,
      },
    ]);

    const { req, res, next } = mockReqRes({
      params: { token: 'test-token' },
      body: {
        action: 'save',
        entries: [
          {
            id: 1,
            dayOfWeek: 0,
            adlActivities: '{"Bathing":true}',
            adlTimeIn: '08:00',
            adlTimeOut: '10:00',
            adlPcaInitials: 'JD',
            adlClientInitials: 'JC',
            // Homemaker hours entered even though there is no HM authorization
            iadlActivities: '{"Laundry":true}',
            iadlTimeIn: '10:00',
            iadlTimeOut: '12:00',
            iadlPcaInitials: 'JD',
            iadlClientInitials: 'JC',
            respiteActivities: '{}',
            respiteTimeIn: null,
            respiteTimeOut: null,
            respitePcaInitials: '',
            respiteClientInitials: '',
          },
        ],
      },
    });

    await updatePcaForm(req, res, next);

    // Homemaker (iadl) hours are PRESERVED on save — the section is admin-enabled.
    expect(prisma.timesheetEntry.update).toHaveBeenCalledTimes(1);
    const saved = prisma.timesheetEntry.update.mock.calls[0][0].data;
    expect(saved.iadlActivities).toBe('{"Laundry":true}');
    expect(saved.iadlTimeIn).toBe('10:00');
    expect(saved.iadlTimeOut).toBe('12:00');
    expect(saved.iadlHours).toBeGreaterThan(0);
    // PAS (adl) is authorized — must be preserved.
    expect(saved.adlActivities).toBe('{"Bathing":true}');
    expect(saved.adlTimeIn).toBe('08:00');
  });

  test('GET exposes all admin-enabled sections and reports per-section auth status (Homemaker not authorized → state none)', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue({
      ...activeLink,
      client: { ...activeLink.client, enabledServices: '["PAS","Homemaker"]' },
    });
    prisma.authorization.findMany.mockResolvedValue([
      {
        serviceCode: 'PCS',
        serviceName: 'Personal Care Services',
        serviceCategory: 'PAS',
        authorizedUnits: 400,
        authorizationStartDate: null,
        authorizationEndDate: null,
        manualStatus: 'active',
        archivedAt: null,
      },
    ]);
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);

    const { req, res, next } = mockReqRes({ params: { token: 'test-token' } });
    await getPcaForm(req, res, next);

    const call = res.json.mock.calls[0][0];
    // Both admin-enabled sections are exposed so the caregiver can enter hours.
    expect(call.client.enabledServices).toContain('PAS');
    expect(call.client.enabledServices).toContain('Homemaker');
    // But the per-section authorization status reflects reality.
    expect(call.client.authStatus.bySection.PAS.state).toBe('ok');
    expect(call.client.authStatus.bySection.Homemaker.state).toBe('none');
    expect(call.client.authStatus.state).toBe('none');
    expect(call.client.authorizationRequired).toBe(true);
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
            // An enabled (PAS/ADL) task satisfies the hasAnyTask guard.
            adlActivities: '{"bathing":true}',
            adlTimeIn: '09:00',
            adlTimeOut: '10:00',
            adlPcaInitials: 'JD',
            adlClientInitials: 'JC',
            iadlActivities: '{}',
            iadlTimeIn: null,
            iadlTimeOut: null,
            iadlPcaInitials: '',
            iadlClientInitials: '',
            // Even though respite data is present it should be stripped
            // (Respite is not in enabledServices), so it must not cause a 400.
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
    const call = res.json.mock.calls[0][0];
    expect(call.timesheet).toEqual(updatedTimesheet);
    expect(call.client).toBeDefined();
  });
});

describe('updatePcaForm submit — authorization gate state machine', () => {
  const validSignatures = {
    pcaFullName: 'Jane Doe',
    pcaSignature: 'data:image/png;base64,abc',
    recipientName: 'John Client',
    recipientSignature: 'data:image/png;base64,xyz',
  };
  const updatedTimesheet = { ...sampleTimesheet, status: 'submitted' };

  // A single day with 2 hours of PAS (ADL) work = 8 units.
  const pasEntry = {
    id: 1, dayOfWeek: 0,
    adlActivities: '{"bathing":true}', adlTimeIn: '08:00', adlTimeOut: '10:00',
    adlPcaInitials: 'JD', adlClientInitials: 'JC', adlTimeBlocks: '[]',
    iadlActivities: '{}', respiteActivities: '{}', companionActivities: '{}',
  };
  const submitBody = { action: 'submit', entries: [pasEntry], ...validSignatures };

  function linkWithClient(clientOverrides = {}) {
    return { ...activeLink, client: { ...activeLink.client, enabledServices: '["PAS","Homemaker"]', authorizationRequired: true, ...clientOverrides } };
  }
  function pasAuth(overrides = {}) {
    return {
      serviceCode: 'PCS', serviceName: 'Personal Care Services', serviceCategory: 'PAS',
      authorizedUnits: 400, authorizationStartDate: null, authorizationEndDate: null,
      manualStatus: 'active', archivedAt: null, authorizationType: 'Weekly Units',
      authorizedHoursPerYear: null, hoursPerVisit: null, usedHoursYtd: 0, ...overrides,
    };
  }

  beforeEach(() => {
    prisma.timesheet.findFirst.mockResolvedValue(sampleTimesheet);
    prisma.timesheetEntry.update.mockResolvedValue({});
    prisma.timesheet.update.mockResolvedValue({});
    prisma.timesheet.findUnique.mockResolvedValue(updatedTimesheet);
  });

  test('#1 valid auth within weekly units → allowed', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient());
    prisma.authorization.findMany.mockResolvedValue([pasAuth({ authorizedUnits: 400 })]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test('#2 no auth on file → blocked "No active PAS authorization found"', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient());
    prisma.authorization.findMany.mockResolvedValue([]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/No active PAS authorization found/);
  });

  test('#3 expired auth → blocked with expired message and date', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient());
    prisma.authorization.findMany.mockResolvedValue([pasAuth({ authorizationStartDate: '2019-01-01', authorizationEndDate: '2020-01-01' })]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/authorization expired on/i);
  });

  test('#5 hours exceed weekly units → blocked exceeds message', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient());
    // Only 4 units authorized (1 hour) but 2 hours (8 units) submitted.
    prisma.authorization.findMany.mockResolvedValue([pasAuth({ authorizedUnits: 4 })]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/exceed this client's remaining authorized units/);
  });

  test('#7 authorizationRequired=false (Private Pay) → allowed with no auth on file', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient({ authorizationRequired: false }));
    prisma.authorization.findMany.mockResolvedValue([]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test('#9 authorizationRequired=false but missing clock-out → still blocked by baseline', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient({ authorizationRequired: false }));
    prisma.authorization.findMany.mockResolvedValue([]);
    const badEntry = { ...pasEntry, adlTimeOut: null };
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: { ...submitBody, entries: [badEntry] } });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/missing time in\/out/);
  });

  test('#11 active override on a required client → allowed even with no auth', async () => {
    const future = new Date(Date.now() + 30 * 864e5);
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient({ overrideActive: true, overrideExpiresOn: future }));
    prisma.authorization.findMany.mockResolvedValue([]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test('#12 expired override → reverts to enforcement (blocked)', async () => {
    prisma.permanentLink.findUnique.mockResolvedValue(linkWithClient({ overrideActive: true, overrideExpiresOn: new Date('2020-01-01') }));
    prisma.authorization.findMany.mockResolvedValue([]);
    const { req, res } = mockReqRes({ params: { token: 'test-token' }, body: submitBody });
    await updatePcaForm(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/No active PAS authorization found/);
  });
});
