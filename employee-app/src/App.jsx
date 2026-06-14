import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLayout from './components/layout/EmployeeLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import SchedulePage from './pages/SchedulePage';
import AvailabilityPage from './pages/AvailabilityPage';
import RequirementsPage from './pages/RequirementsPage';
import PayrollPage from './pages/PayrollPage';
import ChatPage from './pages/ChatPage';
import TasksPage from './pages/TasksPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <EmployeeLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<HomePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="requirements" element={<RequirementsPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
