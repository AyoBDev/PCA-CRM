import { useState } from 'react';
import Icons from './Icons';
import DropdownMenu from './DropdownMenu';
import HistoryPanel from './HistoryPanel';
import { ActivityButton } from './ActivityDrawer';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import { useToast } from '../../hooks/useToast';

export default function ActionBar({
    title,
    subtitle,
    icon,
    hideBack = false,
    undoStack: undoState,
    hideUndo = false,
    activityEntity,
    bulkActions,
    bulkCount = 0,
    createLabel,
    onCreate,
    createOptions,
    children,
}) {
    const { goBack, getBackInfo } = useNavigationStack();
    const { showToast } = useToast();
    const [historyOpen, setHistoryOpen] = useState(false);
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
        <div className="action-bar">
            <div className="action-bar__left">
                {!hideBack && backInfo.available && (
                    <button className="action-bar__back" onClick={goBack} title={`Back to ${backInfo.label}`}>
                        {Icons.arrowLeft}
                        <span className="action-bar__back-label">Back</span>
                    </button>
                )}
                <div className="action-bar__title-group">
                    {icon && <div className="action-bar__icon">{icon}</div>}
                    <div>
                        <div className="action-bar__title">{title}</div>
                        {subtitle && <div className="action-bar__subtitle">{subtitle}</div>}
                    </div>
                </div>
            </div>

            {!hideUndo && undoState && (
                <div className="action-bar__center">
                    <button
                        className={`action-bar__btn ${!undoState.canUndo ? 'action-bar__btn--disabled' : ''}`}
                        onClick={handleUndo}
                        disabled={!undoState.canUndo || undoState.loading}
                        title="Undo"
                    >
                        {Icons.undo} <span>Undo</span>
                    </button>
                    <button
                        className={`action-bar__btn ${!undoState.canRedo ? 'action-bar__btn--disabled' : ''}`}
                        onClick={handleRedo}
                        disabled={!undoState.canRedo || undoState.loading}
                        title="Redo"
                    >
                        {Icons.redo} <span>Redo</span>
                    </button>
                    <div className="action-bar__btn-wrapper">
                        <button
                            className={`action-bar__btn ${undoState.undoStack.length === 0 ? 'action-bar__btn--disabled' : ''}`}
                            onClick={() => setHistoryOpen(!historyOpen)}
                            disabled={undoState.undoStack.length === 0}
                            title="View session history"
                        >
                            {Icons.history} <span>History</span>
                        </button>
                        {historyOpen && (
                            <HistoryPanel
                                undoStack={undoState.undoStack}
                                onUndoTo={undoState.undoTo}
                                onClose={() => setHistoryOpen(false)}
                            />
                        )}
                    </div>
                    {activityEntity && <ActivityButton entityType={activityEntity} />}
                </div>
            )}

            {!undoState && !hideUndo && activityEntity && (
                <div className="action-bar__center">
                    <ActivityButton entityType={activityEntity} />
                </div>
            )}

            {hideUndo && activityEntity && (
                <div className="action-bar__center">
                    <ActivityButton entityType={activityEntity} />
                </div>
            )}

            <div className="action-bar__right">
                {children}

                {bulkActions && bulkActions.length > 0 && (
                    <DropdownMenu
                        disabled={bulkCount === 0}
                        trigger={
                            <span className="action-bar__bulk-trigger">
                                {Icons.users}
                                <span>Bulk Actions{bulkCount > 0 ? ` (${bulkCount})` : ''}</span>
                            </span>
                        }
                        items={bulkActions}
                    />
                )}

                {createOptions && createOptions.length > 1 ? (
                    <DropdownMenu
                        trigger={
                            <span className="action-bar__create-trigger">
                                {Icons.plus}
                                <span>{createLabel || 'Create'}</span>
                            </span>
                        }
                        items={createOptions}
                    />
                ) : onCreate ? (
                    <button className="btn btn--primary" onClick={onCreate}>
                        {Icons.plus} {createLabel || 'Create'}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
