import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import CertCard from '../components/common/CertCard';
import CertSummary from '../components/common/CertSummary';

function statusFor(item) {
  if (!item) return 'missing';
  if (item.requiresExpiry && item.expirationDate) {
    const exp = new Date(item.expirationDate).getTime();
    const now = Date.now();
    if (exp < now) return 'expired';
    if (exp <= now + 30 * 86400000) return 'expiring';
    return 'approved';
  }
  if (item.status === 'active' || item.status === 'approved') return 'approved';
  if (item.status === 'expired') return item.requiresExpiry ? 'expired' : 'approved';
  if (item.status === 'expiring') return item.requiresExpiry ? 'expiring' : 'approved';
  if (item.currentFile) return 'pending';
  return 'missing';
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CertificationsPage() {
  const navigate = useNavigate();
  const [certifications, setCertifications] = useState([]);
  const [summary, setSummary] = useState({ approved: 0, pending: 0, actionNeeded: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

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

  function toggleHistory(requirementId) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(requirementId)) next.delete(requirementId);
      else next.add(requirementId);
      return next;
    });
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
      ) : certifications.map(item => {
        const status = statusFor(item);
        const uploads = Array.isArray(item.uploads) ? item.uploads : [];
        const isOpen = expanded.has(item.requirementId);
        return (
          <div key={item.requirementId} style={{ marginBottom: 12 }}>
            <CertCard
              label={item.label}
              status={status}
              statusLabel={item.statusLabel}
              expirationDate={item.expirationDate}
              requiresExpiry={item.requiresExpiry}
              renewalYears={item.renewalYears}
              hasFile={!!item.currentFile}
              uploads={uploads}
              onView={() => {}}
              onUpload={(file) => uploadFor(item, file)}
            />
            {uploads.length > 0 && (
              <div className="cert-history">
                <button
                  type="button"
                  className="cert-history__toggle"
                  onClick={() => toggleHistory(item.requirementId)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Hide' : 'Show'} upload history ({uploads.length})
                </button>
                {isOpen && (
                  <ul className="cert-history__list">
                    {uploads.map(u => (
                      <li key={u.id} className="cert-history__item">
                        <div className="cert-history__item-info">
                          <span className="cert-history__item-name">{u.fileName}</span>
                          <span className="cert-history__item-meta">
                            {formatDate(u.submittedAt)}{u.fileSize ? ` · ${formatFileSize(u.fileSize)}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => handleDownload(u)}
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
