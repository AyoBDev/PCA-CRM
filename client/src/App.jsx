import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const TimesheetsListPage = lazy(() => import('./pages/TimesheetsListPage'));
const SigningFormPage = lazy(() => import('./pages/SigningFormPage'));
const PcaFormPage = lazy(() => import('./pages/PcaFormPage'));
const PermanentLinksPage = lazy(() => import('./pages/PermanentLinksPage'));
const InsuranceTypesPage = lazy(() => import('./pages/InsuranceTypesPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const SchedulingPage = lazy(() => import('./pages/SchedulingPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const ScheduleConfirmPage = lazy(() => import('./pages/scheduling/ScheduleConfirmPage'));

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, isAdmin, loading } = useAuth();
    if (loading) return <div className="page-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/timesheets" replace />;
    return children;
}

function AppRoutes() {
    const { user, isAdmin, loading } = useAuth();

    if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>;

    return (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>}>
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={!user ? <LoginPage /> : <Navigate to={isAdmin ? '/dashboard' : '/timesheets'} replace />} />
                <Route path="/sign/:token" element={<SigningFormPage />} />
                <Route path="/pca-form/:token" element={<PcaFormPage />} />
                <Route path="/schedule/confirm/:token" element={<ScheduleConfirmPage />} />

                {/* Protected routes with layout */}
                <Route path="/dashboard" element={<ProtectedRoute adminOnly><Layout><DashboardPage /></Layout></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute adminOnly><Layout><ClientsPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets" element={<ProtectedRoute><Layout><TimesheetsListPage /></Layout></ProtectedRoute>} />
                <Route path="/permanent-links" element={<ProtectedRoute adminOnly><Layout><PermanentLinksPage /></Layout></ProtectedRoute>} />
                <Route path="/scheduling" element={<ProtectedRoute adminOnly><Layout><SchedulingPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll/runs/:runId" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/insurance-types" element={<ProtectedRoute adminOnly><Layout><InsuranceTypesPage /></Layout></ProtectedRoute>} />
                <Route path="/services" element={<ProtectedRoute adminOnly><Layout><ServicesPage /></Layout></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute adminOnly><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Layout><UsersPage /></Layout></ProtectedRoute>} />

                {/* Default redirect */}
                <Route path="*" element={<Navigate to={user ? (isAdmin ? '/dashboard' : '/timesheets') : '/login'} replace />} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return <AppRoutes />;
}
