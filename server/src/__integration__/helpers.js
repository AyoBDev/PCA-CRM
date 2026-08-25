const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secrets');

const systemPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function createAgencyWithAdmin(slug) {
  const agency = await systemPrisma.agency.create({ data: { name: `Agency ${slug}`, slug } });
  const admin = await systemPrisma.user.create({
    data: {
      email: `admin@${slug}.test`,
      passwordHash: await bcrypt.hash('secret123', 4),
      name: `Admin ${slug}`,
      role: 'admin',
      agencyId: agency.id,
    },
  });
  const token = jwt.sign(
    {
      id: admin.id, email: admin.email, name: admin.name, role: admin.role,
      permissionGroupId: null, permissions: [], permissionsVersion: 1,
      agencyId: agency.id, agencySlug: slug,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { agency, admin, token };
}

async function cleanupAgencies(slugs) {
  await systemPrisma.agency.deleteMany({ where: { slug: { in: slugs } } });
}

module.exports = { systemPrisma, createAgencyWithAdmin, cleanupAgencies };
