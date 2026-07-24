const { SERVICE_DEFAULTS } = require('../lib/serviceDefaults');
const { getAgencyId, getTenantDb } = require('../lib/tenantContext');

// Per-agency cache: two agencies can define the same service code with
// different settings (name/color/account/etc), so the merged map must never
// be shared across tenants.
const cacheByAgency = new Map();

function buildMap(rows) {
  const map = {};
  // start with defaults
  for (const [code, d] of Object.entries(SERVICE_DEFAULTS)) map[code] = { ...d, enforceAuthLimit: d.enforceAuthLimit };
  // DB overrides defaults; non-empty DB fields win
  for (const r of rows) {
    const base = map[r.code] || {};
    map[r.code] = {
      category: r.category || base.category || '',
      name: r.name || base.name || '',
      label: r.label || base.label || r.code,
      accountNumber: r.accountNumber || base.accountNumber || '',
      color: r.color || base.color || '',
      timesheetSection: r.timesheetSection || base.timesheetSection || '',
      sortOrder: (r.sortOrder != null ? r.sortOrder : (base.sortOrder ?? 50)),
      enforceAuthLimit: (r.enforceAuthLimit != null ? r.enforceAuthLimit : (base.enforceAuthLimit ?? true)),
    };
  }
  return map;
}

// Resolves which tenant client to query with: an explicit agencyId always
// wins (callers that already have req.db/agencyId in scope should pass it);
// otherwise fall back to the ambient tenant context set by tenantMiddleware.
function resolveDb(agencyId) {
  if (agencyId != null) {
    const { tenantClient } = require('../lib/tenantPrisma');
    return { db: tenantClient(agencyId), key: agencyId };
  }
  const ctxAgencyId = getAgencyId();
  if (ctxAgencyId != null) {
    return { db: getTenantDb(), key: ctxAgencyId };
  }
  return null;
}

async function getServiceMap(agencyId) {
  const resolved = resolveDb(agencyId);
  if (!resolved) return buildMap([]); // no tenant context — defaults-only
  const { db, key } = resolved;
  if (cacheByAgency.has(key)) return cacheByAgency.get(key);
  try {
    const rows = await db.service.findMany({ where: { archivedAt: null } });
    const map = buildMap(rows);
    cacheByAgency.set(key, map);
    return map;
  } catch (err) {
    // DB unavailable — fall back to defaults-only, but don't cache so a later
    // successful call can still populate the real cache.
    return buildMap([]);
  }
}

function getServiceMapSync(agencyId) {
  const key = agencyId != null ? agencyId : getAgencyId();
  if (key != null && cacheByAgency.has(key)) return cacheByAgency.get(key);
  return buildMap([]); // defaults-only until first async load for this agency
}

// No arg clears every agency's cache (used defensively / in tests). A
// specific agencyId clears only that tenant's entry so one agency's edit
// doesn't force every other agency to re-fetch.
function invalidate(agencyId) {
  if (agencyId == null) {
    cacheByAgency.clear();
  } else {
    cacheByAgency.delete(agencyId);
  }
}

async function sectionEnforcesLimit(section, agencyId) {
  if (!section) return false;
  const map = await getServiceMap(agencyId);
  return Object.values(map).some(s => s.timesheetSection === section && s.enforceAuthLimit === true);
}

function deriveTimesheetSection(code, serviceName, agencyId) {
  if (code === 'COPE' || code === 'PAS') {
    const name = (serviceName || '').toLowerCase();
    if (name.includes('homemaker')) return 'Homemaker';
    if (name.includes('respite')) return 'Respite';
    if (name.includes('companion')) return 'Companion';
    return 'PAS';
  }
  const map = getServiceMapSync(agencyId);
  const entry = map[code];
  if (entry && entry.timesheetSection) return entry.timesheetSection;
  return null;
}

module.exports = { getServiceMap, getServiceMapSync, invalidate, deriveTimesheetSection, sectionEnforcesLimit };
