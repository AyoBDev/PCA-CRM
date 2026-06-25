export default function NotificationCountPill({ count }) {
  if (!count || count <= 0) return null;
  return <span className="notification-pill" aria-label={`${count} action items`}>{count}</span>;
}
