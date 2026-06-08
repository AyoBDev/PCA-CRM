import { useState, useCallback, useRef } from 'react';

const MAX_STACK_SIZE = 50;

export function useUndoStack() {
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [loading, setLoading] = useState(false);
    const undoRef = useRef(undoStack);
    const redoRef = useRef(redoStack);
    undoRef.current = undoStack;
    redoRef.current = redoStack;

    const pushAction = useCallback((description, undoFn, redoFn) => {
        const entry = {
            id: crypto.randomUUID(),
            description,
            timestamp: Date.now(),
            undoFn,
            redoFn,
        };
        setUndoStack(prev => [entry, ...prev].slice(0, MAX_STACK_SIZE));
        setRedoStack([]);
    }, []);

    const undo = useCallback(async () => {
        const stack = undoRef.current;
        if (stack.length === 0) return;
        const [top, ...rest] = stack;
        setUndoStack(rest);
        setLoading(true);
        try {
            await top.undoFn();
            setRedoStack(prev => [top, ...prev]);
        } finally {
            setLoading(false);
        }
    }, []);

    const redo = useCallback(async () => {
        const stack = redoRef.current;
        if (stack.length === 0) return;
        const [top, ...rest] = stack;
        setRedoStack(rest);
        setLoading(true);
        try {
            await top.redoFn();
            setUndoStack(prev => [top, ...prev]);
        } finally {
            setLoading(false);
        }
    }, []);

    const undoTo = useCallback(async (targetId) => {
        const stack = undoRef.current;
        const idx = stack.findIndex(e => e.id === targetId);
        if (idx === -1) return;
        const toUndo = stack.slice(0, idx + 1);
        const remaining = stack.slice(idx + 1);
        setUndoStack(remaining);
        setLoading(true);
        try {
            for (const entry of toUndo) {
                await entry.undoFn();
            }
            setRedoStack(prev => [...toUndo, ...prev]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clear = useCallback(() => {
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    return {
        undoStack,
        redoStack,
        pushAction,
        undo,
        redo,
        undoTo,
        clear,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        loading,
    };
}
