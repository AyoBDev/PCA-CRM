import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/requirements', label: 'Certs', icon: 'cert' },
  { to: '/payroll', label: 'Payroll', icon: 'dollar' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
];

const ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  cert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h6"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
};

export default function BottomTabBar({ badges = {} }) {
  return (
    <nav className="bottom-tab-bar">
      {TABS.map(tab => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => `tab-item ${isActive ? 'tab-item--active' : ''}`}>
          <span className="tab-icon">
            {ICONS[tab.icon]}
            {badges[tab.icon] && <span className="tab-badge" />}
          </span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
