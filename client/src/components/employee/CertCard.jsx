import { progressForCert } from '../../utils/certProgress';
import { formatDate } from '../../utils/dates';

export default function CertCard({
    label, icon, colors, status, statusLabel, days, expDate, renewalLabel, renewalYears,
    hasFile, selected, onSelect, onView, onUpload,
}) {
    const { pct, variant } = progressForCert({ status, days, renewalYears, hasFile });
    const badgeStyle =
        status === 'ok' ? { background: 'hsl(142 76% 92%)', color: '#16a34a' } :
        status === 'critical' ? { background: 'hsl(38 92% 92%)', color: '#d97706' } :
        status === 'expired' ? { background: 'hsl(0 84% 94%)', color: '#dc2626' } :
        { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };

    const stop = (e, fn) => { e.stopPropagation(); fn(); };

    return (
        <div
            className={`cert-card${selected ? ' is-selected' : ''}`}
            style={{ '--card-accent': colors.accent, '--card-bg': colors.bg, '--card-border': colors.border }}
            role="button" tabIndex={0}
            aria-label={`${label} certification`}
            aria-pressed={selected}
            onClick={onSelect}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        >
            <div className="cert-card__header">
                <div className="cert-card__icon" style={{ background: colors.bg, color: colors.accent }}>{icon}</div>
                <div className="cert-card__title-area">
                    <h4 className="cert-card__title">{label}</h4>
                </div>
                <span className="pa-badge" style={badgeStyle}>{statusLabel}</span>
            </div>
            <div className="cert-card__meta">
                <div className="cert-card__expiry">{expDate ? `Expires ${formatDate(expDate)}` : 'No expiration date entered'}</div>
                <div className="cert-card__days">{days != null ? (days >= 0 ? `${days.toLocaleString()} days remaining` : `Expired ${Math.abs(days)} days ago`) : (hasFile ? 'Attachment on file' : 'Attachment required')}</div>
            </div>
            <div className="cert-card__progress">
                <div className={`cert-card__progress-fill cert-card__progress-fill--${variant}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="cert-card__renewal">
                <span className="cert-card__renewal-label">Renewal</span>
                <span className="cert-card__renewal-value">{renewalLabel}</span>
            </div>
            <div className="cert-card__actions">
                <button className="btn btn--outline btn--sm" onClick={(e) => stop(e, onView)}>View</button>
                <button className="btn btn--outline btn--sm" onClick={(e) => stop(e, onUpload)}>{hasFile ? 'Replace' : 'Upload'}</button>
            </div>
        </div>
    );
}
