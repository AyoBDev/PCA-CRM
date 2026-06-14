import { useState, useEffect } from 'react';
import { api } from '../api';

const REASONS = ['vacation', 'sick_leave', 'personal', 'medical'];

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState(null);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [form, setForm] = useState({ dateFrom: '', dateTo: '', reason: 'vacation' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.getAvailability().then(d => setAvailability(d.availability)); api.getTimeOffRequests().then(setTimeOffRequests); }, []);

  async function handleTimeOffSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try { await api.submitTimeOff(form); const updated = await api.getTimeOffRequests(); setTimeOffRequests(updated); setShowTimeOff(false); setForm({ dateFrom: '', dateTo: '', reason: 'vacation' }); } finally { setSubmitting(false); }
  }

  return (
    <div className="availability-page">
      <h1 className="page-title">Availability & Time Off</h1>
      <div className="card">
        <h3 className="card-heading">Current Availability</h3>
        {availability ? <pre className="availability-summary">{JSON.stringify(availability, null, 2)}</pre> : <p className="text-muted">No availability set</p>}
        <button className="btn btn-secondary" style={{ marginTop: 8 }}>Request a Change</button>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header-row"><h3 className="card-heading">Time Off Requests</h3><button className="btn btn-primary" onClick={() => setShowTimeOff(true)}>Request Time Off</button></div>
        {timeOffRequests.length === 0 ? <p className="text-muted">No requests</p> : (
          <table className="simple-table"><thead><tr><th>From</th><th>To</th><th>Reason</th><th>Status</th></tr></thead><tbody>
            {timeOffRequests.map(r => (<tr key={r.id}><td>{new Date(r.dateFrom).toLocaleDateString()}</td><td>{new Date(r.dateTo).toLocaleDateString()}</td><td>{r.reason.replace(/_/g, ' ')}</td><td><span className={`status-badge badge--${r.status === 'approved' ? 'green' : r.status === 'declined' ? 'red' : 'amber'}`}>{r.status}</span></td></tr>))}
          </tbody></table>
        )}
      </div>
      {showTimeOff && (
        <div className="modal-overlay" onClick={() => setShowTimeOff(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Request Time Off</h2>
            <form onSubmit={handleTimeOffSubmit}>
              <label className="field-label">From</label><input type="date" className="field-input" value={form.dateFrom} onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} required />
              <label className="field-label">To</label><input type="date" className="field-input" value={form.dateTo} onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} required />
              <label className="field-label">Reason</label><select className="field-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>{REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowTimeOff(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
