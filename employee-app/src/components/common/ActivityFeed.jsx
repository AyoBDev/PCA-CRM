import { useState } from 'react';
import ActivityFeedItem from './ActivityFeedItem';

export default function ActivityFeed({ items = [], limit = 5 }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) {
    return <div className="activity-feed activity-feed--empty">No recent activity</div>;
  }
  const visible = expanded ? items : items.slice(0, limit);
  const showToggle = !expanded && items.length > limit;
  return (
    <div className="activity-feed">
      {visible.map((item, idx) => <ActivityFeedItem key={item.id || idx} item={item} />)}
      {showToggle && (
        <button type="button" className="btn btn--ghost" onClick={() => setExpanded(true)}>
          See more
        </button>
      )}
    </div>
  );
}
