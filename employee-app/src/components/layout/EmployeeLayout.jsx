import { Outlet } from 'react-router-dom';
import BottomNav from './BottomTabBar';

const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

export default function EmployeeLayout() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo"><Logo /></div>
          <span className="app-header__name">PCAlink</span>
        </div>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
