const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../src/lib/prisma');
const { JWT_SECRET } = require('../../src/config/secrets');

// Creates a User + linked Employee (userId set), and signs a JWT the same way
// authController.signToken does, so it passes both `authenticate` (verifies the
// signature + permissionsVersion against the DB) and `requireEmployeeLink`
// (looks up Employee by userId) in server/src/middleware/*.
async function employeeAuthHeader(overrides = {}) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const user = await prisma.user.create({
    data: {
      email: `portal-test-${unique}@example.com`,
      passwordHash,
      name: 'Portal Test User',
      role: 'pca',
      ...overrides.user,
    },
  });

  const employee = await prisma.employee.create({
    data: {
      name: 'Portal Test Employee',
      email: `portal-employee-${unique}@example.com`,
      userId: user.id,
      ...overrides.employee,
    },
  });

  const token = jwt.sign(
    { id: user.id, permissionsVersion: user.permissionsVersion ?? 1 },
    JWT_SECRET
  );

  return {
    header: { Authorization: `Bearer ${token}` },
    employeeId: employee.id,
    userId: user.id,
  };
}

module.exports = { employeeAuthHeader };
