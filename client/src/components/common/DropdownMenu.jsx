import { useState, useRef, useEffect } from 'react';
import Icons from './Icons';

export default function DropdownMenu({ trigger, items, disabled, align = 'right' }) {
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

    return (
        <div className="dropdown-menu" ref={ref}>
            <button
                className={`dropdown-menu__trigger ${disabled ? 'dropdown-menu__trigger--disabled' : ''}`}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
            >
                {trigger}
                {Icons.chevronDown}
            </button>
            {open && (
                <div className={`dropdown-menu__panel dropdown-menu__panel--${align}`}>
                    {items.map((item, i) => (
                        <button
                            key={i}
                            className={`dropdown-menu__item ${item.variant === 'danger' ? 'dropdown-menu__item--danger' : ''}`}
                            onClick={() => { item.action(); setOpen(false); }}
                        >
                            {item.icon && <span className="dropdown-menu__item-icon">{item.icon}</span>}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
