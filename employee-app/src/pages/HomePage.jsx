import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

export default function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [nextShift, setNextShift] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getHomeSummary(), api.getNextShift(), api.getActivity()])
      .then(([s, ns, a]) => { setSummary(s); setNextShift(ns); setActivity(a); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  const firstName = user?.name?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="home-page">
      <h1 className="home-greeting">Good morning, {firstName}</h1>
      <p className="home-date">{today}</p>
      {summary?.requirementsOverdue > 0 && (
        <Link to="/requirements" className="compliance-banner">
          <strong>Compliance Alert:</strong> You have {summary.requirementsOverdue} expired certification(s). You cannot clock in via EVV until resolved.
        </Link>
      )}
      <div className="summary-grid">
        <div className="summary-tile"><span className="tile-number">{summary?.shiftsThisWeek || 0}</span><span className="tile-label">Shifts this week</span></div>
        <div className="summary-tile"><span className="tile-number">{summary?.hoursScheduled || 0}</span><span className="tile-label">Hours scheduled</span></div>
        <div className="summary-tile"><span className="tile-number">{summary?.requirementsOverdue || 0}</span><span className="tile-label">Certs overdue</span></div>
        <div className="summary-tile"><span className="tile-number">{summary?.openTasks || 0}</span><span className="tile-label">Open tasks</span></div>
      </div>
      {nextShift && (
        <div className="next-shift-card">
          <h3 className="card-heading">Next Shift</h3>
          <p className="shift-client">{nextShift.clientName}</p>
          <p className="shift-time">{new Date(nextShift.shiftDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {nextShift.startTime} – {nextShift.endTime}</p>
          <span className="shift-service">{nextShift.serviceCode}</span>
        </div>
      )}
      {activity.length > 0 && (
        <div className="activity-section">
          <h3 className="card-heading">Recent Activity</h3>
          <ul className="activity-list">
            {activity.map(a => (
              <li key={a.id} className="activity-item">
                <span className="activity-title">{a.title}</span>
                <span className="activity-time">{new Date(a.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
