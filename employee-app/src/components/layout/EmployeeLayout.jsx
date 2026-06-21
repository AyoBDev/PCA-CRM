import { Outlet } from 'react-router-dom';
import BottomNav from './BottomTabBar';

export default function EmployeeLayout() {
  return (
    <div className="app">
      <main className="page-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
