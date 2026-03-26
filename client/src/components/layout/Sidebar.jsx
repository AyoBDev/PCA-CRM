import { useState } from 'react';
import Icons from '../common/Icons';

export default function Sidebar({ activePage, onNavigate, user, onLogout }) {
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    const isAdmin = user?.role === 'admin';

    const handleToggle = () => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebarCollapsed', String(next));
            return next;
        });
    };

    return (
        <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
            <button
                className="sidebar__collapse-btn"
                onClick={handleToggle}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {Icons.chevronLeft}
            </button>

            <div className="sidebar__header">
                <div className="sidebar__logo">{Icons.shieldCheck}</div>
                <div className="sidebar__brand-info">
                    <div className="sidebar__brand-name">NV Best PCA</div>
                    <div className="sidebar__brand-sub">Auth Tracker</div>
                </div>
            </div>

            <nav className="sidebar__nav">
                <div className="sidebar__section-label">Home</div>
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'dashboard' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('dashboard')} title="Dashboard">
                        {Icons.layoutDashboard} Dashboard
                    </button>
                )}
                <button className={`sidebar__nav-item ${activePage === 'timesheets' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('timesheets')} title="Timesheets">
                    {Icons.fileText} Timesheets
                </button>
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'scheduling' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('scheduling')} title="Scheduling">
                        {Icons.calendar} Scheduling
                    </button>
                )}
                {isAdmin && (
                    <button className={`sidebar__nav-item ${activePage === 'payroll' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('payroll')} title="Payroll">
                        {Icons.dollarSign} Payroll
                    </button>
                )}
            </nav>

            <div className="sidebar__footer">
                {isAdmin && (
                    <>
                        <div className="sidebar__section-label">Settings</div>
                        <button className={`sidebar__nav-item ${activePage === 'insuranceTypes' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('insuranceTypes')} title="Insurance Types">
                            {Icons.shieldCheck} Insurance Types
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'services' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('services')} title="Services">
                            {Icons.fileText} Services
                        </button>
                        <button className={`sidebar__nav-item ${activePage === 'users' ? 'sidebar__nav-item--active' : ''}`} onClick={() => onNavigate('users')} title="Users">
                            {Icons.user} Users
                        </button>
                    </>
                )}
                <div className="separator" style={{ margin: '8px 12px' }} />
                <div className="sidebar__user" title={user?.name}>
                    <div className="sidebar__avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
                    <div className="sidebar__user-info">
                        <div className="sidebar__user-name">{user?.name || 'User'}</div>
                        <div className="sidebar__user-email">{user?.email}</div>
                    </div>
                </div>
                <button className="btn btn--outline btn--sm" style={{ margin: '8px 12px', width: 'calc(100% - 24px)' }} onClick={onLogout} title="Sign Out">
                    {Icons.logOut} Sign Out
                </button>
            </div>
        </aside>
    );
}
