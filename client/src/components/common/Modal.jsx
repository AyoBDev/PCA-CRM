import { useEffect, useRef } from 'react';

export default function Modal({ children, onClose, wide }) {
    const backdropRef = useRef(null);
    const mouseDownTarget = useRef(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Only close if both mousedown AND mouseup happened on the backdrop itself.
    // This prevents accidental closes when clicking back into the browser window.
    const handleMouseDown = (e) => { mouseDownTarget.current = e.target; };
    const handleClick = (e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
            onClose();
        }
        mouseDownTarget.current = null;
    };

    return (
        <div className="modal-backdrop" ref={backdropRef} onMouseDown={handleMouseDown} onClick={handleClick}>
            <div className={`modal${wide ? ' modal--wide' : ''}`}>
                <button className="modal__close" onClick={onClose} title="Close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                {children}
            </div>
        </div>
    );
}
