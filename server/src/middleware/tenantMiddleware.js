const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');

async function tenantMiddleware(req, res, next) {
  try {
    if (req.user?.role === 'superadmin') {
      return res.status(403).json({ error: 'Platform accounts cannot access agency APIs' });
    }
    const agencyId = req.user?.agencyId;
    if (!Number.isInteger(agencyId)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (req.agency && req.agency.id !== agencyId) {
      return res.status(401).json({ error: 'Invalid session for this agency' });
    }
    const agency = req.agency || (await prisma.agency.findUnique({ where: { id: agencyId } }));
    if (!agency) {
      return res.status(401).json({ error: 'Agency not found' });
    }
    if (agency.status !== 'active') {
      return res.status(403).json({ error: 'This agency account is suspended. Please contact support.' });
    }
    req.db = tenantClient(agencyId);
    runWithTenant(
      { agencyId, db: req.db, impersonatorId: req.user.impersonatorId ?? null },
      () => next()
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantMiddleware };
