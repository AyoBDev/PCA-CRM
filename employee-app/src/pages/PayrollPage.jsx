import { useState, useEffect } from 'react';
import { api } from '../api';

export default function PayrollPage() {
  const [summary, setSummary] = useState(null);
  const [stubs, setStubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { Promise.all([api.getPayrollSummary(), api.getPaystubs()]).then(([s, st]) => { setSummary(s); setStubs(st); }).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="payroll-page">
      <h1 className="page-title">Payroll</h1>
      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-tile"><span className="tile-number">${summary?.lastPaycheck?.amount || '0'}</span><span className="tile-label">Last Paycheck</span></div>
        <div className="summary-tile"><span className="tile-number">${summary?.ytdEarnings || '0'}</span><span className="tile-label">YTD Earnings</span></div>
        <div className="summary-tile"><span className="tile-number">{summary?.currentPeriodHours || '0'}</span><span className="tile-label">Hours This Period</span></div>
      </div>
      <div className="card">
        <h3 className="card-heading">Pay Stubs</h3>
        {stubs.length === 0 ? <p className="text-muted">No pay stubs available</p> : (
          <table className="simple-table"><thead><tr><th>Period</th><th>Paid</th><th>Hours</th><th>Net Pay</th></tr></thead><tbody>
            {stubs.map(s => (<tr key={s.id}><td>{new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}</td><td>{new Date(s.payDate).toLocaleDateString()}</td><td>{Number(s.totalHours)}</td><td>${Number(s.netPay).toFixed(2)}</td></tr>))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
