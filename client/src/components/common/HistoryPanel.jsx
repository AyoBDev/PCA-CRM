import { useRef, useEffect } from 'react';

function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export default function HistoryPanel({ undoStack, onUndoTo, onClose }) {
    const ref = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        }
        function handleEscape(e) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return (
        <div className="history-panel" ref={ref}>
            <div className="history-panel__header">
                <span className="history-panel__title">Session History</span>
                <span className="history-panel__count">{undoStack.length} actions</span>
            </div>
            <div className="history-panel__list">
                {undoStack.length === 0 ? (
                    <div className="history-panel__empty">No actions to undo</div>
                ) : (
                    undoStack.map(entry => (
                        <button
                            key={entry.id}
                            className="history-panel__entry"
                            onClick={() => { onUndoTo(entry.id); onClose(); }}
                            title="Undo to this point"
                        >
                            <span className="history-panel__entry-desc">{entry.description}</span>
                            <span className="history-panel__entry-time">{timeAgo(entry.timestamp)}</span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
