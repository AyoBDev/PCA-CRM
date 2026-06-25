const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const { PERMISSIONS, isValidPermissionKey } = require('../lib/permissions');

async function listPermissionGroups(req, res) {
  const groups = await prisma.permissionGroup.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  res.json(groups.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    permissions: g.permissions,
    userCount: g._count.users,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  })));
}

async function getPermissionGroup(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const g = await prisma.permissionGroup.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!g || g.archivedAt) return res.status(404).json({ error: 'Permission group not found' });
  res.json({
    id: g.id,
    name: g.name,
    description: g.description,
    permissions: g.permissions,
    userCount: g._count.users,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  });
}

function normalizePermissions(arr) {
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  for (const k of arr) {
    if (typeof k !== 'string') return null;
    if (!isValidPermissionKey(k)) return null;
    seen.add(k);
  }
  return Array.from(seen);
}

async function createPermissionGroup(req, res) {
  const { name, description, permissions } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const normalized = normalizePermissions(permissions);
  if (normalized === null) {
    return res.status(400).json({ error: 'Invalid permissions array' });
  }
  try {
    const group = await prisma.permissionGroup.create({
      data: {
        name: name.trim(),
        description: (description || '').trim(),
        permissions: normalized,
      },
    });
    audit.logAction({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CREATE', entityType: 'PermissionGroup', entityId: group.id, entityName: group.name,
    });
    res.status(201).json({
      id: group.id, name: group.name, description: group.description,
      permissions: group.permissions, userCount: 0,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A role with that name already exists' });
    throw err;
  }
}

async function updatePermissionGroup(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const existing = await prisma.permissionGroup.findUnique({ where: { id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'Permission group not found' });

  const { name, description, permissions } = req.body || {};
  const data = {};
  let permissionsChanged = false;

  if (typeof name === 'string' && name.trim() && name.trim() !== existing.name) {
    data.name = name.trim();
  }
  if (typeof description === 'string' && description !== existing.description) {
    data.description = description;
  }
  if (permissions !== undefined) {
    const normalized = normalizePermissions(permissions);
    if (normalized === null) return res.status(400).json({ error: 'Invalid permissions array' });
    const oldSet = JSON.stringify([...(existing.permissions || [])].sort());
    const newSet = JSON.stringify(normalized.sort());
    if (oldSet !== newSet) {
      data.permissions = normalized;
      permissionsChanged = true;
    }
  }

  if (Object.keys(data).length === 0) {
    return res.json({
      id: existing.id, name: existing.name, description: existing.description,
      permissions: existing.permissions,
    });
  }

  try {
    const updated = await prisma.permissionGroup.update({ where: { id }, data });

    if (permissionsChanged) {
      await prisma.user.updateMany({
        where: { permissionGroupId: id },
        data: { permissionsVersion: { increment: 1 } },
      });
    }

    audit.logAction({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'UPDATE', entityType: 'PermissionGroup', entityId: id, entityName: updated.name,
      changes: audit.diffFields(existing, updated, ['name', 'description', 'permissions']),
    });

    res.json({
      id: updated.id, name: updated.name, description: updated.description,
      permissions: updated.permissions,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A role with that name already exists' });
    throw err;
  }
}

async function archivePermissionGroup(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const existing = await prisma.permissionGroup.findUnique({ where: { id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'Permission group not found' });

  const assignees = await prisma.user.findMany({
    where: { permissionGroupId: id },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { permissionGroupId: id },
      data: { permissionGroupId: null, permissionsVersion: { increment: 1 } },
    }),
    prisma.permissionGroup.update({ where: { id }, data: { archivedAt: new Date() } }),
  ]);

  audit.logAction({
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    action: 'ARCHIVE', entityType: 'PermissionGroup', entityId: id, entityName: existing.name,
    metadata: { affectedUsers: assignees.length },
  });

  res.status(204).end();
}

async function getPermissionKeys(req, res) {
  res.json({ permissions: PERMISSIONS });
}

async function assignUserPermissionGroup(req, res) {
  const userId = parseInt(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
  const { permissionGroupId } = req.body || {};

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { permissionGroup: { select: { name: true } } },
  });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot assign permission group to admin users' });
  if (target.role !== 'user') return res.status(400).json({ error: 'Permission groups apply only to user-role accounts' });

  let newGroupId = null;
  let newGroupName = null;
  if (permissionGroupId !== null && permissionGroupId !== undefined) {
    const intId = parseInt(permissionGroupId);
    if (!Number.isInteger(intId)) return res.status(400).json({ error: 'Invalid permissionGroupId' });
    const group = await prisma.permissionGroup.findUnique({ where: { id: intId } });
    if (!group || group.archivedAt) return res.status(404).json({ error: 'Permission group not found' });
    newGroupId = group.id;
    newGroupName = group.name;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      permissionGroupId: newGroupId,
      permissionsVersion: { increment: 1 },
    },
    include: { permissionGroup: { select: { name: true } } },
  });

  audit.logAction({
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    action: 'UPDATE', entityType: 'User', entityId: userId, entityName: target.name,
    changes: [{
      field: 'permissionGroup',
      oldValue: target.permissionGroup?.name ?? 'No restrictions',
      newValue: newGroupName ?? 'No restrictions',
    }],
  });

  res.json({
    id: updated.id,
    permissionGroupId: updated.permissionGroupId,
    permissionGroupName: updated.permissionGroup?.name ?? null,
    permissionsVersion: updated.permissionsVersion,
  });
}

module.exports = {
  listPermissionGroups,
  getPermissionGroup,
  createPermissionGroup,
  updatePermissionGroup,
  archivePermissionGroup,
  getPermissionKeys,
  assignUserPermissionGroup,
};
