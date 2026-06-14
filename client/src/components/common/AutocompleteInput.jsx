import { useState, useEffect, useRef } from 'react';

export default function AutocompleteInput({ value, onChange, options, placeholder, filterMode = 'startsWith' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const filtered = value
        ? options.filter(o => {
            const v = value.toLowerCase();
            const label = (typeof o === 'string' ? o : o.label).toLowerCase();
            return filterMode === 'startsWith' ? label.startsWith(v) : label.includes(v);
        })
        : options;

    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <input
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
            />
            {open && filtered.length > 0 && (
                <div className="autocomplete-dropdown">
                    {filtered.map((opt, i) => {
                        const label = typeof opt === 'string' ? opt : opt.label;
                        const val = typeof opt === 'string' ? opt : opt.value;
                        return (
                            <div key={i} className="autocomplete-dropdown__item" onMouseDown={() => { onChange(val); setOpen(false); }}>
                                {label}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
