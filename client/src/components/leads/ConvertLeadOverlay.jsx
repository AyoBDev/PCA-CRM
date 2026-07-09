import { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import * as Icons from '../common/Icons';

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

    if (!open) return null;
    return (
        <div className="convert-overlay convert-overlay--open">
            <div className="convert-box">
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
                        <button className="btn btn--success" onClick={() => onConfirmed(result)}>View Client</button>
                    </>
                )}
            </div>
        </div>
    );
}
