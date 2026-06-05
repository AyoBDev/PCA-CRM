import { useState } from 'react';
import Icons from './Icons';
import { useAuth } from '../../hooks/useAuth';

export default function TrashDrawer({ items, batches, onRestore, onRestoreBatch, onPermanentDelete, onClose, entityLabel = 'items' }) {
    const { isAdmin } = useAuth();
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [confirmPermanent, setConfirmPermanent] = useState(false);
    const [permanentText, setPermanentText] = useState('');
    const [search, setSearch] = useState('');

    const filteredItems = items.filter(item => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (item.label || '').toLowerCase().includes(q);
    });

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRestoreSelected = () => {
        onRestore([...selectedIds]);
        setSelectedIds(new Set());
    };

    const handlePermanentDelete = () => {
        if (permanentText !== 'PERMANENT DELETE') return;
        onPermanentDelete([...selectedIds]);
        setSelectedIds(new Set());
        setConfirmPermanent(false);
        setPermanentText('');
    };

    return (
        <div className="activity-drawer-backdrop" onClick={onClose}>
            <aside className="activity-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="activity-drawer__header">
                    <h3 className="activity-drawer__title">
                        <span className="trash-drawer__title-icon">{Icons.trash}</span>
                        Deleted {entityLabel}
                    </h3>
                    <button className="activity-drawer__close" onClick={onClose} title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div className="activity-drawer__body trash-drawer__body">
                    <input
                        type="text"
                        className="trash-drawer__search"
                        placeholder={`Search deleted ${entityLabel}...`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    {selectedIds.size > 0 && (
                        <div className="trash-drawer__actions">
                            <span className="trash-drawer__count">{selectedIds.size} selected</span>
                            <button className="btn btn--primary btn--sm" onClick={handleRestoreSelected}>
                                <span className="trash-drawer__btn-icon">{Icons.rotateCcw}</span> Restore
                            </button>
                            {isAdmin && (
                                <button className="btn btn--danger btn--sm" onClick={() => setConfirmPermanent(true)}>
                                    Permanently Delete
                                </button>
                            )}
                        </div>
                    )}

                    {confirmPermanent && (
                        <div className="trash-drawer__permanent-confirm">
                            <p className="trash-drawer__permanent-warn">
                                This cannot be undone. Type PERMANENT DELETE to confirm:
                            </p>
                            <input
                                type="text"
                                className="trash-drawer__permanent-input"
                                value={permanentText}
                                onChange={(e) => setPermanentText(e.target.value)}
                                placeholder="PERMANENT DELETE"
                            />
                            <div className="trash-drawer__permanent-actions">
                                <button className="btn btn--danger btn--sm" onClick={handlePermanentDelete} disabled={permanentText !== 'PERMANENT DELETE'}>
                                    Confirm
                                </button>
                                <button className="btn btn--outline btn--sm" onClick={() => { setConfirmPermanent(false); setPermanentText(''); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {batches && batches.length > 0 && (
                        <div className="trash-drawer__section">
                            <h4 className="trash-drawer__section-title">Bulk Operations</h4>
                            {batches.map(batch => (
                                <div key={batch.id} className="trash-drawer__batch">
                                    <div className="trash-drawer__batch-info">
                                        <span className="trash-drawer__batch-label">
                                            {batch.action === 'ARCHIVE' ? 'Deleted' : 'Edited'} {batch.shiftCount} shifts
                                        </span>
                                        <span className="trash-drawer__batch-meta">
                                            {batch.userName} — {new Date(batch.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <button className="btn btn--outline btn--xs" onClick={() => onRestoreBatch(batch.id)}>
                                        Restore All
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="trash-drawer__section">
                        <h4 className="trash-drawer__section-title">All Deleted ({filteredItems.length})</h4>
                        {filteredItems.length === 0 && (
                            <p className="trash-drawer__empty">
                                No deleted {entityLabel} found.
                            </p>
                        )}
                        {filteredItems.map(item => (
                            <div key={item.id} className="trash-drawer__item">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                />
                                <div className="trash-drawer__item-info">
                                    <span className="trash-drawer__item-label">{item.label}</span>
                                    <span className="trash-drawer__item-meta">
                                        {item.deletedBy} — {item.deletedAt}
                                    </span>
                                </div>
                                <button className="btn btn--outline btn--xs" onClick={() => onRestore([item.id])}>
                                    Restore
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
    );
}
