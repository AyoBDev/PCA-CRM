// Single source of truth for deriving a certification's display status on the
// ADMIN side, from the API cert records for one certType (+ an optional legacy
// employee date column). Kept as a pure function so it is unit-testable and so
// the same rules can be shared with the employee portal.
//
// Status vocabulary: 'pending' | 'ok' | 'critical' | 'expired' | 'unknown'.
//
// A record awaiting HR review (status 'pending'/'submitted') takes precedence
// over the date-derived state: a just-uploaded renewal whose OLD expiration is
// still in the past must read "Pending Review", not "Expired" or "Not Set".
// Otherwise the freshest record (active first, else the most recent) drives the
// date-based status.

export function pickRecord(records) {
  if (!records || records.length === 0) return null;
  const active = records.find(r => r.status === 'active');
  if (active) return { record: active, pending: false };
  const pending = records.find(r => r.status === 'pending' || r.status === 'submitted');
  if (pending) return { record: pending, pending: true };
  // else newest by id (expired/other) — fall back to the last record
  return { record: records[records.length - 1], pending: false };
}

// records: the cert API rows for ONE certType. legacyDate: optional ISO/string
// from the employee's legacy due-date column. now: injectable for tests.
export function getCertStatusForRecords(records, legacyDate = null, now = new Date()) {
  const picked = pickRecord(records);
  const record = picked ? picked.record : null;

  if (picked && picked.pending) {
    return { status: 'pending', days: null, expDate: record.expirationDate || null, record };
  }

  const expDate = record?.expirationDate || legacyDate || null;
  if (!expDate) return { status: 'unknown', days: null, expDate: null, record };

  const d = new Date(expDate);
  const days = Math.ceil((d - now) / 86400000);
  if (days < 0) return { status: 'expired', days, expDate, record };
  if (days <= 30) return { status: 'critical', days, expDate, record };
  return { status: 'ok', days, expDate, record };
}

export function certStatusLabel(s) {
  if (s === 'pending') return 'Pending Review';
  return s === 'ok' ? 'Active' : s === 'critical' ? 'Expiring Soon' : s === 'expired' ? 'Expired' : 'Not Set';
}
