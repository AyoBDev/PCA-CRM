// ──────────────────────────────────────────────
// Authorization Service — Core Business Logic
// ──────────────────────────────────────────────

const REMINDER_WINDOWS = {
  PCS: 60,
  SDPC: 30,
  TIMESHEETS: 15,
};

const DEFAULT_REMINDER_WINDOW = 30;

const STATUS_RANK = {
  OK: 1,
  'Renewal Reminder': 2,
  Expired: 3,
};

const RENEWAL_COLORS = {
  PCS: 'ORANGE',
  SDPC: 'YELLOW',
  TIMESHEETS: 'ORANGE',
};

/**
 * Compute the number of whole days until an authorization expires.
 * Uses UTC dates to avoid timezone drift.
 */
function computeDaysToExpire(endDate) {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = new Date(endDate);
  const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

/**
 * Return the reminder-window days for a given service code.
 */
function getReminderWindow(serviceCode) {
  return REMINDER_WINDOWS[serviceCode] ?? DEFAULT_REMINDER_WINDOW;
}

/**
 * Determine status and colour for a single authorization.
 */
function computeStatus(daysToExpire, serviceCode) {
  const window = getReminderWindow(serviceCode);

  if (daysToExpire < 0) {
    return { status: 'Expired', statusColor: 'RED' };
  }
  if (daysToExpire <= window) {
    return {
      status: 'Renewal Reminder',
      statusColor: RENEWAL_COLORS[serviceCode] || 'ORANGE',
    };
  }
  return { status: 'OK', statusColor: 'BLUE' };
}

/**
 * Enrich a raw Authorization DB record with computed fields.
 */
function enrichAuthorization(auth) {
  const daysToExpire = computeDaysToExpire(auth.authorizationEndDate);
  const { status, statusColor } = computeStatus(daysToExpire, auth.serviceCode);

  return {
    id: auth.id,
    clientId: auth.clientId,
    serviceCategory: auth.serviceCategory || '',
    serviceCode: auth.serviceCode,
    serviceName: auth.serviceName || '',
    authorizedUnits: auth.authorizedUnits || 0,
    authorizationStartDate: auth.authorizationStartDate,
    authorizationEndDate: auth.authorizationEndDate,
    notes: auth.notes || '',
    daysToExpire,
    status,
    statusColor,
    createdAt: auth.createdAt,
    updatedAt: auth.updatedAt,
  };
}

/**
 * Enrich a Client record with all computed client-level fields.
 */
function enrichClient(client) {
  const auths = (client.authorizations || []).map(enrichAuthorization);

  // --- service_summary: unique service codes with diamond emoji ---
  const uniqueCodes = [...new Set(auths.map((a) => a.serviceCode))];
  const serviceSummary = uniqueCodes.map((c) => `🔷 ${c}`).join(' / ') || '—';

  // --- overall_status & status_color: worst child wins ---
  let overallStatus = 'OK';
  let statusColor = 'BLUE';

  if (auths.length > 0) {
    let worstRank = 0;
    for (const a of auths) {
      const rank = STATUS_RANK[a.status] ?? 0;
      if (rank > worstRank) {
        worstRank = rank;
        overallStatus = a.status;
        statusColor = a.statusColor;
      }
    }
  }

  // --- days_summary: creation-order list "PCS:12 / SDPC:-3" ---
  const daysSummary =
    auths.map((a) => `${a.serviceCode}:${a.daysToExpire}`).join(' / ') || '—';

  return {
    id: client.id,
    clientName: client.clientName,
    medicaidId: client.medicaidId || '',
    insuranceType: client.insuranceType || 'MEDICAID',
    serviceSummary,
    overallStatus,
    statusColor,
    daysSummary,
    authorizations: auths,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

module.exports = {
  REMINDER_WINDOWS,
  STATUS_RANK,
  RENEWAL_COLORS,
  computeDaysToExpire,
  getReminderWindow,
  computeStatus,
  enrichAuthorization,
  enrichClient,
};
