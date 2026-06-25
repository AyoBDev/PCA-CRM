const BADGE_CLASS = { pending: 'badge--warning', approved: 'badge--success', denied: 'badge--danger' };

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimeOffRequestRow({ request }) {
  const cls = BADGE_CLASS[request.status] || 'badge--muted';
  const range = request.startDate === request.endDate ? fmt(request.startDate) : `${fmt(request.startDate)} – ${fmt(request.endDate)}`;
  return (
    <div className="timeoff-row">
      <div className="timeoff-row__dates">{range}</div>
      {request.reason && <div className="timeoff-row__reason">{request.reason}</div>}
      <span className={`badge ${cls}`}>{request.status}</span>
    </div>
  );
}
