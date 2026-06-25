import { Link } from 'react-router-dom';

const ICONS = {
  'new-shift': '📅',
  'shift-changed': '📅',
  'admin-message': '💬',
  'cert-uploaded': '📋',
  'cert-approved': '✅',
  'cert-rejected': '⚠️',
  'task-assigned': '✅',
  'time-off-decided': '🌴',
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
      <span className="activity-item__icon" aria-hidden>{ICONS[item.type] || '•'}</span>
      <span className="activity-item__body">
        <strong>{item.title}</strong>
        {item.subtitle && <span>{item.subtitle}</span>}
      </span>
      <span className="activity-item__time">{timeAgo(item.timestamp)}</span>
    </>
  );
  return item.href ? <Link to={item.href} className="activity-item">{body}</Link> : <div className="activity-item">{body}</div>;
}
