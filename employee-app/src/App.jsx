import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLayout from './components/layout/EmployeeLayout';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import SchedulePage from './pages/SchedulePage';
import TimesheetPage from './pages/TimesheetPage';
import MessagesPage from './pages/MessagesPage';
import AccountPage from './pages/AccountPage';
import PayStubsPage from './pages/PayStubsPage';
import CertificationsPage from './pages/CertificationsPage';
import AvailabilityPage from './pages/AvailabilityPage';
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
        <Route path="/onboard/:token" element={<OnboardingPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<HomePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="account/pay" element={<PayStubsPage />} />
          <Route path="account/certs" element={<CertificationsPage />} />
          <Route path="account/availability" element={<AvailabilityPage />} />
          <Route path="account/tasks" element={<TasksPage />} />
          <Route path="account/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
