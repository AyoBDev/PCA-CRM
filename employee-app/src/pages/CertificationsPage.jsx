import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import CertSummary from '../components/common/CertSummary';
import CertIcons from '../components/common/CertIcons';
import { CERT_COLORS } from '../utils/certColors';

// status vocabulary matches the admin's CertificationsTab.getCertStatusForType:
// 'pending' | 'ok' | 'critical' | 'expired' | 'unknown'
// A cert awaiting HR review (status 'pending'/'submitted') is shown as "Pending
// Review" regardless of its (possibly stale) expiration date — otherwise a
// just-uploaded renewal whose OLD date is still in the past would misleadingly
// read "Expired". The review state takes precedence over the date-derived state.
function statusFor(item) {
  if (!item) return 'unknown';
  if (item.status === 'pending' || item.status === 'submitted') return 'pending';
  if (!item.requiresExpiry || !item.expirationDate) return 'unknown';
  const now = new Date();
  const d = new Date(item.expirationDate);
  const days = Math.ceil((d - now) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  return 'ok';
}

function daysRemaining(item) {
  if (!item || !item.expirationDate) return null;
  const now = new Date();
  const d = new Date(item.expirationDate);
  return Math.ceil((d - now) / 86400000);
}

function statusLabel(s) {
  if (s === 'pending') return 'Pending Review';
  return s === 'ok' ? 'Active' : s === 'critical' ? 'Expiring Soon' : s === 'expired' ? 'Expired' : 'Not Set';
}

function statusBadgeStyle(s) {
  if (s === 'pending') return { background: 'hsl(217 91% 93%)', color: '#2563eb' };
  if (s === 'ok') return { background: 'hsl(142 76% 92%)', color: '#16a34a' };
  if (s === 'critical') return { background: 'hsl(38 92% 92%)', color: '#d97706' };
  if (s === 'expired') return { background: 'hsl(0 84% 94%)', color: '#dc2626' };
  return { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CertUploadInput({ onFile, children }) {
  const fileRef = useRef(null);
  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onFile(file);
    e.target.value = '';
  }
  return (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
      <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current && fileRef.current.click()}>
        {children}
      </button>
    </>
  );
}

export default function CertificationsPage() {
  const navigate = useNavigate();
  const [certifications, setCertifications] = useState([]);
  const [summary, setSummary] = useState({ approved: 0, pending: 0, actionNeeded: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getCertifications();
      setCertifications((res && res.certifications) || []);
      if (res && res.summary) setSummary(res.summary);
    } catch (e) {
      setError(e.message || 'Failed to load certifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function uploadFor(item, file) {
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      if (item.certificationId) {
        await api.uploadCertification(item.certificationId, fd);
      } else {
        fd.append('certType', item.certType);
        await api.createCertification(fd);
      }
      await load();
    } catch (e) {
      setError(e.message || 'Upload failed');
    }
  }

  async function handleDownload(upload) {
    setError('');
    try {
      const res = await api.downloadCertUpload(upload.id);
      if (!res || !res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = upload.fileName || 'certification';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message || 'Download failed');
    }
  }

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Certifications</h2>
      </div>

      <CertSummary approved={summary.approved} pending={summary.pending} actionNeeded={summary.actionNeeded} total={summary.total} />

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="skeleton skeleton--card" style={{ height: 120 }} />
      ) : (
        <div className="pa-services-grid">
          <div className="pa-services-grid__left">
            {certifications.filter((_, i) => i % 2 === 0).map(item => renderCertCard(item))}
          </div>
          <div className="pa-services-grid__right">
            {certifications.filter((_, i) => i % 2 === 1).map(item => renderCertCard(item))}
          </div>
        </div>
      )}
    </div>
  );

  function renderCertCard(item) {
    const status = statusFor(item);
    const days = daysRemaining(item);
    const colors = CERT_COLORS[item.certType] || CERT_COLORS.other;
    const uploads = Array.isArray(item.uploads) ? item.uploads : [];
    const attachCount = uploads.length > 0 ? uploads.length : (item.currentFile ? 1 : 0);
    const isExpanded = expandedId === item.requirementId;

    return (
      <div
        key={item.requirementId}
        className="pa-service-card"
        style={{ '--card-accent': colors.accent, '--card-bg': colors.bg, '--card-border': colors.border }}
      >
        <div className="pa-service-card__header">
          <div className="pa-service-card__icon-wrap" style={{ background: colors.bg, color: colors.accent }}>
            {CertIcons[colors.icon]}
          </div>
          <div className="pa-service-card__title-area">
            <h4 className="pa-service-card__title">{item.label || colors.label}</h4>
            <span className="pa-badge pa-badge--active" style={statusBadgeStyle(status)}>
              {statusLabel(status)}
            </span>
          </div>
          {item.renewalYears ? (
            <div className="pa-service-card__account">
              <span className="pa-service-card__account-label">Renewal</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{item.renewalYears}yr</span>
            </div>
          ) : null}
        </div>

        <div className="pa-service-card__body">
          <div className="pa-service-card__detail">
            {CertIcons.calendar} <span>{item.expirationDate ? `Expires ${formatDate(item.expirationDate)}` : 'No expiration date set'}</span>
          </div>
          <div className="pa-service-card__detail">
            {CertIcons.clock} <span>{days !== null ? (days >= 0 ? `${days} days remaining` : `Expired ${Math.abs(days)} days ago`) : '—'}</span>
          </div>
          <div className="pa-service-card__detail">
            {CertIcons.paperclip} <span>{attachCount} attachment{attachCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="pa-service-card__footer">
          <CertUploadInput onFile={(file) => uploadFor(item, file)}>
            {CertIcons.upload} {item.currentFile ? 'Replace' : 'Upload'}
          </CertUploadInput>
          <button
            className="btn btn--outline btn--sm pa-btn--view-details"
            style={{ color: colors.accent, borderColor: colors.accent }}
            onClick={() => setExpandedId(isExpanded ? null : item.requirementId)}
          >
            {isExpanded ? CertIcons.chevronDown : CertIcons.chevronRight} {isExpanded ? 'Hide Details' : 'View Details'}
          </button>
        </div>

        {isExpanded && (
          <div className="pa-service-card__expanded">
            {uploads.length === 0 ? (
              <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>No files on file.</div>
            ) : (
              <div className="cert-history__list">
                {uploads.map(u => (
                  <div key={u.id} className="file-row file-row--cert">
                    <div className="file-row__main">
                      <div className="file-row__name">{u.fileName}</div>
                      <div className="file-row__submeta">
                        {formatDate(u.submittedAt)}{u.fileSize ? ` · ${formatFileSize(u.fileSize)}` : ''}
                      </div>
                    </div>
                    <div className="file-row__badge">
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => handleDownload(u)}>
                        {CertIcons.download} Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
