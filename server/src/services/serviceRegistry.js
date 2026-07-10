const prisma = require('../lib/prisma');
const { SERVICE_DEFAULTS } = require('../lib/serviceDefaults');

let cache = null;

function buildMap(rows) {
  const map = {};
  // start with defaults
  for (const [code, d] of Object.entries(SERVICE_DEFAULTS)) map[code] = { ...d };
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
    };
  }
  return map;
}

async function getServiceMap() {
  if (cache) return cache;
  const rows = await prisma.service.findMany({ where: { archivedAt: null } });
  cache = buildMap(rows);
  return cache;
}

function getServiceMapSync() {
  if (cache) return cache;
  return buildMap([]); // defaults-only until first async load
}

function invalidate() { cache = null; }

function deriveTimesheetSection(code, serviceName) {
  if (code === 'COPE' || code === 'PAS') {
    const name = (serviceName || '').toLowerCase();
    if (name.includes('homemaker')) return 'Homemaker';
    if (name.includes('respite')) return 'Respite';
    if (name.includes('companion')) return 'Companion';
    return 'PAS';
  }
  const map = getServiceMapSync();
  const entry = map[code];
  if (entry && entry.timesheetSection) return entry.timesheetSection;
  return null;
}

module.exports = { getServiceMap, getServiceMapSync, invalidate, deriveTimesheetSection };
