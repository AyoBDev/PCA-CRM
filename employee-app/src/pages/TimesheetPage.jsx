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

  const pcaFormUrl = data?.token ? `/api/pca-form/${data.token}?weekStart=${sunday}` : null;
  const externalFormUrl = data?.token ? `${window.location.origin.replace(':5174', ':4000')}/pca-form/${data.token}` : null;

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
      ) : data?.noLink ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <p className="empty-state__text">{data.message}</p>
        </div>
      ) : (
        <div>
          <div className="ts-status-bar">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Timesheet for {data?.client?.name}</div>
              <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>PCA: {data?.pcaName}</div>
            </div>
            <span className={`badge badge--${statusClass}`}>{statusLabel}</span>
          </div>

          {data?.timesheet?.id && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>PAS Hours</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{data.timesheet.totalPasHours || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Homemaker Hours</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{data.timesheet.totalHmHours || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Respite Hours</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{data.timesheet.totalRespiteHours || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Companion Hours</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{data.timesheet.totalCompanionHours || 0}</span>
              </div>
            </div>
          )}

          {externalFormUrl && (
            <a href={externalFormUrl} target="_blank" rel="noopener" className="btn btn--primary" style={{ textDecoration: 'none' }}>
              {data?.timesheet?.id ? 'Edit Timesheet' : 'Start Timesheet'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
