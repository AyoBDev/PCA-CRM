import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLayout from './components/layout/EmployeeLayout';
import LoginPage from './pages/LoginPage';

function PlaceholderPage({ title }) {
  return <div className="page-placeholder"><h1>{title}</h1><p>Coming soon</p></div>;
}

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
          <Route index element={<PlaceholderPage title="Home" />} />
          <Route path="schedule" element={<PlaceholderPage title="My Schedule" />} />
          <Route path="availability" element={<PlaceholderPage title="Availability & Time Off" />} />
          <Route path="requirements" element={<PlaceholderPage title="Requirements" />} />
          <Route path="payroll" element={<PlaceholderPage title="Payroll" />} />
          <Route path="chat" element={<PlaceholderPage title="Communication" />} />
          <Route path="tasks" element={<PlaceholderPage title="Tasks" />} />
          <Route path="profile" element={<PlaceholderPage title="My Profile" />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
