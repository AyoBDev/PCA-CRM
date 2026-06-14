import { useState, useEffect } from 'react';
import { api } from '../api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]; });
  const [shifts, setShifts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getWeekSchedule(weekStart), api.getScheduleHistory()])
      .then(([sched, hist]) => { setShifts(sched.shifts || []); setHistory(hist || []); })
      .finally(() => setLoading(false));
  }, [weekStart]);

  function navigateWeek(offset) { const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + offset * 7); setWeekStart(d.toISOString().split('T')[0]); }

  if (loading) return <div className="page-loading">Loading...</div>;
  const shiftsByDay = {};
  shifts.forEach(s => { const day = new Date(s.shiftDate).getDay(); if (!shiftsByDay[day]) shiftsByDay[day] = []; shiftsByDay[day].push(s); });

  return (
    <div className="schedule-page">
      <h1 className="page-title">My Schedule</h1>
      <div className="week-nav">
        <button className="btn btn-secondary" onClick={() => navigateWeek(-1)}>&larr;</button>
        <span className="week-label">Week of {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <button className="btn btn-secondary" onClick={() => navigateWeek(1)}>&rarr;</button>
      </div>
      <div className="schedule-grid">
        {DAYS.map((day, i) => (
          <div key={i} className="schedule-day">
            <div className="schedule-day-header">{day}</div>
            {shiftsByDay[i]?.map(s => (<div key={s.id} className="schedule-shift"><span className="shift-client-name">{s.client?.clientName}</span><span className="shift-times">{s.startTime} – {s.endTime}</span></div>)) || <span className="schedule-empty">—</span>}
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <div className="schedule-history">
          <h3 className="card-heading">Schedule History</h3>
          <table className="simple-table"><thead><tr><th>Period</th><th>Sent</th><th>Status</th></tr></thead><tbody>
            {history.map(h => (<tr key={h.id}><td>{new Date(h.weekStart).toLocaleDateString()}</td><td>{h.sentAt ? new Date(h.sentAt).toLocaleDateString() : '—'}</td><td>{h.confirmedAt ? 'Confirmed' : h.status}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
