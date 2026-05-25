import { useEffect, useRef, useCallback } from 'react';

export default function Modal({ children, onClose, wide }) {
    const backdropRef = useRef(null);
    const modalRef = useRef(null);
    const mouseDownTarget = useRef(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    useEffect(() => {
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) focusable[0].focus();
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key !== 'Tab') return;
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }, []);

    const handleMouseDown = (e) => { mouseDownTarget.current = e.target; };
    const handleClick = (e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
            onClose();
        }
        mouseDownTarget.current = null;
    };

    return (
        <div className="modal-backdrop" ref={backdropRef} onMouseDown={handleMouseDown} onClick={handleClick} role="dialog" aria-modal="true">
            <div className={`modal${wide ? ' modal--wide' : ''}`} ref={modalRef} onKeyDown={handleKeyDown}>
                <button className="modal__close" onClick={onClose} title="Close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                {children}
            </div>
        </div>
    );
}
