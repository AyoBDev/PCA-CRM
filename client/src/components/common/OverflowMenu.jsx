import { useState, useRef, useEffect } from 'react';
import Icons from './Icons';

export default function OverflowMenu({ items }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        function handleEscape(e) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    if (!items || items.length === 0) return null;

    return (
        <div className="overflow-menu" ref={ref}>
            <button
                className="overflow-menu__trigger"
                onClick={() => setOpen(!open)}
                title="More actions"
            >
                {Icons.moreHorizontal}
            </button>
            {open && (
                <div className="overflow-menu__panel">
                    {items.map((item, i) => (
                        <button
                            key={i}
                            className={`overflow-menu__item ${item.variant === 'danger' ? 'overflow-menu__item--danger' : ''}`}
                            onClick={() => { item.action(); setOpen(false); }}
                            disabled={item.disabled}
                        >
                            {item.icon && <span className="overflow-menu__item-icon">{item.icon}</span>}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
