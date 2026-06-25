const prisma = require('../src/lib/prisma');
const {
  listPermissionGroups,
  createPermissionGroup,
  updatePermissionGroup,
  archivePermissionGroup,
  assignUserPermissionGroup,
} = require('../src/controllers/permissionGroupController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

const adminReq = { user: { id: 1, name: 'Admin', role: 'admin' } };

describe('permissionGroupController', () => {
  let createdGroupId;
  let testUser;

  beforeAll(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `pg-test-${Date.now()}@test.local`,
        passwordHash: 'x',
        name: 'PgTest',
        role: 'user',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    if (createdGroupId) {
      await prisma.user.updateMany({ where: { permissionGroupId: createdGroupId }, data: { permissionGroupId: null } });
      await prisma.permissionGroup.deleteMany({ where: { id: createdGroupId } });
    }
    await prisma.$disconnect();
  });

  test('create permission group', async () => {
    const req = { ...adminReq, body: { name: `TestGroup-${Date.now()}`, description: 'desc', permissions: ['files', 'payroll'] } };
    const res = mockRes();
    await createPermissionGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.name).toBe(req.body.name);
    expect(body.permissions).toEqual(['files', 'payroll']);
    createdGroupId = body.id;
  });

  test('create rejects invalid permission keys', async () => {
    const req = { ...adminReq, body: { name: `Bad-${Date.now()}`, permissions: ['not-a-key'] } };
    const res = mockRes();
    await createPermissionGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('create rejects duplicate name', async () => {
    const name = `Dup-${Date.now()}`;
    const req1 = { ...adminReq, body: { name, permissions: ['files'] } };
    const res1 = mockRes();
    await createPermissionGroup(req1, res1);
    const firstId = res1.json.mock.calls[0][0].id;
    const req2 = { ...adminReq, body: { name, permissions: ['payroll'] } };
    const res2 = mockRes();
    await createPermissionGroup(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
    await prisma.permissionGroup.delete({ where: { id: firstId } });
  });

  test('assign user to group bumps permissionsVersion', async () => {
    const before = await prisma.user.findUnique({ where: { id: testUser.id } });
    const req = { ...adminReq, params: { id: String(testUser.id) }, body: { permissionGroupId: createdGroupId } };
    const res = mockRes();
    await assignUserPermissionGroup(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    const after = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(after.permissionGroupId).toBe(createdGroupId);
    expect(after.permissionsVersion).toBe((before.permissionsVersion ?? 1) + 1);
  });

  test('assign rejects when target is admin', async () => {
    const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    const req = { ...adminReq, params: { id: String(adminUser.id) }, body: { permissionGroupId: createdGroupId } };
    const res = mockRes();
    await assignUserPermissionGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('update permissions bumps assignees permissionsVersion', async () => {
    const before = await prisma.user.findUnique({ where: { id: testUser.id } });
    const req = { ...adminReq, params: { id: String(createdGroupId) }, body: { permissions: ['files', 'tasks'] } };
    const res = mockRes();
    await updatePermissionGroup(req, res);
    const after = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(after.permissionsVersion).toBe(before.permissionsVersion + 1);
  });

  test('update name only does NOT bump assignees', async () => {
    const before = await prisma.user.findUnique({ where: { id: testUser.id } });
    const req = { ...adminReq, params: { id: String(createdGroupId) }, body: { name: `Renamed-${Date.now()}` } };
    const res = mockRes();
    await updatePermissionGroup(req, res);
    const after = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(after.permissionsVersion).toBe(before.permissionsVersion);
  });

  test('archive clears assignees and bumps versions', async () => {
    const before = await prisma.user.findUnique({ where: { id: testUser.id } });
    const req = { ...adminReq, params: { id: String(createdGroupId) } };
    const res = mockRes();
    await archivePermissionGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    const after = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(after.permissionGroupId).toBeNull();
    expect(after.permissionsVersion).toBe(before.permissionsVersion + 1);
  });

  test('list returns active groups only', async () => {
    const req = { ...adminReq };
    const res = mockRes();
    await listPermissionGroups(req, res);
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(true);
    expect(body.every(g => g.archivedAt === null || g.archivedAt === undefined)).toBe(true);
  });
});
