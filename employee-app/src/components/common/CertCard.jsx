import { useRef } from 'react';

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

export default function CertCard({ slot, onUpload }) {
  const { certType, cert, status, others } = slot;
  const fileRef = useRef(null);
  const badge = STATUS_BADGE[status] || STATUS_BADGE.missing;
  const isMissing = status === 'missing' && !cert;

  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div className={`cert-card cert-card--${status}`}>
      <div className="cert-card__header">
        <span className="cert-card__title">{certType}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>
      {cert && cert.expirationDate && (
        <p className="cert-card__meta">Expires: {fmt(cert.expirationDate)}</p>
      )}
      {cert && cert.updatedAt && (
        <p className="cert-card__meta">Last uploaded: {fmt(cert.updatedAt)}</p>
      )}
      {others && others.length > 0 && (
        <ul className="cert-card__others" style={{ marginTop: 8, paddingLeft: 16 }}>
          {others.map(o => <li key={o.id}>{o.certType}</li>)}
        </ul>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
      <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 12 }} onClick={() => fileRef.current && fileRef.current.click()}>
        {isMissing ? 'Upload' : 'Replace'}
      </button>
    </div>
  );
}
