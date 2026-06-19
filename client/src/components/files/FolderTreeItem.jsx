import { useState, useCallback } from 'react';
import Icons from '../common/Icons';

export default function FolderTreeItem({
    folder,
    depth,
    isActive,
    onSelect,
    onLoadChildren,
    childrenCache,
    fileCountCache,
}) {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);

    const children = childrenCache[folder.id] || [];
    const fileCount = fileCountCache[folder.id];

    const handleToggle = useCallback(async (e) => {
        e.stopPropagation();
        if (!expanded && !childrenCache[folder.id]) {
            setLoading(true);
            await onLoadChildren(folder.id);
            setLoading(false);
        }
        setExpanded(!expanded);
    }, [expanded, folder.id, childrenCache, onLoadChildren]);

    const handleSelect = useCallback(() => {
        onSelect(folder);
        if (!expanded && !childrenCache[folder.id]) {
            setLoading(true);
            onLoadChildren(folder.id).then(() => setLoading(false));
        }
        setExpanded(true);
    }, [folder, onSelect, expanded, childrenCache, onLoadChildren]);

    return (
        <div className="folder-tree-item">
            <div
                className={`folder-tree-item__row ${isActive ? 'folder-tree-item__row--active' : ''}`}
                style={{ paddingLeft: depth * 20 + 8 }}
                onClick={handleSelect}
            >
                <button
                    className="folder-tree-item__toggle"
                    onClick={handleToggle}
                >
                    {loading ? (
                        <span className="folder-tree-item__spinner">...</span>
                    ) : (
                        <span className={`folder-tree-item__arrow ${expanded ? 'folder-tree-item__arrow--open' : ''}`}>
                            ▸
                        </span>
                    )}
                </button>
                <span className="folder-tree-item__icon">{Icons.folder}</span>
                <span className="folder-tree-item__name">{folder.name}</span>
                {fileCount !== undefined && (
                    <span className="folder-tree-item__badge">{fileCount}</span>
                )}
            </div>
            {expanded && children.length > 0 && (
                <div className="folder-tree-item__children">
                    {children.map(child => (
                        <FolderTreeItem
                            key={child.id}
                            folder={child}
                            depth={depth + 1}
                            isActive={false}
                            onSelect={onSelect}
                            onLoadChildren={onLoadChildren}
                            childrenCache={childrenCache}
                            fileCountCache={fileCountCache}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
