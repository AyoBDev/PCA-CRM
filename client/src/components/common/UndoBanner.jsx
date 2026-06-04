import { useState, useEffect, useRef } from 'react';
import Icons from './Icons';

export default function UndoBanner({ message, onUndo, duration = 30, onDismiss }) {
    const [remaining, setRemaining] = useState(duration);
    const intervalRef = useRef(null);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    if (onDismiss) onDismiss();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(intervalRef.current);
    }, [onDismiss, duration]);

    const handleUndo = async () => {
        clearInterval(intervalRef.current);
        await onUndo();
        if (onDismiss) onDismiss();
    };

    if (remaining <= 0) return null;

    return (
        <div className="undo-banner">
            <div className="undo-banner__content">
                <span className="undo-banner__message">{message}</span>
                <button className="btn btn--primary btn--sm" onClick={handleUndo}>Undo</button>
                <span className="undo-banner__countdown">{remaining}s</span>
            </div>
            <button className="undo-banner__dismiss" onClick={onDismiss} title="Dismiss">
                {Icons.x}
            </button>
        </div>
    );
}
