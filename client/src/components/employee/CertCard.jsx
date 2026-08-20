import { useRef } from 'react';
import { progressForCert } from '../../utils/certProgress';
import { formatDate } from '../../utils/dates';

const BADGE = {
    approved: { background: 'hsl(142 76% 92%)', color: '#16a34a', text: 'Approved' },
    pending: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', text: 'Pending' },
    expiring: { background: 'hsl(38 92% 92%)', color: '#d97706', text: 'Expiring' },
    expired: { background: 'hsl(0 84% 94%)', color: '#dc2626', text: 'Expired' },
    missing: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', text: 'Missing' },
};

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
    const days = requiresExpiry ? daysUntil(expirationDate) : null;
    const { pct, variant } = progressForCert({ status, days, renewalYears, hasFile });
    const badge = BADGE[status] || BADGE.missing;
    const badgeLabel = statusLabel || badge.text;

    function onPick(e) {
        const file = e.target.files && e.target.files[0];
        if (file) onUpload(file);
        e.target.value = '';
    }

    return (
        <div className="cert-card">
            <div className="cert-card__header">
                <div className="cert-card__title-area">
                    <h4 className="cert-card__title">{label}</h4>
                </div>
                <span className="pa-badge" style={{ background: badge.background, color: badge.color }}>{badgeLabel}</span>
            </div>
            <div className="cert-card__meta">
                {requiresExpiry && (
                    <div className="cert-card__expiry">Expires {formatDate(expirationDate)}</div>
                )}
            </div>
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
