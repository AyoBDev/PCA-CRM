const prisma = require('../lib/prisma');

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // slug -> { agency, expires }

function baseDomain() {
  return (process.env.BASE_DOMAIN || 'localhost').toLowerCase();
}

async function lookupAgency(slug) {
  const hit = cache.get(slug);
  if (hit && hit.expires > Date.now()) return hit.agency;
  const agency = await prisma.agency.findUnique({ where: { slug } });
  cache.set(slug, { agency, expires: Date.now() + CACHE_TTL_MS });
  return agency;
}

function clearAgencyCache() {
  cache.clear();
}

async function resolveAgency(req, res, next) {
  try {
    const domain = baseDomain();
    const host = (req.hostname || '').toLowerCase();
    if (host === domain || host === `www.${domain}`) {
      req.agency = null;
      return next();
    }
    if (host.endsWith(`.${domain}`)) {
      const slug = host.slice(0, -(domain.length + 1));
      if (slug && !slug.includes('.')) {
        const agency = await lookupAgency(slug);
        if (agency) {
          req.agency = agency;
          return next();
        }
      }
    }
    // Unknown subdomain or foreign host (e.g. *.up.railway.app healthcheck).
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    req.agency = null;
    req.agencyNotFound = true;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveAgency, clearAgencyCache };
