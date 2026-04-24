import { useState, useEffect } from 'react';
import Icons from '../components/common/Icons';
import * as api from '../api';


export default function DashboardPage() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getDashboardStats()
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    if (!stats) return <div style={{ padding: 48, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Unable to load dashboard data.</div>;

    const expiredAuths = stats.expiringAuths.filter(a => a.status === 'Expired');
    const renewalAuths = stats.expiringAuths.filter(a => a.status === 'Renewal Reminder');

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Dashboard</h1>
            </div>
            <div className="page-content">
                {/* Row 1: People */}
                <div className="stats-grid">
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Clients</span>
                            <span className="card__icon">{Icons.users}</span>
                        </div>
                        <div className="card__value">{stats.activeClients}</div>
                        <div className="card__description">Active client records</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Employees</span>
                            <span className="card__icon">{Icons.user}</span>
                        </div>
                        <div className="card__value">{stats.activeEmployees}</div>
                        <div className="card__description">Active caregivers</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Today's Shifts</span>
                            <span className="card__icon">{Icons.calendar}</span>
                        </div>
                        <div className="card__value">{stats.todayShifts}</div>
                        <div className="card__description">Scheduled for today</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">This Week</span>
                            <span className="card__icon">{Icons.clock}</span>
                        </div>
                        <div className="card__value">{stats.weekHours}h</div>
                        <div className="card__description">{stats.weekUnits} units scheduled</div>
                    </div>
                </div>

                {/* Row 2: Timesheets & Payroll */}
                <div className="stats-grid" style={{ marginTop: 16 }}>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Draft Timesheets</span>
                            <span className="card__icon">{Icons.fileText}</span>
                        </div>
                        <div className="card__value" style={{ color: stats.timesheetDraft > 0 ? 'hsl(var(--warning))' : undefined }}>{stats.timesheetDraft}</div>
                        <div className="card__description">Awaiting completion</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Submitted Timesheets</span>
                            <span className="card__icon">{Icons.checkCircle}</span>
                        </div>
                        <div className="card__value" style={{ color: stats.timesheetSubmitted > 0 ? 'hsl(var(--success))' : undefined }}>{stats.timesheetSubmitted}</div>
                        <div className="card__description">Signed and submitted</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Unconfirmed Schedules</span>
                            <span className="card__icon">{Icons.alertTriangle}</span>
                        </div>
                        <div className="card__value" style={{ color: stats.unconfirmedCount > 0 ? 'hsl(var(--destructive))' : undefined }}>{stats.unconfirmedCount}</div>
                        <div className="card__description">Pending employee confirmation</div>
                    </div>
                    <div className="card">
                        <div className="card__header">
                            <span className="card__title">Auth Alerts</span>
                            {stats.expiringAuths.length > 0 && <span className="card__trend card__trend--down">{Icons.trendingDown}</span>}
                        </div>
                        <div className="card__value" style={{ color: expiredAuths.length > 0 ? 'hsl(var(--destructive))' : renewalAuths.length > 0 ? 'hsl(var(--warning))' : 'hsl(var(--success))' }}>
                            {stats.expiringAuths.length || 0}
                        </div>
                        <div className="card__description">
                            {expiredAuths.length > 0 ? `${expiredAuths.length} expired` : ''}
                            {expiredAuths.length > 0 && renewalAuths.length > 0 ? ', ' : ''}
                            {renewalAuths.length > 0 ? `${renewalAuths.length} renewal(s) due` : ''}
                            {stats.expiringAuths.length === 0 ? 'All authorizations current' : ''}
                        </div>
                    </div>
                </div>

            </div>
        </>
    );
}
