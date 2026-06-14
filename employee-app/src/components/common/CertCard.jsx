import StatusBadge from './StatusBadge';

const RENEWAL_INFO = {
  id_expiration: 'Per ID', tb_test: '1 year', cpr: '2 years', annual_training: '1 year',
  cultural_competency: '2 years', infection_control: '1 year', background_check: '5 years', other: 'Manual',
};

export default function CertCard({ cert, onUpload }) {
  const status = cert.status || 'not_submitted';
  const renewal = RENEWAL_INFO[cert.certType] || 'N/A';
  const title = cert.certType.replace(/_/g, ' ');

  let meta = '';
  if (status === 'approved' || status === 'active') {
    meta = cert.expirationDate ? `Expires: ${new Date(cert.expirationDate).toLocaleDateString()}` : 'No expiration set';
  } else if (status === 'pending') {
    meta = `Submitted: ${new Date(cert.updatedAt).toLocaleDateString()}`;
  } else if (status === 'rejected') {
    meta = cert.notes || 'Please re-upload';
  }

  const btnLabel = status === 'not_submitted' ? 'Upload' : status === 'rejected' ? 'Re-upload' : 'Upload New';

  return (
    <div className={`cert-card cert-card--${status}`}>
      <div className="cert-card-header">
        <span className="cert-card-title">{title}</span>
        <StatusBadge status={status} />
      </div>
      <span className="cert-card-renewal">Renewal: {renewal}</span>
      {meta && <p className="cert-card-meta">{meta}</p>}
      <button className="btn btn-primary btn-full cert-card-btn" onClick={onUpload}>{btnLabel}</button>
    </div>
  );
}
