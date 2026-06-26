import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import AvailabilityDayRow from '../components/common/AvailabilityDayRow';
import TimeOffRequestRow from '../components/common/TimeOffRequestRow';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT = { on: false, in: '', out: '' };

function emptySchedule() { return Object.fromEntries(DAYS.map(d => [d, { ...DEFAULT }])); }

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [form, setForm] = useState(emptySchedule());
  const [timeOff, setTimeOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Save weekly schedule');
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [toStart, setToStart] = useState('');
  const [toEnd, setToEnd] = useState('');
  const [toReason, setToReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([api.getAvailability(), api.getTimeOffRequests()]).then(([a, t]) => {
      if (a.status === 'fulfilled' && a.value) {
        const raw = a.value.schedule || a.value;
        const next = emptySchedule();
        for (const d of DAYS) if (raw && raw[d]) next[d] = { on: !!raw[d].on, in: raw[d].in || '', out: raw[d].out || '' };
        setServer(next);
        setForm(next);
        if (a.value.pendingReview || a.value.status === 'pending') setSaveLabel('Request schedule change');
      } else {
        setServer(emptySchedule());
      }
      if (t.status === 'fulfilled') setTimeOff(Array.isArray(t.value) ? t.value : (t.value && t.value.requests) || []);
      setLoading(false);
    });
  }, []);

  const dirty = useMemo(() => server && JSON.stringify(server) !== JSON.stringify(form), [server, form]);

  async function save() {
    setSubmitting(true);
    setError('');
    try {
      await api.submitAvailabilityRequest({ requestedChanges: form });
      setServer(form);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTimeOff() {
    if (!toStart || !toEnd) return;
    setError('');
    const optimistic = { id: `tmp-${Date.now()}`, startDate: toStart, endDate: toEnd, reason: toReason, status: 'pending' };
    setTimeOff([optimistic, ...timeOff]);
    try {
      const saved = await api.submitTimeOff({ startDate: toStart, endDate: toEnd, reason: toReason });
      setTimeOff(prev => [saved, ...prev.filter(r => r.id !== optimistic.id)]);
      setToStart(''); setToEnd(''); setToReason(''); setShowTimeOff(false);
    } catch (e) {
      setError(e.message || 'Time-off submit failed');
      setTimeOff(prev => prev.filter(r => r.id !== optimistic.id));
    }
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Availability</h2>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <h3 className="day-header" style={{ marginTop: 0 }}>Weekly Availability</h3>
      {DAYS.map(d => (
        <AvailabilityDayRow key={d} day={d} value={form[d]} onChange={v => setForm(prev => ({ ...prev, [d]: v }))} />
      ))}
      <button type="button" className="btn btn--primary" disabled={!dirty || submitting} onClick={save} style={{ marginTop: 12 }}>
        {submitting ? 'Saving…' : saveLabel}
      </button>

      <h3 className="day-header">Time-Off Requests</h3>
      {timeOff.length === 0 && <div className="empty-state__text">No time-off requests</div>}
      {timeOff.map(r => <TimeOffRequestRow key={r.id} request={r} />)}

      {showTimeOff ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="form-group"><label>Start</label><input type="date" value={toStart} onChange={e => setToStart(e.target.value)} /></div>
          <div className="form-group"><label>End</label><input type="date" value={toEnd} onChange={e => setToEnd(e.target.value)} /></div>
          <div className="form-group"><label>Reason</label><input type="text" value={toReason} onChange={e => setToReason(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--outline" onClick={() => setShowTimeOff(false)}>Cancel</button>
            <button type="button" className="btn btn--primary" onClick={submitTimeOff}>Submit</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--outline btn--full" style={{ marginTop: 12 }} onClick={() => setShowTimeOff(true)}>
          + Request time off
        </button>
      )}
    </div>
  );
}
