const { tenantClient } = require('./tenantPrisma');
const { runWithTenant } = require('./tenantContext');

/**
 * Public-token endpoints resolve their row via the system client (token
 * lookup crosses tenants by design), then MUST call this before touching
 * tenant data. 404 (not 403) on mismatch — don't confirm the token exists.
 */
function enterTokenTenant(req, res, agencyId, fn) {
  if (req.agency && req.agency.id !== agencyId) {
    res.status(404).json({ error: 'Not found' });
    return Promise.resolve();
  }
  const db = tenantClient(agencyId);
  req.db = db;
  return runWithTenant({ agencyId, db }, fn);
}

module.exports = { enterTokenTenant };
