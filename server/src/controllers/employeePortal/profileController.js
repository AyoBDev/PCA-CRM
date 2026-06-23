const prisma = require('../../lib/prisma');

async function getProfile(req, res) {
  const emp = await prisma.employee.findUnique({
    where: { id: req.employee.id },
    select: {
      id: true, name: true, phone: true, email: true, address: true,
      dob: true, firstAssignmentDate: true, complianceStatus: true,
    },
  });
  res.json(emp);
}

async function updateProfile(req, res) {
  const { name, phone, email, address } = req.body;
  const updated = await prisma.employee.update({
    where: { id: req.employee.id },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(address !== undefined && { address }),
    },
    select: { id: true, name: true, phone: true, email: true, address: true },
  });
  res.json(updated);
}

module.exports = { getProfile, updateProfile };
