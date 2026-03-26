import { useState, useEffect } from 'react';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function DashboardPage() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getClients()
            .then(setClients)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    const totalAuths = clients.reduce((s, c) => s + c.authorizations.length, 0);
    const expiredCount = clients.filter((c) => c.overallStatus === 'Expired').length;
    const renewalCount = clients.filter((c) => c.overallStatus === 'Renewal Reminder').length;
    const okCount = clients.filter((c) => c.overallStatus === 'OK').length;

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Dashboard</h1>
            </div>
            <div className="page-content">
                <div className="stats-grid">
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Total Clients</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value">{clients.length}</div>
                        <div className="card__description">Active client records</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Authorizations</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value">{totalAuths}</div>
                        <div className="card__description">Total service authorizations</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Expired</span>
                            {expiredCount > 0 && <span className="card__trend card__trend--down">{Icons.trendingDown} Needs attention</span>}
                        </div>
                        <div className="card__value" style={{ color: expiredCount > 0 ? 'hsl(0 84.2% 60.2%)' : undefined }}>{expiredCount}</div>
                        <div className="card__description">Clients with expired auths</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Active / OK</span>
                            <span className="card__trend card__trend--up">{Icons.trendingUp}</span>
                        </div>
                        <div className="card__value" style={{ color: okCount > 0 ? 'hsl(142 71% 45%)' : undefined }}>{okCount}</div>
                        <div className="card__description">{renewalCount > 0 ? `${renewalCount} renewal(s) due` : 'All auths current'}</div>
                    </div>
                </div>
            </div>
        </>
    );
}
