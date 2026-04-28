import { useState, useEffect, useRef } from 'react';

export default function SearchableSelect({ options, value, onChange, placeholder, className, id }) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const selectedLabel = options.find(o => String(o.value) === String(value))?.label || '';

    useEffect(() => {
        if (!open) setSearch('');
    }, [open]);

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filtered = options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={ref} className="searchable-select">
            <input
                id={id}
                className={className}
                value={open ? search : selectedLabel}
                onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder || 'Type to search…'}
                autoComplete="off"
            />
            {open && (
                <ul className="searchable-select__dropdown">
                    {filtered.length === 0 && (
                        <li className="searchable-select__empty">No results found</li>
                    )}
                    {filtered.map(o => (
                        <li key={o.value}
                            className={`searchable-select__item${String(o.value) === String(value) ? ' searchable-select__item--active' : ''}`}
                            onClick={() => { onChange(String(o.value)); setOpen(false); setSearch(''); }}>
                            {o.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
