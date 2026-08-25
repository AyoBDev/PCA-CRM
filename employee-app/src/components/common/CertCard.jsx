import { useRef } from 'react';
import { progressForCert } from '../../utils/certProgress';

const STATUS_BADGE = {
  approved: { cls: 'badge--success', label: 'Approved' },
  pending: { cls: 'badge--muted', label: 'Pending' },
  expiring: { cls: 'badge--warning', label: 'Expiring' },
  expired: { cls: 'badge--danger', label: 'Expired' },
  missing: { cls: 'badge--danger', label: 'Missing' },
};

function fmt(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const d = new Date(dateStr);
  return Math.ceil((d - now) / 86400000);
}

export default function CertCard({
  label, status, statusLabel, expirationDate, requiresExpiry, renewalYears,
  hasFile, uploads, onView, onUpload,
}) {
  const fileRef = useRef(null);
  const badge = STATUS_BADGE[status] || STATUS_BADGE.missing;
  const badgeLabel = statusLabel || badge.label;
  const days = requiresExpiry ? daysUntil(expirationDate) : null;
  const { pct, variant } = progressForCert({ status, days, renewalYears, hasFile });

  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div className={`cert-card cert-card--${status}`}>
      <div className="cert-card__header">
        <span className="cert-card__title">{label}</span>
        <span className={`badge ${badge.cls}`}>{badgeLabel}</span>
      </div>
      {requiresExpiry && (
        <p className="cert-card__meta">Expires {fmt(expirationDate)}</p>
      )}
      <div className="cert-card__progress">
        <div className={`cert-card__progress-fill cert-card__progress-fill--${variant}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="cert-card__renewal">
        <span className="cert-card__renewal-label">Renewal</span>
        <span className="cert-card__renewal-value">{renewalYears ? `${renewalYears}yr` : '—'}</span>
      </div>
      <div className="cert-card__actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={onView}>View</button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
        <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current && fileRef.current.click()}>
          {hasFile ? 'Replace' : 'Upload'}
        </button>
      </div>
    </div>
  );
}
