import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Toast from './Toast';
import Icons from '../common/Icons';

export default function Layout({ children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handler = () => {
            setSidebarCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
        };
        window.addEventListener('sidebarToggle', handler);
        return () => window.removeEventListener('sidebarToggle', handler);
    }, []);

    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [mobileMenuOpen]);

    return (
        <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}${mobileMenuOpen ? ' app--mobile-menu-open' : ''}`}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
                {Icons.menu}
            </button>
            {mobileMenuOpen && <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />}
            <Sidebar onMobileClose={() => setMobileMenuOpen(false)} />
            <main className="main-content" id="main-content">
                {children}
            </main>
            <Toast />
        </div>
    );
}
