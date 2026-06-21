import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function hhmm12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function getServiceClass(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  if (c.includes('PCS') || c.includes('PAS')) return 'pas';
  if (c.includes('S5130') || c.includes('S5120') || c.includes('HOMEMAKER')) return 'homemaker';
  if (c.includes('S5150') || c.includes('RESPITE')) return 'respite';
  if (c.includes('S5135') || c.includes('COMPANION')) return 'companion';
  return 'pas';
}

function getSunday(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().split('T')[0];
}

function formatWeekLabel(sunday) {
  const start = new Date(sunday + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function SchedulePage() {
  const [sunday, setSunday] = useState(getSunday(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const fetchShifts = useCallback(() => {
    setLoading(true);
    api.getWeekSchedule(sunday)
      .then(data => setShifts(data.shifts || data || []))
      .finally(() => setLoading(false));
  }, [sunday]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  const prevWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() - 7); setSunday(d.toISOString().split('T')[0]); };
  const nextWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() + 7); setSunday(d.toISOString().split('T')[0]); };

  const grouped = {};
  for (const s of shifts) {
    const d = (s.shiftDate || '').split('T')[0];
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  }
  const sortedDays = Object.keys(grouped).sort();

  return (
    <div>
      <div className="week-nav">
        <button className="week-nav__arrow" onClick={prevWeek}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className="week-nav__label">{formatWeekLabel(sunday)}</span>
        <button className="week-nav__arrow" onClick={nextWeek}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {loading ? (
        <div className="page-loading">Loading...</div>
      ) : sortedDays.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <p className="empty-state__text">No shifts this week</p>
        </div>
      ) : (
        sortedDays.map(day => (
          <div key={day}>
            <h3 className="day-header">
              {new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grouped[day].map(shift => (
                <div
                  key={shift.id}
                  className={`shift-card shift-card--${getServiceClass(shift.serviceCode)}`}
                  onClick={() => setExpanded(expanded === shift.id ? null : shift.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="shift-card__client">{shift.client?.clientName || shift.clientName}</span>
                    <span className={`badge badge--${getServiceClass(shift.serviceCode)}`}>{shift.serviceCode}</span>
                  </div>
                  <p className="shift-card__time">{hhmm12(shift.startTime)} – {hhmm12(shift.endTime)}</p>
                  {shift.client?.address && (
                    <a href={mapsUrl(shift.client.address)} target="_blank" rel="noopener" className="shift-card__address" onClick={e => e.stopPropagation()}>
                      {shift.client.address}
                    </a>
                  )}
                  <div className={`shift-card__details ${expanded === shift.id ? 'shift-card__details--open' : ''}`}>
                    {shift.client?.phone && (
                      <p className="shift-card__detail-row">
                        <span className="shift-card__detail-label">Phone:</span>
                        <a href={`tel:${shift.client.phone}`}>{shift.client.phone}</a>
                      </p>
                    )}
                    {shift.client?.gateCode && (
                      <p className="shift-card__detail-row">
                        <span className="shift-card__detail-label">Gate Code:</span>{shift.client.gateCode}
                      </p>
                    )}
                    {shift.notes && (
                      <p className="shift-card__detail-row">
                        <span className="shift-card__detail-label">Notes:</span>{shift.notes}
                      </p>
                    )}
                    {shift.client?.address && (
                      <a href={mapsUrl(shift.client.address)} target="_blank" rel="noopener" className="btn btn--primary btn--sm" style={{ marginTop: 8, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        Navigate
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
