import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CertCard from '../components/common/CertCard';
import UploadModal from '../components/common/UploadModal';

export default function RequirementsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadCert, setUploadCert] = useState(null);

  const load = useCallback(() => { api.getCertifications().then(setData).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  async function handleUpload(formData) { await api.uploadCertification(uploadCert.id, formData); load(); }

  if (loading) return <div className="page-loading">Loading...</div>;
  const { certifications, summary } = data || { certifications: [], summary: {} };

  return (
    <div className="requirements-page">
      <h1 className="page-title">Requirements</h1>
      <div className="cert-summary-bar">
        <span className="cert-summary-item cert-summary--green">{summary.approved} Approved</span>
        <span className="cert-summary-item cert-summary--amber">{summary.pending} Pending</span>
        <span className="cert-summary-item cert-summary--red">{summary.actionNeeded} Action Needed</span>
        <span className="cert-summary-item">{summary.total} Total</span>
      </div>
      <div className="cert-grid">
        {certifications.map(cert => (<CertCard key={cert.id} cert={cert} onUpload={() => setUploadCert(cert)} />))}
      </div>
      {uploadCert && <UploadModal certType={uploadCert.certType} onClose={() => setUploadCert(null)} onUpload={handleUpload} />}
    </div>
  );
}
