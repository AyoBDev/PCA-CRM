jest.mock('../../lib/prisma', () => ({
  employeeCertification: { count: jest.fn(), findMany: jest.fn() },
  timeOffRequest: { count: jest.fn(), findMany: jest.fn() },
  availabilityRequest: { count: jest.fn(), findMany: jest.fn() },
  auditLog: { findMany: jest.fn() },
  adminEventSeen: { findMany: jest.fn(), upsert: jest.fn() },
  employee: { findMany: jest.fn() },
}));
const prisma = require('../../lib/prisma');
const { getEmployeeAttention } = require('../adminEmployeeAttentionController');

function mockReqRes(user = { id: 11, name: 'Admin', role: 'admin' }) {
  const req = { user };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('getEmployeeAttention', () => {
  test('returns zeroed counts when nothing pending', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      counts: { certsPendingReview: 0, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 },
      recentEvents: [],
    }));
  });

  test('returns nonzero counts for each event type', async () => {
    prisma.employeeCertification.count.mockResolvedValue(3);
    prisma.timeOffRequest.count.mockResolvedValue(1);
    prisma.availabilityRequest.count.mockResolvedValue(2);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane Doe', createdAt: new Date('2026-06-26') },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      { id: 7, userId: 50, name: 'Jane Doe' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts).toEqual({ certsPendingReview: 3, timeOffPending: 1, availabilityPending: 2, profileChangesUnseen: 1 });
  });

  test('profile-change qualification requires userRole=pca AND auditUser.id === employee.userId', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      // qualifying: pca user editing themselves
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      // non-qualifying: admin editing employee 7
      { id: 101, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 11, userRole: 'admin', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      // non-qualifying: pca but not the employee's own user
      { id: 102, entityId: 8, entityType: 'Employee', action: 'UPDATE', userId: 99, userRole: 'pca', entityName: 'Bob', createdAt: new Date('2026-06-26') },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      { id: 7, userId: 50, name: 'Jane Doe' },
      { id: 8, userId: 60, name: 'Bob Smith' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.profileChangesUnseen).toBe(1);
  });

  test('subtracts already-seen profile-change rows for this admin', async () => {
    prisma.employeeCertification.count.mockResolvedValue(0);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 100, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-26') },
      { id: 101, entityId: 7, entityType: 'Employee', action: 'UPDATE', userId: 50, userRole: 'pca', entityName: 'Jane', createdAt: new Date('2026-06-25') },
    ]);
    prisma.employee.findMany.mockResolvedValue([{ id: 7, userId: 50, name: 'Jane Doe' }]);
    prisma.adminEventSeen.findMany.mockResolvedValue([
      { id: 1, userId: 11, eventKey: 'profile-change:100' },
    ]);
    prisma.employeeCertification.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.profileChangesUnseen).toBe(1); // 2 qualifying minus 1 seen
  });

  test('recentEvents excludes events this admin has marked seen', async () => {
    prisma.employeeCertification.count.mockResolvedValue(1);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([
      { id: 1, userId: 11, eventKey: 'cert-pending:42' },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 42, certType: 'CPR', employeeId: 7, updatedAt: new Date(), employee: { name: 'Jane' } },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.counts.certsPendingReview).toBe(1);
    expect(out.recentEvents.find(e => e.eventKey === 'cert-pending:42')).toBeUndefined();
  });

  test('recentEvents includes unseen items with employee context', async () => {
    prisma.employeeCertification.count.mockResolvedValue(1);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employeeCertification.findMany.mockResolvedValue([
      { id: 42, certType: 'CPR', employeeId: 7, updatedAt: new Date('2026-06-26'), employee: { name: 'Jane Doe' } },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.recentEvents).toHaveLength(1);
    expect(out.recentEvents[0]).toMatchObject({
      eventKey: 'cert-pending:42', type: 'cert-pending', employeeId: 7, employeeName: 'Jane Doe', subject: 'CPR',
    });
  });

  test('caps recentEvents at 10 items', async () => {
    prisma.employeeCertification.count.mockResolvedValue(15);
    prisma.timeOffRequest.count.mockResolvedValue(0);
    prisma.availabilityRequest.count.mockResolvedValue(0);
    prisma.adminEventSeen.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    const fakeCerts = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1, certType: 'CPR', employeeId: 7, updatedAt: new Date(2026, 5, 26 - i), employee: { name: 'Jane' },
    }));
    prisma.employeeCertification.findMany.mockResolvedValue(fakeCerts);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);
    prisma.availabilityRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes();
    await getEmployeeAttention(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.recentEvents).toHaveLength(10);
  });
});
