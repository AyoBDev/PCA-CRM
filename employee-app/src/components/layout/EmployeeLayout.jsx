import { Outlet } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import EmployeeSidebar from './EmployeeSidebar';

export default function EmployeeLayout({ badges = {} }) {
  return (
    <div className="employee-app">
      <EmployeeSidebar badges={badges} />
      <main className="employee-main">
        <Outlet />
      </main>
      <BottomTabBar badges={badges} />
    </div>
  );
}
