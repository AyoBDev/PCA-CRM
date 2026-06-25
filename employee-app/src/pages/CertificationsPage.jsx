import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CERT_TYPES } from '../utils/certTypes';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../api';
import CertCard from '../components/common/CertCard';
import CertSummary from '../components/common/CertSummary';

function statusFor(cert) {
  if (!cert) return 'missing';
  if (cert.expirationDate) {
    const exp = new Date(cert.expirationDate).getTime();
    const now = Date.now();
    if (exp < now) return 'expired';
    if (exp <= now + 30 * 86400000) return 'expiring';
    return 'approved';
  }
  if (cert.status === 'active' || cert.status === 'approved') return 'approved';
  return 'pending';
}

export default function CertificationsPage() {
  const navigate = useNavigate();
  const { certsByType, certsApproved, certsPending, certsActionNeeded, certsTotal, refresh, loading } = useNotifications();
  const [error, setError] = useState('');

  async function uploadFor(certType, file) {
    setError('');
    const slotCert = certsByType.get(certType);
    const fd = new FormData();
    fd.append('file', file);
    try {
      if (slotCert && !slotCert.others) {
        await api.uploadCertification(slotCert.id, fd);
      } else {
        fd.append('certType', certType);
        await api.createCertification(fd);
      }
      await refresh();
    } catch (e) {
      setError(e.message || 'Upload failed');
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

      <CertSummary approved={certsApproved} pending={certsPending} actionNeeded={certsActionNeeded} total={certsTotal} />

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <div className="skeleton skeleton--card" style={{ height: 120 }} /> : CERT_TYPES.map(t => {
        const cert = certsByType.get(t);
        const others = cert && cert.others;
        const realCert = others ? null : cert;
        const status = statusFor(realCert);
        return (
          <div key={t} style={{ marginBottom: 12 }}>
            <CertCard slot={{ certType: t, cert: realCert, status, others }} onUpload={(file) => uploadFor(t, file)} />
          </div>
        );
      })}
    </div>
  );
}
