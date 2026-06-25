const STARTER_GROUPS = [
  {
    name: 'Office Manager',
    description: 'Full operational access. Excludes user management, SANDATA, receipts, and history.',
    permissions: [
      'clients', 'authorizations', 'employees',
      'timesheets', 'permanent-links', 'scheduling', 'tasks',
      'payroll', 'messages', 'files',
      'insurance-types', 'services',
    ],
  },
  {
    name: 'Files Only',
    description: 'Access limited to the file manager.',
    permissions: ['files'],
  },
];

async function seedPermissionGroups(prisma) {
  for (const g of STARTER_GROUPS) {
    const existing = await prisma.permissionGroup.findUnique({ where: { name: g.name } });
    if (existing) continue;
    await prisma.permissionGroup.create({
      data: { name: g.name, description: g.description, permissions: g.permissions },
    });
    console.log(`[seed] Created permission group: ${g.name}`);
  }
}

module.exports = { seedPermissionGroups };
