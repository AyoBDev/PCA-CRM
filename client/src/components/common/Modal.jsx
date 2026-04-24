import { useEffect } from 'react';

export default function Modal({ children, onClose, wide }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`modal${wide ? ' modal--wide' : ''}`}>
                <button className="modal__close" onClick={onClose} title="Close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                {children}
            </div>
        </div>
    );
}
