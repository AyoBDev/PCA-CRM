import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../components/common/Icons';
import * as api from '../api';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';

export default function DashboardPage() {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [taskSummary, setTaskSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [backingUp, setBackingUp] = useState(false);

    useEffect(() => {
        api.getDashboardStats()
            .then(setStats)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
        api.getTaskSummary().then(setTaskSummary).catch(() => {});
    }, []);

    if (loading) return <div className="page-loading text-muted">Loading…</div>;

    if (error || !stats) return (
        <div className="page-error">
            <div className="page-error__icon">{Icons.alertTriangle}</div>
            <div className="page-error__title">Unable to load dashboard</div>
            <div className="page-error__desc">{error || 'An unexpected error occurred.'}</div>
            <button className="btn btn--outline" onClick={() => window.location.reload()}>Retry</button>
        </div>
    );

    const expiredCount = stats.expiredClientCount || 0;
    const renewalCount = stats.renewalClientCount || 0;

    const attentionItems = [];
    if (expiredCount > 0) attentionItems.push({ icon: Icons.alertTriangle, label: `${expiredCount} client${expiredCount > 1 ? 's' : ''} with expired authorization`, severity: 'destructive', action: () => navigate('/authorizations') });
    if (stats.unconfirmedCount > 0) attentionItems.push({ icon: Icons.alertTriangle, label: `${stats.unconfirmedCount} unconfirmed schedule${stats.unconfirmedCount > 1 ? 's' : ''}`, severity: 'warning', action: () => navigate('/scheduling') });
    if (renewalCount > 0) attentionItems.push({ icon: Icons.clock, label: `${renewalCount} client${renewalCount > 1 ? 's' : ''} with authorization renewal due`, severity: 'warning', action: () => navigate('/authorizations') });
    if (stats.timesheetDraft > 0) attentionItems.push({ icon: Icons.fileText, label: `${stats.timesheetDraft} draft timesheet${stats.timesheetDraft > 1 ? 's' : ''} awaiting completion`, severity: 'warning', action: () => navigate('/timesheets') });
    if (stats.overdueTimesheets?.count > 0) attentionItems.push({ icon: Icons.clock, label: `${stats.overdueTimesheets.count} timesheet${stats.overdueTimesheets.count > 1 ? 's' : ''} overdue`, severity: 'destructive', action: () => navigate('/timesheets?status=overdue') });
    if (taskSummary?.overdue > 0) attentionItems.push({ icon: Icons.alertCircle, label: `${taskSummary.overdue} overdue task${taskSummary.overdue > 1 ? 's' : ''}`, severity: 'destructive', action: () => navigate('/tasks') });
    if (taskSummary?.dueToday > 0) attentionItems.push({ icon: Icons.checkSquare, label: `${taskSummary.dueToday} task${taskSummary.dueToday > 1 ? 's' : ''} due today`, severity: 'warning', action: () => navigate('/tasks') });

    return (
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.layoutDashboard}</div>
                    <div>
                        <div className="page-hero__title">Dashboard</div>
                        <div className="page-hero__subtitle">Overview of agency operations</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    {attentionItems.length > 0 && (
                        <button className="btn btn--ghost btn--icon notification-bell" onClick={() => document.getElementById('notifications-section')?.scrollIntoView({ behavior: 'smooth' })}>
                            {Icons.bell}
                            <span className="notification-bell__badge">{attentionItems.length}</span>
                        </button>
                    )}
                    {isAdmin && <button className="btn btn--outline" disabled={backingUp} onClick={async () => { setBackingUp(true); try { await api.downloadBackup(); } catch (e) { alert(e.message); } setBackingUp(false); }}>{Icons.download} {backingUp ? 'Exporting...' : 'Backup'}</button>}
                    {isAdmin && <ActivityButton />}
                </div>
            </div>
            <div className="page-content">
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
                            <span className="card__title">Timesheets</span>
                            <span className="card__icon">{Icons.clipboard}</span>
                        </div>
                        <div className="card__value">{stats.timesheetSubmitted}</div>
                        <div className="card__description">Submitted this period</div>
                    </div>
                </div>

                {attentionItems.length > 0 && (
                    <div className="attention-section" id="notifications-section">
                        <div className="attention-section__header">
                            {Icons.bell}
                            <span>Notifications</span>
                        </div>
                        <div className="attention-section__items">
                            {attentionItems.map((item, i) => (
                                <button key={i} className={`attention-item attention-item--${item.severity}`} onClick={item.action}>
                                    <span className="attention-item__icon">{item.icon}</span>
                                    <span className="attention-item__label">{item.label}</span>
                                    <span className="attention-item__arrow">{Icons.chevronRight}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
