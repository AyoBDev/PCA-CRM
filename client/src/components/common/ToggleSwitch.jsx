// client/src/components/common/ToggleSwitch.jsx
// Reusable sliding on/off switch. Accessible (role="switch", keyboard-toggle,
// aria-checked). Pairs an optional label with the control.
export default function ToggleSwitch({ checked, onChange, label, id, disabled = false }) {
    const toggle = () => { if (!disabled) onChange(!checked); };
    const onKey = (e) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); }
    };
    return (
        <label className={`toggle-switch${disabled ? ' toggle-switch--disabled' : ''}`} htmlFor={id}>
            {label && <span className="toggle-switch__label">{label}</span>}
            <button
                type="button"
                id={id}
                role="switch"
                aria-checked={checked}
                aria-label={label || 'Toggle'}
                className={`toggle-switch__track${checked ? ' is-on' : ''}`}
                onClick={toggle}
                onKeyDown={onKey}
                disabled={disabled}
            >
                <span className="toggle-switch__knob" />
            </button>
        </label>
    );
}
