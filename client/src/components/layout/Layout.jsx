import { useState } from 'react';
import Sidebar from './Sidebar';
import Toast from './Toast';

export default function Layout({ activePage, onNavigate, user, onLogout, children }) {
    const [sidebarCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    // Listen for sidebar collapse changes via storage events
    // The Sidebar component manages the collapsed state and writes to localStorage.
    // This component reads it on mount for the wrapper class.
    // A full sync will happen when we migrate to React Router with shared context.

    return (
        <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}`}>
            <Sidebar
                activePage={activePage}
                onNavigate={onNavigate}
                user={user}
                onLogout={onLogout}
            />
            <main className="main-content">
                {children}
            </main>
            <Toast />
        </div>
    );
}
