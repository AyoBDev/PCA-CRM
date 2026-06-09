import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from './Icons';
import OverflowMenu from './OverflowMenu';
import { ActivityButton } from './ActivityDrawer';
import TrashDrawer from './TrashDrawer';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import { useToast } from '../../hooks/useToast';

export default function GlobalToolbar({
    title,
    subtitle,
    icon,
    hideBack = false,
    hideUndo = false,
    undoState,
    activityEntity,
    trashConfig,
    archiveConfig,
    overflowItems,
}) {
    const { goBack, getBackInfo } = useNavigationStack();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [trashOpen, setTrashOpen] = useState(false);
    const backInfo = getBackInfo();

    const handleUndo = async () => {
        if (!undoState?.canUndo) return;
        const top = undoState.undoStack[0];
        await undoState.undo();
        if (top) showToast(`Undone: ${top.description}`);
    };

    const handleRedo = async () => {
        if (!undoState?.canRedo) return;
        const top = undoState.redoStack[0];
        await undoState.redo();
        if (top) showToast(`Redone: ${top.description}`);
    };

    return (
        <>
            <div className="global-toolbar">
                {/* Left: Back + Title */}
                <div className="global-toolbar__left">
                    {!hideBack && backInfo.available && (
                        <button className="global-toolbar__back" onClick={goBack} title={`Back to ${backInfo.label}`}>
                            {Icons.arrowLeft}
                            <span className="global-toolbar__back-label">Back</span>
                        </button>
                    )}
                    <div className="global-toolbar__title-group">
                        {icon && <div className="global-toolbar__icon">{icon}</div>}
                        <div>
                            <div className="global-toolbar__title">{title}</div>
                            {subtitle && <div className="global-toolbar__subtitle">{subtitle}</div>}
                        </div>
                    </div>
                </div>

                {/* Center: Connected Button Group */}
                {!hideUndo && (
                    <div className="global-toolbar__center">
                        <div className="connected-btn-group">
                            <button
                                className={`connected-btn-group__btn connected-btn-group__btn--first ${!undoState?.canUndo ? 'connected-btn-group__btn--disabled' : ''}`}
                                onClick={handleUndo}
                                disabled={!undoState?.canUndo || undoState?.loading}
                                title="Undo"
                            >
                                {Icons.undo} <span>Undo</span>
                            </button>
                            <button
                                className={`connected-btn-group__btn ${!undoState?.canRedo ? 'connected-btn-group__btn--disabled' : ''}`}
                                onClick={handleRedo}
                                disabled={!undoState?.canRedo || undoState?.loading}
                                title="Redo"
                            >
                                {Icons.redo} <span>Redo</span>
                            </button>
                            <button
                                className="connected-btn-group__btn"
                                onClick={() => navigate('/history')}
                                title="View full activity history"
                            >
                                {Icons.history} <span>History</span>
                            </button>
                            {activityEntity && (
                                <ActivityButton entityType={activityEntity} className="connected-btn-group__btn connected-btn-group__btn--last" />
                            )}
                        </div>
                    </div>
                )}

                {hideUndo && activityEntity && (
                    <div className="global-toolbar__center">
                        <ActivityButton entityType={activityEntity} />
                    </div>
                )}

                {/* Right: Trash + Archive + Overflow */}
                <div className="global-toolbar__right">
                    {trashConfig && (
                        <button
                            className="global-toolbar__trash-btn"
                            onClick={() => setTrashOpen(true)}
                            title="View deleted items"
                        >
                            {Icons.trash} <span>Trash</span>
                        </button>
                    )}
                    {archiveConfig && (
                        <button
                            className="global-toolbar__archive-btn"
                            onClick={archiveConfig.onToggle}
                            title={archiveConfig.isArchiveView ? 'Show active items' : 'View archived items'}
                        >
                            {Icons.archive} <span>{archiveConfig.isArchiveView ? 'Show Active' : 'Archive'}</span>
                        </button>
                    )}
                    <OverflowMenu items={overflowItems} />
                </div>
            </div>

            {/* Trash Drawer */}
            {trashConfig && trashOpen && (
                <TrashDrawer
                    items={trashConfig.items}
                    batches={trashConfig.batches}
                    onRestore={trashConfig.onRestore}
                    onRestoreBatch={trashConfig.onRestoreBatch}
                    onPermanentDelete={trashConfig.onPermanentDelete}
                    onClose={() => setTrashOpen(false)}
                    entityLabel={trashConfig.entityLabel}
                />
            )}
        </>
    );
}
