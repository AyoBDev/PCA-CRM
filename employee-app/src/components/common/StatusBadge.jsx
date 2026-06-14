const STATUS_CONFIG = {
  approved: { label: 'Approved', className: 'badge--green' },
  active: { label: 'Approved', className: 'badge--green' },
  pending: { label: 'Pending Review', className: 'badge--amber' },
  rejected: { label: 'Needs Correction', className: 'badge--red' },
  not_submitted: { label: 'Not Submitted', className: 'badge--gray' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_submitted;
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
