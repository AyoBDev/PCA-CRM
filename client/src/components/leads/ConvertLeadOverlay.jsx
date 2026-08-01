import { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import Icons from '../common/Icons';

const STEPS = ['Validating lead data...', 'Copying profile to Active Clients...', 'Migrating records...', 'Finalizing client profile...', 'Conversion complete!'];

export default function ConvertLeadOverlay({ open, lead, onConfirmed, onClose }) {
    const [idx, setIdx] = useState(0);
    const [done, setDone] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (!open || !lead || started.current) return;
        started.current = true;
        setIdx(0); setDone(false); setResult(null); setError('');
        const timer = setInterval(() => setIdx((i) => Math.min(i + 1, STEPS.length - 1)), 500);
        api.convertLead(lead.id)
            .then((r) => { setResult(r); })
            .catch((e) => setError(e.message || 'Conversion failed'));
        return () => { clearInterval(timer); started.current = false; };
    }, [open, lead]);

    useEffect(() => { if (result && idx >= STEPS.length - 1) setDone(true); }, [result, idx]);

    // The overlay can be dismissed once the conversion has settled (succeeded or
    // errored) — never while it's still mid-flight.
    const dismissable = done || !!error;

    // Esc closes when dismissable.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape' && dismissable) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, dismissable, onClose]);

    if (!open) return null;

    // Backdrop click closes when dismissable (clicks on the box don't bubble out).
    const onBackdropClick = () => { if (dismissable) onClose(); };

    return (
        <div className="convert-overlay convert-overlay--open" onClick={onBackdropClick}>
            <div className="convert-box" onClick={(e) => e.stopPropagation()}>
                {dismissable && (
                    <button className="convert-close" aria-label="Close" onClick={onClose}>
                        {Icons.x}
                    </button>
                )}
                {error ? (
                    <>
                        <div className="convert-title">Conversion failed</div>
                        <div className="convert-sub">{error}</div>
                        <button className="btn btn--outline" onClick={onClose}>Close</button>
                    </>
                ) : !done ? (
                    <>
                        <div className="convert-anim" aria-hidden="true" />
                        <div className="convert-title">Converting Lead to Active Client</div>
                        <div className="convert-sub">{STEPS[idx]}</div>
                    </>
                ) : (
                    <>
                        <div className="cs-check">{Icons.checkCircle}</div>
                        <div className="convert-title">Conversion Complete!</div>
                        <div className="convert-sub">Profile migrated to Active Clients.</div>
                        <div className="convert-actions">
                            <button className="btn btn--outline" onClick={onClose}>Close</button>
                            <button className="btn btn--success" onClick={() => onConfirmed(result)}>View Client</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
