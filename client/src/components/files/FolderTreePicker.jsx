import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icons from '../common/Icons';
import * as api from '../../api';

/**
 * Lazy-loading expandable folder tree picker.
 *
 * Behavior:
 * - Root folders load on mount.
 * - Each folder shows a ▸ chevron; click expands/collapses and lazy-loads children.
 * - Clicking the folder row selects it (highlights, calls onSelect).
 * - The selected folder is auto-expanded so its current children are visible.
 * - Selected path is also shown as a breadcrumb above the tree.
 */
export default function FolderTreePicker({ selectedFolderId, onSelect }) {
    const [rootFolders, setRootFolders] = useState([]);
    const [childrenCache, setChildrenCache] = useState({}); // { [parentId]: Folder[] }
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [loadingIds, setLoadingIds] = useState(new Set());
    const [error, setError] = useState(null);
    const [foldersById, setFoldersById] = useState({}); // { [id]: folder } for breadcrumb

    const indexFolders = useCallback((folders) => {
        setFoldersById(prev => {
            const next = { ...prev };
            for (const f of folders) next[f.id] = f;
            return next;
        });
    }, []);

    // Load root folders on mount
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.listFolders(null)
            .then(data => {
                if (cancelled) return;
                const list = data.folders || [];
                setRootFolders(list);
                indexFolders(list);
            })
            .catch(err => { if (!cancelled) setError(err.message || 'Failed to load folders'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [indexFolders]);

    const loadChildren = useCallback(async (parentId) => {
        if (childrenCache[parentId]) return childrenCache[parentId];
        setLoadingIds(prev => { const n = new Set(prev); n.add(parentId); return n; });
        try {
            const data = await api.getFolder(parentId);
            const kids = data.children || [];
            setChildrenCache(prev => ({ ...prev, [parentId]: kids }));
            indexFolders(kids);
            return kids;
        } finally {
            setLoadingIds(prev => { const n = new Set(prev); n.delete(parentId); return n; });
        }
    }, [childrenCache, indexFolders]);

    const toggleExpand = useCallback(async (folder, e) => {
        e?.stopPropagation();
        const id = folder.id;
        const isExpanded = expandedIds.has(id);
        if (!isExpanded) {
            await loadChildren(id);
        }
        setExpandedIds(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    }, [expandedIds, loadChildren]);

    const handleSelect = useCallback(async (folder) => {
        onSelect(folder);
        // Auto-expand the selected folder so the user can see what's inside.
        if (!expandedIds.has(folder.id)) {
            await loadChildren(folder.id);
            setExpandedIds(prev => {
                const n = new Set(prev);
                n.add(folder.id);
                return n;
            });
        }
    }, [onSelect, expandedIds, loadChildren]);

    // On first mount with a selectedFolderId, walk up its ancestor chain and
    // expand each ancestor so the user lands with the path to their current folder
    // already expanded. Done only once; subsequent selection changes don't refetch.
    const initialExpansionDone = useRef(false);
    useEffect(() => {
        if (initialExpansionDone.current) return;
        if (!selectedFolderId) return;
        initialExpansionDone.current = true;
        let cancelled = false;
        (async () => {
            try {
                const chain = [];
                let currentId = selectedFolderId;
                while (currentId && !cancelled) {
                    const data = await api.getFolder(currentId);
                    if (!data?.folder) break;
                    chain.unshift(data.folder);
                    indexFolders([data.folder]);
                    if (data.children) {
                        indexFolders(data.children);
                        setChildrenCache(prev => ({ ...prev, [data.folder.id]: data.children }));
                    }
                    currentId = data.folder.parentId;
                }
                if (cancelled) return;
                setExpandedIds(prev => {
                    const n = new Set(prev);
                    for (const f of chain) n.add(f.id);
                    return n;
                });
            } catch {
                // Silent — folder may have been deleted. User can still pick manually.
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolderId]);

    // Build breadcrumb for the selected folder.
    const breadcrumb = useMemo(() => {
        if (!selectedFolderId) return null;
        const chain = [];
        let cur = foldersById[selectedFolderId];
        while (cur) {
            chain.unshift(cur);
            cur = cur.parentId ? foldersById[cur.parentId] : null;
        }
        return chain;
    }, [selectedFolderId, foldersById]);

    const renderNode = (folder, depth) => {
        const id = folder.id;
        const isExpanded = expandedIds.has(id);
        const isLoadingKids = loadingIds.has(id);
        const isSelected = selectedFolderId === id;
        const kids = childrenCache[id] || [];
        const hasKids = !childrenCache[id] || kids.length > 0;

        return (
            <div key={id}>
                <div
                    className={`tree-picker__row ${isSelected ? 'tree-picker__row--selected' : ''}`}
                    style={{ paddingLeft: depth * 18 + 6 }}
                    onClick={() => handleSelect(folder)}
                    onDoubleClick={(e) => toggleExpand(folder, e)}
                    role="treeitem"
                    aria-expanded={isExpanded}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelect(folder);
                        } else if (e.key === 'ArrowRight' && !isExpanded) {
                            e.preventDefault();
                            toggleExpand(folder, e);
                        } else if (e.key === 'ArrowLeft' && isExpanded) {
                            e.preventDefault();
                            toggleExpand(folder, e);
                        }
                    }}
                >
                    <button
                        type="button"
                        className="tree-picker__chevron"
                        onClick={(e) => toggleExpand(folder, e)}
                        tabIndex={-1}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isLoadingKids ? (
                            <span className="tree-picker__spinner">…</span>
                        ) : hasKids ? (
                            <span className={`tree-picker__chevron-icon ${isExpanded ? 'tree-picker__chevron-icon--open' : ''}`}>▸</span>
                        ) : (
                            <span className="tree-picker__chevron-spacer" />
                        )}
                    </button>
                    <span className="tree-picker__icon">{Icons.folder}</span>
                    <span className="tree-picker__name">{folder.name}</span>
                </div>
                {isExpanded && kids.length > 0 && (
                    <div role="group">
                        {kids.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="tree-picker">
            {breadcrumb && breadcrumb.length > 0 && (
                <div className="tree-picker__breadcrumb">
                    <span className="tree-picker__breadcrumb-label">Selected:</span>
                    {breadcrumb.map((seg, i) => (
                        <span key={seg.id} className="tree-picker__breadcrumb-segment">
                            {i > 0 && <span className="tree-picker__breadcrumb-sep">›</span>}
                            <span className="tree-picker__breadcrumb-name">{seg.name}</span>
                        </span>
                    ))}
                </div>
            )}
            <div className="tree-picker__body" role="tree">
                {loading ? (
                    <div className="tree-picker__empty">Loading folders…</div>
                ) : error ? (
                    <div className="tree-picker__empty tree-picker__empty--error">{error}</div>
                ) : rootFolders.length === 0 ? (
                    <div className="tree-picker__empty">No folders available</div>
                ) : (
                    rootFolders.map(f => renderNode(f, 0))
                )}
            </div>
        </div>
    );
}
