import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function PayStubsPage() {
  const navigate = useNavigate();
  const [stubs, setStubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPaystubs().then(data => setStubs(data || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Pay Stubs</h2>
      </div>
      {loading ? <div className="page-loading">Loading...</div> : stubs.length === 0 ? (
        <div className="empty-state"><p className="empty-state__text">No pay stubs yet</p></div>
      ) : stubs.map(stub => (
        <div key={stub.id} className="paystub-card">
          <div className="paystub-card__period">
            {new Date(stub.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(stub.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="paystub-card__amounts">
            <div><div className="paystub-card__item">Gross</div><div className="paystub-card__value">${Number(stub.grossEarnings || 0).toFixed(2)}</div></div>
            <div><div className="paystub-card__item">Net</div><div className="paystub-card__value">${Number(stub.netPay || 0).toFixed(2)}</div></div>
            <div><div className="paystub-card__item">Hours</div><div className="paystub-card__value">{stub.totalHours || 0}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}
