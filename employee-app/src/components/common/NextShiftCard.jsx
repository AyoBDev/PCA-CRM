import { hhmm12 } from '../../utils/timeFormat';

function getServiceClass(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  if (c.includes('PCS') || c.includes('PAS')) return 'pas';
  if (c.includes('S5130') || c.includes('S5120') || c.includes('HOMEMAKER')) return 'homemaker';
  if (c.includes('S5150') || c.includes('RESPITE')) return 'respite';
  if (c.includes('S5135') || c.includes('COMPANION')) return 'companion';
  return 'pas';
}

function formatShiftTime(shift) {
  const date = new Date(shift.shiftDate);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const prefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${prefix} ${hhmm12(shift.startTime)} – ${hhmm12(shift.endTime)}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function NextShiftCard({ shift }) {
  if (!shift) {
    return (
      <div className="empty-state" style={{ marginBottom: 16 }}>
        <div className="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </div>
        <p className="empty-state__text">No shifts scheduled</p>
      </div>
    );
  }
  const svc = getServiceClass(shift.serviceCode);
  return (
    <div className={`shift-card shift-card--${svc}`} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="shift-card__client" style={{ fontSize: 18 }}>{shift.clientName}</span>
        <span className={`badge badge--${svc}`}>{shift.serviceCode}</span>
      </div>
      <p className="shift-card__time">{formatShiftTime(shift)}</p>
      {shift.address && (
        <a href={mapsUrl(shift.address)} target="_blank" rel="noopener" className="shift-card__address">{shift.address}</a>
      )}
      {shift.address && (
        <a href={mapsUrl(shift.address)} target="_blank" rel="noopener" className="btn btn--primary" style={{ marginTop: 14, textDecoration: 'none' }}>Navigate</a>
      )}
    </div>
  );
}
