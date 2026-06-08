import { useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const MAX_HISTORY = 20;

const LOGICAL_PARENTS = {
    '/clients': '/dashboard',
    '/employees': '/dashboard',
    '/scheduling': '/dashboard',
    '/timesheets': '/dashboard',
    '/payroll': '/dashboard',
    '/users': '/dashboard',
    '/insurance-types': '/dashboard',
    '/services': '/dashboard',
    '/tasks': '/dashboard',
    '/receipts': '/dashboard',
    '/authorizations': '/dashboard',
    '/permanent-links': '/dashboard',
};

function getLogicalParent(pathname) {
    if (pathname === '/dashboard') return null;
    const exact = LOGICAL_PARENTS[pathname];
    if (exact) return { path: exact, label: 'Dashboard' };
    if (pathname.startsWith('/clients/') && pathname.includes('/service/')) {
        const clientId = pathname.split('/')[2];
        return { path: `/clients/${clientId}`, label: 'Client' };
    }
    if (pathname.startsWith('/clients/')) return { path: '/clients', label: 'Clients' };
    if (pathname.startsWith('/employees/')) return { path: '/employees', label: 'Employees' };
    if (pathname.startsWith('/payroll/runs/')) return { path: '/payroll', label: 'Payroll' };
    return { path: '/dashboard', label: 'Dashboard' };
}

export function useNavigationStack() {
    const navigate = useNavigate();
    const location = useLocation();
    const stackRef = useRef([]);
    const prevPathRef = useRef(null);

    useEffect(() => {
        if (prevPathRef.current && prevPathRef.current !== location.pathname) {
            stackRef.current = [
                { path: prevPathRef.current, label: getLabelForPath(prevPathRef.current) },
                ...stackRef.current,
            ].slice(0, MAX_HISTORY);
        }
        prevPathRef.current = location.pathname;
    }, [location.pathname]);

    const goBack = useCallback(() => {
        if (stackRef.current.length > 0) {
            const [top, ...rest] = stackRef.current;
            stackRef.current = rest;
            navigate(top.path);
        } else {
            const parent = getLogicalParent(location.pathname);
            if (parent) navigate(parent.path);
        }
    }, [navigate, location.pathname]);

    const getBackInfo = useCallback(() => {
        if (stackRef.current.length > 0) {
            return { label: stackRef.current[0].label, available: true };
        }
        const parent = getLogicalParent(location.pathname);
        if (parent) return { label: parent.label, available: true };
        return { label: '', available: false };
    }, [location.pathname]);

    return { goBack, getBackInfo };
}

function getLabelForPath(path) {
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/clients') return 'Clients';
    if (path === '/employees') return 'Employees';
    if (path === '/scheduling') return 'Scheduling';
    if (path === '/timesheets') return 'Timesheets';
    if (path === '/payroll') return 'Payroll';
    if (path === '/users') return 'Users';
    if (path === '/insurance-types') return 'Insurance Types';
    if (path === '/services') return 'Services';
    if (path === '/tasks') return 'Tasks';
    if (path === '/receipts') return 'Receipts';
    if (path === '/authorizations') return 'Master Sheet';
    if (path.startsWith('/clients/')) return 'Client';
    if (path.startsWith('/employees/')) return 'Employee';
    if (path.startsWith('/payroll/runs/')) return 'Payroll Run';
    return 'Back';
}
