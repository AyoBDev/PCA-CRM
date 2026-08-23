// Runs after tenantMiddleware, so the lookup is tenant-scoped via req.db.
async function requireEmployeeLink(req, res, next) {
  const employee = await req.db.employee.findUnique({
    where: { userId: req.user.id },
  });
  if (!employee) {
    return res.status(403).json({ error: 'No employee profile linked to this account' });
  }
  req.employee = employee;
  next();
}

module.exports = { requireEmployeeLink };
