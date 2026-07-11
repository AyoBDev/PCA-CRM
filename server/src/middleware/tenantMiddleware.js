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
    // Outside production (dev/test), requests without a resolved subdomain
    // (apex domain, loopback supertest requests) fall back to trusting the
    // JWT's agencyId directly. In production this fallback is a tenant-
    // binding bypass — a token minted for one agency could be replayed on
    // the apex/loopback host and still resolve to that agency's data, since
    // resolveAgency only 404s truly unknown subdomains, not the apex. Require
    // a subdomain-resolved req.agency in production.
    if (!req.agency && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Agency could not be resolved for this request' });
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
