import { useState, useEffect, useCallback } from 'react';
import FolderTreeItem from './FolderTreeItem';
import Icons from '../common/Icons';
import * as api from '../../api';

export default function FolderTree({ activeFolderId, onSelectFolder, onCreateFolder, onRenameFolder, onDeleteFolder, refreshKey }) {
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
                ) : rootFolders.length === 0 ? (
                    <div className="folder-tree__empty">No folders yet</div>
                ) : (
                    rootFolders.map(folder => (
                        <FolderTreeItem
                            key={folder.id}
                            folder={folder}
                            depth={0}
                            isActive={activeFolderId === folder.id}
                            activeFolderId={activeFolderId}
                            onSelect={onSelectFolder}
                            onLoadChildren={handleLoadChildren}
                            onRenameFolder={onRenameFolder}
                            onDeleteFolder={onDeleteFolder}
                            childrenCache={childrenCache}
                            fileCountCache={fileCountCache}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
