import { useNotifications } from '../../hooks/useNotifications';

const LABELS = { compliant: 'Compliant', attention: 'Attention', overdue: 'Action Needed' };

export default function ComplianceBadge() {
  const { complianceState } = useNotifications();
  return (
    <span className={`compliance-badge compliance-badge--${complianceState}`}>
      {LABELS[complianceState] || ''}
    </span>
  );
}
