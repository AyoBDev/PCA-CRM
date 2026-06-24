import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

export default function TimesheetPage() {
  const [sunday, setSunday] = useState(getSunday(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.getTimesheet(sunday).then(setData).finally(() => setLoading(false));
  }, [sunday]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() - 7); setSunday(d.toISOString().split('T')[0]); };
  const nextWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() + 7); setSunday(d.toISOString().split('T')[0]); };

  const statusLabel = data?.timesheet?.status === 'submitted' ? 'Submitted' : data?.timesheet?.status === 'draft' ? 'Draft' : 'New';
  const statusClass = data?.timesheet?.status === 'submitted' ? 'success' : data?.timesheet?.status === 'draft' ? 'warning' : 'muted';

  const formUrl = data?.token ? `/pca-form/${data.token}?weekStart=${sunday}` : null;

  return (
    <div>
      {loading ? (
        <div className="page-loading">Loading...</div>
      ) : data?.noLink ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <p className="empty-state__text">{data.message}</p>
        </div>
      ) : formUrl ? (
        <iframe
          src={formUrl}
          title="Timesheet"
          style={{
            width: '100%',
            height: 'calc(100dvh - var(--nav-height) - env(safe-area-inset-bottom, 0px) - 16px)',
            border: 'none',
            borderRadius: 12,
            background: 'white',
          }}
        />
      ) : null}
    </div>
  );
}
