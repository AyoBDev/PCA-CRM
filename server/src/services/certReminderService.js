const DAY_MS = 24 * 60 * 60 * 1000;

// Whole calendar days from `now` to `expDate`, floored to midnight UTC so the
// time of day never shifts the boundary.
function daysBetween(now, expDate) {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(expDate.getUTCFullYear(), expDate.getUTCMonth(), expDate.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

// Ranges (not strict equality) so a missed cron day never SKIPS a stage; the
// ledger guarantees each stage still fires only once.
function computeStage(daysToExpiry) {
  if (daysToExpiry <= 0) return 'expired_final';
  if (daysToExpiry <= 7) return 'reminder_7day';
  if (daysToExpiry <= 30) return 'reminder_30day';
  return null;
}

function versionKeyFor(cert) {
  return cert.currentVersionKey ? String(cert.currentVersionKey) : 'v0';
}

module.exports = { daysBetween, computeStage, versionKeyFor };
