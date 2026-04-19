import { useEffect, useState } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../common/Icons';

export default function Toast() {
    const { toast, clearToast } = useToast();
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        if (!toast) return;
        const duration = toast.type === 'undo' ? 5000 : 3000;
        setProgress(100);

        const interval = setInterval(() => {
            setProgress(p => {
                const next = p - (100 / (duration / 50));
                return next < 0 ? 0 : next;
            });
        }, 50);

        const t = setTimeout(clearToast, duration);
        return () => { clearTimeout(t); clearInterval(interval); };
    }, [toast, clearToast]);

    if (!toast) return null;

    const handleUndo = () => {
        if (toast.onUndo) toast.onUndo();
        clearToast();
    };

    return (
        <div className={`toast toast--${toast.type}`}>
            {toast.type === 'success' ? Icons.checkCircle : toast.type === 'undo' ? Icons.alertCircle : Icons.alertCircle}
            <span className="toast__message">{toast.message}</span>
            {toast.type === 'undo' && (
                <button className="toast__undo-btn" onClick={handleUndo}>Undo</button>
            )}
            <div className="toast__progress" style={{ width: `${progress}%` }} />
        </div>
    );
}
