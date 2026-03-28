import { useEffect } from 'react';

export default function DrawerPanel({ children, onClose }) {
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="drawer-backdrop" onClick={onClose}>
            <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
                <button className="drawer-panel__close" onClick={onClose} title="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                {children}
            </aside>
        </div>
    );
}
