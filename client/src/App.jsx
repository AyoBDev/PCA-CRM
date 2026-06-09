import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AuthorizationsPage = lazy(() => import('./pages/AuthorizationsPage'));
const ClientsListPage = lazy(() => import('./pages/ClientsListPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const ClientServicePage = lazy(() => import('./pages/ClientServicePage'));
const TimesheetsListPage = lazy(() => import('./pages/TimesheetsListPage'));
const SignRedirectPage = lazy(() => import('./pages/SignRedirectPage'));
const PcaFormPage = lazy(() => import('./pages/PcaFormPage'));
const PermanentLinksPage = lazy(() => import('./pages/PermanentLinksPage'));
const InsuranceTypesPage = lazy(() => import('./pages/InsuranceTypesPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage'));
const SchedulingPage = lazy(() => import('./pages/SchedulingPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'));
const ScheduleConfirmPage = lazy(() => import('./pages/scheduling/ScheduleConfirmPage'));
const ScheduleViewPage = lazy(() => import('./pages/scheduling/ScheduleViewPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));

function ProtectedRoute({ children, adminOnly = false, staffOnly = false }) {
    const { user, isAdmin, isStaff, loading } = useAuth();
    if (loading) return <div className="page-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/timesheets" replace />;
    if (staffOnly && !isStaff) return <Navigate to="/timesheets" replace />;
    return children;
}

function AppRoutes() {
    const { user, isAdmin, isStaff, loading } = useAuth();

    if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    return (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>}>
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={!user ? <LoginPage /> : <Navigate to={isStaff ? '/dashboard' : '/timesheets'} replace />} />
                <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <Navigate to={isStaff ? '/dashboard' : '/timesheets'} replace />} />
                <Route path="/reset-password" element={!user ? <ResetPasswordPage /> : <Navigate to={isStaff ? '/dashboard' : '/timesheets'} replace />} />
                <Route path="/sign/:token" element={<SignRedirectPage />} />
                <Route path="/pca-form/:token" element={<PcaFormPage />} />
                <Route path="/schedule/confirm/:token" element={<ScheduleConfirmPage />} />
                <Route path="/schedule/view/:token" element={<ScheduleViewPage />} />

                {/* Protected routes with layout */}
                <Route path="/dashboard" element={<ProtectedRoute staffOnly><Layout><DashboardPage /></Layout></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute staffOnly><Layout><ClientsListPage /></Layout></ProtectedRoute>} />
                <Route path="/clients/:clientId" element={<ProtectedRoute staffOnly><Layout><ClientDetailPage /></Layout></ProtectedRoute>} />
                <Route path="/clients/:clientId/service/:serviceCode" element={<ProtectedRoute staffOnly><Layout><ClientServicePage /></Layout></ProtectedRoute>} />
                <Route path="/authorizations" element={<ProtectedRoute staffOnly><Layout><AuthorizationsPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets" element={<ProtectedRoute><Layout><TimesheetsListPage /></Layout></ProtectedRoute>} />
                <Route path="/permanent-links" element={<ProtectedRoute staffOnly><Layout><PermanentLinksPage /></Layout></ProtectedRoute>} />
                <Route path="/scheduling" element={<ProtectedRoute staffOnly><Layout><SchedulingPage /></Layout></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute staffOnly><Layout><TasksPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute staffOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll/runs/:runId" element={<ProtectedRoute staffOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/receipts" element={<ProtectedRoute adminOnly><Layout><ReceiptsPage /></Layout></ProtectedRoute>} />
                <Route path="/insurance-types" element={<ProtectedRoute staffOnly><Layout><InsuranceTypesPage /></Layout></ProtectedRoute>} />
                <Route path="/services" element={<ProtectedRoute staffOnly><Layout><ServicesPage /></Layout></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute staffOnly><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
                <Route path="/employees/:employeeId" element={<ProtectedRoute staffOnly><Layout><EmployeeDetailPage /></Layout></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Layout><UsersPage /></Layout></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute staffOnly><Layout><HistoryPage /></Layout></ProtectedRoute>} />

                {/* Default redirect */}
                <Route path="*" element={<Navigate to={user ? (isStaff ? '/dashboard' : '/timesheets') : '/login'} replace />} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return <AppRoutes />;
}
