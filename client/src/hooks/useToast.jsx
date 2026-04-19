import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    const showUndoToast = useCallback((message, onUndo) => {
        setToast({ message, type: 'undo', onUndo });
    }, []);

    const clearToast = useCallback(() => setToast(null), []);

    return (
        <ToastContext.Provider value={{ toast, showToast, showUndoToast, clearToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
