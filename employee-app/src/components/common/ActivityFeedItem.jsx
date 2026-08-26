import { Link } from 'react-router-dom';
import CertIcons from './CertIcons';

const ICONS = {
  'new-shift': CertIcons.calendar,
  'shift-changed': CertIcons.calendar,
  'admin-message': CertIcons.mail,
  'cert-uploaded': CertIcons.fileText,
  'cert-approved': CertIcons.checkCircle,
  'cert-rejected': CertIcons.alertTriangle,
  'task-assigned': CertIcons.checkCircle,
  'time-off-decided': CertIcons.calendar,
};

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ActivityFeedItem({ item }) {
  const body = (
    <>
      <span className="activity-item__icon" aria-hidden>{ICONS[item.type] || CertIcons.bell}</span>
      <span className="activity-item__body">
        <strong>{item.title}</strong>
        {item.subtitle && <span>{item.subtitle}</span>}
      </span>
      <span className="activity-item__time">{timeAgo(item.timestamp)}</span>
    </>
  );
  return item.href ? <Link to={item.href} className="activity-item">{body}</Link> : <div className="activity-item">{body}</div>;
}
