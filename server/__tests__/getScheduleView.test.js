// Regression test for the "shared schedule PDF shows the wrong Client ID" bug.
//
// The scheduling board and Client Profile read the Sandata Client ID from the
// client's Authorization (the source of truth). The public /schedule/view link
// used to render `shift.sandataClientId` — a stale copy stored on the shift row
// at creation time — so a wrong value typed onto one shift leaked into the
// shared PDF while the profile still looked correct. The PCA then clocked in
// under the wrong Sandata ID and the client's hours never posted.
//
// The shared view must resolve the Sandata Client ID LIVE from the client's
// authorization for the shift's service code, ignoring the shift's stored copy.

jest.mock('../src/lib/prisma', () => ({
  employeeScheduleLink: { findUnique: jest.fn() },
  shift: { findMany: jest.fn() },
  authorization: { findMany: jest.fn() },
  timesheet: { findMany: jest.fn() },
}));

const prisma = require('../src/lib/prisma');
const controller = require('../src/controllers/employeeScheduleLinkController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.timesheet.findMany.mockResolvedValue([]);
});

describe('getScheduleView — Sandata Client ID resolution', () => {
  test('renders the authorization Sandata ID, not the stale value on the shift', async () => {
    prisma.employeeScheduleLink.findUnique.mockResolvedValue({
      token: 'tok', active: true, employeeId: 7,
      employee: { id: 7, name: 'Maria PCA' },
    });
    // Heidi's shift carries JAVIER's Sandata ID as a stale copy.
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 1, employeeId: 7, clientId: 42, serviceCode: 'PCS',
        shiftDate: new Date('2026-08-10T00:00:00.000Z'),
        startTime: '09:00', endTime: '13:00', status: 'scheduled',
        sandataClientId: 'JAVIER-999', // stale/wrong
        client: { clientName: 'Heidi Martinez', address: '', phone: '', gateCode: '', notes: '' },
      },
    ]);
    // Heidi's live authorization for PCS holds the CORRECT Sandata ID.
    prisma.authorization.findMany.mockResolvedValue([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI-123', manualStatus: 'active', archivedAt: null,
        authorizationStartDate: new Date('2026-01-01'), authorizationEndDate: new Date('2026-12-31') },
    ]);

    const res = mockRes();
    await controller.getScheduleView({ params: { token: 'tok' }, query: { weekStart: '2026-08-10' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].sandataClientId).toBe('HEIDI-123');
  });

  test('matches the authorization by the shift service code (per-code IDs)', async () => {
    prisma.employeeScheduleLink.findUnique.mockResolvedValue({
      token: 'tok', active: true, employeeId: 7,
      employee: { id: 7, name: 'Maria PCA' },
    });
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 2, employeeId: 7, clientId: 42, serviceCode: 'S5130',
        shiftDate: new Date('2026-08-11T00:00:00.000Z'),
        startTime: '09:00', endTime: '11:00', status: 'scheduled',
        sandataClientId: 'STALE',
        client: { clientName: 'Heidi Martinez', address: '', phone: '', gateCode: '', notes: '' },
      },
    ]);
    prisma.authorization.findMany.mockResolvedValue([
      { clientId: 42, serviceCode: 'PCS', sandataClientId: 'PCS-ID', manualStatus: 'active', archivedAt: null,
        authorizationStartDate: new Date('2026-01-01'), authorizationEndDate: new Date('2026-12-31') },
      { clientId: 42, serviceCode: 'S5130', sandataClientId: 'HM-ID', manualStatus: 'active', archivedAt: null,
        authorizationStartDate: new Date('2026-01-01'), authorizationEndDate: new Date('2026-12-31') },
    ]);

    const res = mockRes();
    await controller.getScheduleView({ params: { token: 'tok' }, query: { weekStart: '2026-08-10' } }, res);

    expect(res.body.shifts[0].sandataClientId).toBe('HM-ID');
  });

  test('falls back to the stored shift value when no matching authorization has an ID', async () => {
    prisma.employeeScheduleLink.findUnique.mockResolvedValue({
      token: 'tok', active: true, employeeId: 7,
      employee: { id: 7, name: 'Maria PCA' },
    });
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 3, employeeId: 7, clientId: 42, serviceCode: 'S5150',
        shiftDate: new Date('2026-08-12T00:00:00.000Z'),
        startTime: '09:00', endTime: '11:00', status: 'scheduled',
        sandataClientId: 'ONLY-ON-SHIFT',
        client: { clientName: 'Heidi Martinez', address: '', phone: '', gateCode: '', notes: '' },
      },
    ]);
    // No auth for S5150 (or it has a blank Sandata ID).
    prisma.authorization.findMany.mockResolvedValue([
      { clientId: 42, serviceCode: 'S5150', sandataClientId: '', manualStatus: 'active', archivedAt: null,
        authorizationStartDate: new Date('2026-01-01'), authorizationEndDate: new Date('2026-12-31') },
    ]);

    const res = mockRes();
    await controller.getScheduleView({ params: { token: 'tok' }, query: { weekStart: '2026-08-10' } }, res);

    expect(res.body.shifts[0].sandataClientId).toBe('ONLY-ON-SHIFT');
  });
});
