import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Toast from './Toast';

export default function Layout({ children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    // Sync when Sidebar toggles
    useEffect(() => {
        const handler = () => {
            setSidebarCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
        };
        window.addEventListener('sidebarToggle', handler);
        return () => window.removeEventListener('sidebarToggle', handler);
    }, []);

    return (
        <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}`}>
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
            <Toast />
        </div>
    );
}
