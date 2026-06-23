import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const DAY_LABELS = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAvailability().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  const schedule = data?.weeklySchedule || {};

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Availability</h2>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        {Object.entries(DAY_LABELS).map(([key, label]) => {
          const day = schedule[key];
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid hsl(var(--border))' }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
              <span style={{ fontSize: 13, color: day?.available ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                {day?.available ? `${day.start} – ${day.end}` : 'Off'}
              </span>
            </div>
          );
        })}
      </div>
      {data?.maxHoursPerWeek && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13 }}><strong>Max hours/week:</strong> {data.maxHoursPerWeek}</p>
          <p style={{ fontSize: 13 }}><strong>Max clients:</strong> {data.maxConcurrentClients}</p>
          <p style={{ fontSize: 13 }}><strong>Max travel:</strong> {data.maxTravelDistance} min</p>
          <p style={{ fontSize: 13 }}><strong>Transport:</strong> {data.transportation}</p>
        </div>
      )}
    </div>
  );
}
