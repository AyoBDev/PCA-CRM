import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';

export default function ComplianceBanner() {
  const { complianceState, certsActionNeeded } = useNotifications();
  if (complianceState !== 'overdue') return null;
  return (
    <Link to="/account/certs" className="alert-banner alert-banner--danger" style={{ marginBottom: 12 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {certsActionNeeded} certification{certsActionNeeded === 1 ? '' : 's'} need attention — tap to fix
    </Link>
  );
}
