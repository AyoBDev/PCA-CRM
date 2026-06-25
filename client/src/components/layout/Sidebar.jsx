import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icons from '../common/Icons';
import { useAuth } from '../../hooks/useAuth';
import { useMessaging } from '../../contexts/MessagingContext';

// Map route paths to page keys for active state
const PATH_TO_PAGE = {
    '/dashboard': 'dashboard',
    '/clients': 'clients',
    '/authorizations': 'authorizations',
    '/timesheets': 'timesheets',
    '/permanent-links': 'permanentLinks',
    '/scheduling': 'scheduling',
    '/tasks': 'tasks',
    '/messages': 'messages',
    '/payroll': 'payroll',
    '/receipts': 'receipts',
    '/employees': 'employees',
    '/insurance-types': 'insuranceTypes',
    '/services': 'services',
    '/users': 'users',
    '/history': 'history',
    '/sandata': 'sandata',
    '/files': 'files',
};

export default function Sidebar({ onMobileClose }) {
    const { user, isAdmin, isOffice, isStaff, hasPermission, logout } = useAuth();
    const { unreadConversations } = useMessaging();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    const activePage = PATH_TO_PAGE[location.pathname]
        || (location.pathname.startsWith('/payroll') ? 'payroll' : '')
        || (location.pathname.startsWith('/clients/') ? 'clients' : '');

    const handleToggle = () => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebarCollapsed', String(next));
            window.dispatchEvent(new Event('sidebarToggle'));
            return next;
        });
    };

    const nav = (path) => {
        navigate(path);
        if (onMobileClose) onMobileClose();
    };

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} role="navigation" aria-label="Main navigation">
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
                    <div className="sidebar__brand-name">PCAlink</div>
                    <div className="sidebar__brand-sub">Service Delivery</div>
                </div>
            </div>

            <nav className="sidebar__nav">
                <div className="sidebar__section-label">Home</div>
                {isStaff && (
                    <button className={`sidebar__nav-item ${activePage === 'dashboard' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/dashboard')} title="Dashboard">
                        {Icons.layoutDashboard} Dashboard
                    </button>
                )}
                {hasPermission('clients') && (
                    <button className={`sidebar__nav-item ${activePage === 'clients' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/clients')} title="Clients">
                        {Icons.users} Clients
                    </button>
                )}
                {hasPermission('authorizations') && (
                    <button className={`sidebar__nav-item sidebar__nav-item--sub ${activePage === 'authorizations' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/authorizations')} title="Authorizations">
                        {Icons.clipboard} Authorizations
                    </button>
                )}
                {hasPermission('timesheets') && (
                    <button className={`sidebar__nav-item ${activePage === 'timesheets' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/timesheets')} title="Timesheets">
                        {Icons.fileText} Timesheets
                    </button>
                )}
                {hasPermission('scheduling') && (
                    <button className={`sidebar__nav-item ${activePage === 'scheduling' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/scheduling')} title="Scheduling">
                        {Icons.calendar} Scheduling
                    </button>
                )}
                {hasPermission('tasks') && (
                    <button className={`sidebar__nav-item ${activePage === 'tasks' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/tasks')} title="Tasks">
                        {Icons.checkSquare} Tasks
                    </button>
                )}
                {hasPermission('messages') && (
                    <button className={`sidebar__nav-item ${activePage === 'messages' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/messages')} title="Messages">
                        <span className="sidebar__nav-item-icon-wrap">
                            {Icons.mail}
                            {unreadConversations > 0 && (
                                <span className="sidebar__nav-dot" aria-hidden="true" />
                            )}
                        </span>
                        <span className="sidebar__nav-item-label">Messages</span>
                        {unreadConversations > 0 && (
                            <span className="sidebar__nav-pill">
                                {unreadConversations > 99 ? '99+' : unreadConversations}
                            </span>
                        )}
                    </button>
                )}
                {hasPermission('employees') && (
                    <button className={`sidebar__nav-item ${activePage === 'employees' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/employees')} title="Employees">
                        {Icons.user} Employees
                    </button>
                )}
                {hasPermission('payroll') && (
                    <button className={`sidebar__nav-item ${activePage === 'payroll' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/payroll')} title="Payroll">
                        {Icons.dollarSign} Payroll
                    </button>
                )}
                {hasPermission('receipts') && (
                    <button className={`sidebar__nav-item ${activePage === 'receipts' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/receipts')} title="Receipts">
                        {Icons.fileText} Receipts
                    </button>
                )}
            </nav>

            <div className="sidebar__footer">
                {isStaff && (
                    <>
                        <div className="sidebar__section-label">Settings</div>
                        {hasPermission('insurance-types') && (
                            <button className={`sidebar__nav-item ${activePage === 'insuranceTypes' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/insurance-types')} title="Insurance Types">
                                {Icons.shieldCheck} Insurance Types
                            </button>
                        )}
                        {hasPermission('services') && (
                            <button className={`sidebar__nav-item ${activePage === 'services' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/services')} title="Services">
                                {Icons.fileText} Services
                            </button>
                        )}
                        {hasPermission('users') && (
                            <button className={`sidebar__nav-item ${activePage === 'users' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/users')} title="Users">
                                {Icons.user} Users
                            </button>
                        )}
                        {hasPermission('history') && (
                            <button className={`sidebar__nav-item ${activePage === 'history' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/history')} title="History">
                                {Icons.clock} History
                            </button>
                        )}
                        {hasPermission('sandata') && (
                            <button className={`sidebar__nav-item ${activePage === 'sandata' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/sandata')} title="SANDATA Import">
                                {Icons.upload} SANDATA
                            </button>
                        )}
                        {hasPermission('files') && (
                            <button className={`sidebar__nav-item ${activePage === 'files' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/files')} title="Files">
                                {Icons.folder} Files
                            </button>
                        )}
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
                <button className="sidebar__signout-btn" onClick={handleLogout} title="Sign Out">
                    {Icons.logOut} Sign Out
                </button>
            </div>
        </aside>
    );
}
