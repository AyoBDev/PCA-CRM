import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/schedule', label: 'My Schedule', icon: 'calendar' },
  { to: '/availability', label: 'Availability & Time Off', icon: 'clock' },
  { to: '/requirements', label: 'Requirements', icon: 'cert' },
  { to: '/payroll', label: 'Payroll', icon: 'dollar' },
  { to: '/chat', label: 'Communication', icon: 'chat' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/profile', label: 'My Profile', icon: 'user' },
];

export default function EmployeeSidebar({ badges = {} }) {
  const { user, logout } = useAuth();

  return (
    <aside className="employee-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">PCAlink</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
            <span className="sidebar-link-label">{item.label}</span>
            {badges[item.icon] && <span className="sidebar-badge">{badges[item.icon]}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-user">{user?.name}</span>
        <button className="sidebar-logout" onClick={logout}>Sign Out</button>
      </div>
    </aside>
  );
}
