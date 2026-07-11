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

const NOOP_TOAST_CTX = {
    toast: null,
    showToast: () => {},
    showUndoToast: () => {},
    clearToast: () => {},
};

export function useToast() {
    const ctx = useContext(ToastContext);
    // Falls back to a no-op implementation outside <ToastProvider> (e.g. unit
    // tests that render a page in isolation without the app's provider tree).
    // The real app always wraps in ToastProvider via main.jsx.
    return ctx || NOOP_TOAST_CTX;
}
