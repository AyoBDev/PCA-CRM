import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

function certStatus(cert) {
  if (!cert.expirationDate) return 'valid';
  const days = Math.ceil((new Date(cert.expirationDate) - new Date()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

export default function CertificationsPage() {
  const navigate = useNavigate();
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCertifications().then(data => setCerts(data.certifications || data || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Certifications</h2>
      </div>
      {loading ? <div className="page-loading">Loading...</div> : certs.length === 0 ? (
        <div className="empty-state"><p className="empty-state__text">No certifications</p></div>
      ) : certs.map(cert => (
        <div key={cert.id} className={`cert-card cert-card--${certStatus(cert)}`}>
          <div className="cert-card__header">
            <span className="cert-card__title">{cert.certType}</span>
            <span className={`badge badge--${certStatus(cert) === 'valid' ? 'success' : certStatus(cert) === 'expiring' ? 'warning' : 'danger'}`}>
              {certStatus(cert)}
            </span>
          </div>
          {cert.expirationDate && (
            <p className="cert-card__meta">Expires: {new Date(cert.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          )}
        </div>
      ))}
    </div>
  );
}
