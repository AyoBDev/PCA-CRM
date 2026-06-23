const prisma = require('../lib/prisma');

async function requireEmployeeLink(req, res, next) {
  const employee = await prisma.employee.findUnique({
    where: { userId: req.user.id },
  });
  if (!employee) {
    return res.status(403).json({ error: 'No employee profile linked to this account' });
  }
  req.employee = employee;
  next();
}

module.exports = { requireEmployeeLink };
