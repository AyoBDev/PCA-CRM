import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

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
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const prefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${prefix} ${hhmm12(shift.startTime)} – ${hhmm12(shift.endTime)}`;
}

function hhmm12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [nextShift, setNextShift] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getHomeSummary(), api.getNextShift()])
      .then(([s, ns]) => { setSummary(s); setNextShift(ns); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hi, {firstName}</h1>
      </div>

      {nextShift ? (
        <div className={`shift-card shift-card--${getServiceClass(nextShift.serviceCode)}`} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="shift-card__client" style={{ fontSize: 18 }}>{nextShift.clientName}</span>
            <span className={`badge badge--${getServiceClass(nextShift.serviceCode)}`}>{nextShift.serviceCode}</span>
          </div>
          <p className="shift-card__time">{formatShiftTime(nextShift)}</p>
          {nextShift.address && (
            <a href={mapsUrl(nextShift.address)} target="_blank" rel="noopener" className="shift-card__address">
              {nextShift.address}
            </a>
          )}
          {nextShift.address && (
            <a href={mapsUrl(nextShift.address)} target="_blank" rel="noopener" className="btn btn--primary" style={{ marginTop: 14, textDecoration: 'none' }}>
              Navigate
            </a>
          )}
        </div>
      ) : (
        <div className="empty-state" style={{ marginBottom: 16 }}>
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <p className="empty-state__text">No shifts scheduled</p>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <span className="stat-pill">{summary?.shiftsThisWeek || 0} shifts this week</span>
        <span className="stat-pill">{summary?.hoursScheduled || 0} hrs scheduled</span>
        <Link to="/messages" className="stat-pill stat-pill--link">{summary?.unreadMessages || 0} message(s)</Link>
      </div>

      {summary?.requirementsOverdue > 0 && (
        <Link to="/account/certs" className="alert-banner alert-banner--danger" style={{ marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {summary.requirementsOverdue} expired certification(s) — action required
        </Link>
      )}
    </div>
  );
}
