jest.mock('../../lib/prisma', () => ({
  auditLog: { create: jest.fn().mockResolvedValue({}) },
}));
const prisma = require('../../lib/prisma');
const audit = require('../auditService');
const { runWithTenant } = require('../../lib/tenantContext');

test('logAction stamps agencyId from tenant context', async () => {
  await runWithTenant({ agencyId: 42, db: {} }, async () => {
    audit.logAction({ userId: 1, userName: 'T', userRole: 'admin', action: 'CREATE', entityType: 'Client', entityId: 5, entityName: 'X' });
  });
  await new Promise((r) => setImmediate(r)); // fire-and-forget flush
  expect(prisma.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ agencyId: 42 }) })
  );
});

test('logAction outside tenant context writes agencyId null (platform actions)', async () => {
  prisma.auditLog.create.mockClear();
  audit.logAction({ userId: 1, userName: 'S', userRole: 'superadmin', action: 'CREATE', entityType: 'Agency', entityId: 9, entityName: 'New Agency' });
  await new Promise((r) => setImmediate(r));
  expect(prisma.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ agencyId: null }) })
  );
});

test('impersonatorId lands in metadata', async () => {
  prisma.auditLog.create.mockClear();
  await runWithTenant({ agencyId: 42, db: {}, impersonatorId: 3 }, async () => {
    audit.logAction({ userId: 1, userName: 'T', userRole: 'admin', action: 'UPDATE', entityType: 'Client', entityId: 5, entityName: 'X' });
  });
  await new Promise((r) => setImmediate(r));
  const data = prisma.auditLog.create.mock.calls[0][0].data;
  expect(JSON.parse(data.metadata)).toMatchObject({ impersonatorId: 3 });
});
