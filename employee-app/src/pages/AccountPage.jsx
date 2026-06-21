import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AccountPage() {
  const { user, logout } = useAuth();

  const items = [
    { to: '/account/pay', label: 'Pay Stubs', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
    { to: '/account/certs', label: 'Certifications', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
    { to: '/account/availability', label: 'Availability', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
    { to: '/account/tasks', label: 'Tasks', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
    { to: '/account/profile', label: 'Edit Profile', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ];

  return (
    <div>
      <div className="account-header">
        <div className="account-avatar">{getInitials(user?.name)}</div>
        <div>
          <div className="account-name">{user?.name}</div>
          <div className="account-email">{user?.email}</div>
        </div>
      </div>

      <div className="account-list">
        {items.map(item => (
          <Link key={item.to} to={item.to} className="account-row">
            <span className="account-row__icon">{item.icon}</span>
            <span className="account-row__label">{item.label}</span>
            <span className="account-row__chevron">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </span>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <button className="btn--danger-text" onClick={logout}>Log Out</button>
      </div>
    </div>
  );
}
