import { useState, useEffect, useCallback } from 'react';
import FolderTreeItem from './FolderTreeItem';
import Icons from '../common/Icons';
import * as api from '../../api';

export default function FolderTree({ activeFolderId, onSelectFolder, onCreateFolder, onCreateSubfolder, onRenameFolder, onDeleteFolder, refreshKey, filter = '', expandAll }) {
    const [rootFolders, setRootFolders] = useState([]);
    const [childrenCache, setChildrenCache] = useState({});
    const [fileCountCache, setFileCountCache] = useState({});
    const [loading, setLoading] = useState(true);

    const loadRoot = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.listFolders(null);
            setRootFolders(data.folders || []);
        } catch (err) {
            console.error('Failed to load root folders:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setChildrenCache({});
        setFileCountCache({});
        loadRoot();
    }, [loadRoot, refreshKey]);

    const handleLoadChildren = useCallback(async (folderId) => {
        try {
            const data = await api.getFolder(folderId);
            setChildrenCache(prev => ({ ...prev, [folderId]: data.children || [] }));
            setFileCountCache(prev => ({ ...prev, [folderId]: (data.files || []).length }));
        } catch (err) {
            console.error('Failed to load folder children:', err);
        }
    }, []);

    // Search filter: children are lazy-loaded, so we can only filter/search
    // nodes that have already been fetched (root + any expanded branch).
    // While a filter is active, eagerly load every root folder's children
    // (one level) so first-level matches are always reachable via search,
    // without changing the lazy-loading behavior when no filter is active.
    const normalizedFilter = filter.trim().toLowerCase();
    useEffect(() => {
        if (!normalizedFilter || rootFolders.length === 0) return;
        rootFolders.forEach(f => {
            if (!childrenCache[f.id]) handleLoadChildren(f.id);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [normalizedFilter, rootFolders]);

    // Returns true if this folder or any of its (already-loaded) descendants
    // match the filter — used to keep ancestors of a match visible/expanded.
    const subtreeMatches = useCallback((folder) => {
        if (!normalizedFilter) return true;
        if (folder.name.toLowerCase().includes(normalizedFilter)) return true;
        const kids = childrenCache[folder.id] || [];
        return kids.some(subtreeMatches);
    }, [normalizedFilter, childrenCache]);

    const visibleRoots = normalizedFilter ? rootFolders.filter(subtreeMatches) : rootFolders;

    // When "All" (expand/collapse-all) is toggled on, eagerly load every root
    // folder's children so FolderTreeItem's expandAll effect has data to show.
    useEffect(() => {
        if (!expandAll || rootFolders.length === 0) return;
        rootFolders.forEach(f => { if (!childrenCache[f.id]) handleLoadChildren(f.id); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandAll, rootFolders]);

    return (
        <div className="folder-tree">
            <div className="folder-tree__header">
                <span className="folder-tree__label">FOLDERS</span>
                <button
                    className="btn--icon"
                    title="New Folder"
                    onClick={onCreateFolder}
                >
                    {Icons.plus || '+'}
                </button>
            </div>
            <div className="folder-tree__list">
                {loading ? (
                    <div className="folder-tree__loading">Loading...</div>
                ) : visibleRoots.length === 0 ? (
                    <div className="folder-tree__empty">{normalizedFilter ? 'No folders match' : 'No folders yet'}</div>
                ) : (
                    visibleRoots.map(folder => (
                        <FolderTreeItem
                            key={folder.id}
                            folder={folder}
                            depth={0}
                            isActive={activeFolderId === folder.id}
                            activeFolderId={activeFolderId}
                            onSelect={onSelectFolder}
                            onLoadChildren={handleLoadChildren}
                            onCreateSubfolder={onCreateSubfolder}
                            onRenameFolder={onRenameFolder}
                            onDeleteFolder={onDeleteFolder}
                            childrenCache={childrenCache}
                            fileCountCache={fileCountCache}
                            filter={normalizedFilter}
                            subtreeMatches={subtreeMatches}
                            expandAll={expandAll}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
