jest.mock('../../../lib/prisma', () => ({
  shift: { findMany: jest.fn() },
  message: { findMany: jest.fn() },
  auditLog: { findMany: jest.fn() },
  employeeTask: { findMany: jest.fn() },
  timeOffRequest: { findMany: jest.fn() },
}));
const prisma = require('../../../lib/prisma');
const { getActivity } = require('../homeController');

function mockReqRes(emp = { id: 7 }) {
  const req = { employee: emp, user: { id: 11 } };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('getActivity (widened)', () => {
  test('returns mixed event types sorted desc, capped at 20', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, shiftDate: new Date('2026-06-20'), startTime: '09:00', endTime: '13:00', createdAt: new Date('2026-06-19'), updatedAt: new Date('2026-06-19'), client: { clientName: 'Jane' } },
      { id: 2, shiftDate: new Date('2026-06-22'), startTime: '09:00', endTime: '13:00', createdAt: new Date('2026-06-18'), updatedAt: new Date('2026-06-21'), client: { clientName: 'Bob' } },
    ]);
    prisma.message.findMany.mockResolvedValue([
      { id: 5, content: 'Hello', createdAt: new Date('2026-06-21'), senderRole: 'admin' },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 9, action: 'CREATE', entityType: 'CertificationUpload', entityName: 'CPR.pdf', createdAt: new Date('2026-06-20'), metadata: JSON.stringify({ employeeId: 7 }) },
    ]);
    prisma.employeeTask.findMany.mockResolvedValue([
      { id: 12, title: 'Sign handbook', createdAt: new Date('2026-06-19') },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([
      { id: 22, dateFrom: '2026-07-04', dateTo: '2026-07-06', status: 'approved', reviewedAt: new Date('2026-06-22') },
    ]);

    const { req, res } = mockReqRes();
    await getActivity(req, res);

    const out = res.json.mock.calls[0][0];
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);

    const types = new Set(out.map(x => x.type));
    expect(types.has('admin-message')).toBe(true);
    expect(types.has('cert-uploaded')).toBe(true);
    expect(types.has('task-assigned')).toBe(true);
    expect(types.has('time-off-decided')).toBe(true);

    const tsAsNumbers = out.map(x => new Date(x.timestamp).getTime());
    for (let i = 1; i < tsAsNumbers.length; i++) expect(tsAsNumbers[i-1]).toBeGreaterThanOrEqual(tsAsNumbers[i]);
  });

  test('scopes shift queries to the authenticated employee', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employeeTask.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes({ id: 42 });
    await getActivity(req, res);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: 42 }) }));
  });

  test('includes audit logs with no employeeId in metadata', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 10, action: 'CREATE', entityType: 'CertificationUpload', entityName: 'BG.pdf', createdAt: new Date('2026-06-20'), metadata: '{}' },
    ]);
    prisma.employeeTask.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getActivity(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('cert-uploaded');
  });
});
