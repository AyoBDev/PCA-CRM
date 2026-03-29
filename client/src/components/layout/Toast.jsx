import { useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../common/Icons';

export default function Toast() {
    const { toast, clearToast } = useToast();

    useEffect(() => {
        if (toast) {
            const t = setTimeout(clearToast, 3000);
            return () => clearTimeout(t);
        }
    }, [toast, clearToast]);

    if (!toast) return null;

    return (
        <div className={`toast toast--${toast.type}`}>
            {toast.type === 'success' ? Icons.checkCircle : Icons.alertCircle}
            {toast.message}
        </div>
    );
}
