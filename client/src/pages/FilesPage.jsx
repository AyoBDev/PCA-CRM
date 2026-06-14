import { useState, useEffect, useCallback } from 'react';
import GlobalToolbar from '../components/common/GlobalToolbar';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function FilesPage() {
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folderStack, setFolderStack] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadFolder = useCallback(async (folderId) => {
        setLoading(true);
        try {
            if (folderId) {
                const data = await api.getFolder(folderId);
                const mapped = [
                    ...data.children.map(f => ({
                        name: f.name,
                        isDirectory: true,
                        id: f.id,
                        path: f.path,
                        updatedAt: f.updatedAt,
                    })),
                    ...data.files.map(f => ({
                        name: f.name,
                        isDirectory: false,
                        id: f.id,
                        size: f.fileSize,
                        mimeType: f.mimeType,
                        updatedAt: f.updatedAt,
                        uploadedBy: f.uploader?.name,
                    })),
                ];
                setItems(mapped);
                setCurrentFolder(data.folder);
            } else {
                const data = await api.listFolders(null);
                const mapped = [
                    ...data.folders.map(f => ({
                        name: f.name,
                        isDirectory: true,
                        id: f.id,
                        path: f.path,
                        updatedAt: f.updatedAt,
                    })),
                    ...data.files.map(f => ({
                        name: f.name,
                        isDirectory: false,
                        id: f.id,
                        size: f.fileSize,
                        mimeType: f.mimeType,
                        updatedAt: f.updatedAt,
                        uploadedBy: f.uploader?.name,
                    })),
                ];
                setItems(mapped);
                setCurrentFolder(null);
            }
        } catch (err) {
            console.error('Failed to load folder:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadFolder(null); }, [loadFolder]);

    const handleDownload = useCallback(async (file) => {
        try {
            const token = api.getToken();
            const res = await fetch(`/api/files/${file.id}/download`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
        }
    }, []);

    const handleFileOpen = useCallback((file) => {
        if (file.isDirectory) {
            setFolderStack(prev => [...prev, currentFolder]);
            loadFolder(file.id);
        } else {
            handleDownload(file);
        }
    }, [currentFolder, loadFolder, handleDownload]);

    const handleNavigateBack = useCallback(() => {
        const prev = folderStack[folderStack.length - 1];
        setFolderStack(s => s.slice(0, -1));
        loadFolder(prev?.id || null);
    }, [folderStack, loadFolder]);

    const handleCreateFolder = useCallback(async (name) => {
        await api.createFolder(name, currentFolder?.id || null);
        loadFolder(currentFolder?.id || null);
    }, [currentFolder, loadFolder]);

    const handleUpload = useCallback(async (files) => {
        if (!currentFolder) return;
        for (const file of files) {
            await api.uploadAdminFile(currentFolder.id, file);
        }
        loadFolder(currentFolder.id);
    }, [currentFolder, loadFolder]);

    const handleRename = useCallback(async (item, newName) => {
        if (item.isDirectory) {
            await api.renameFolder(item.id, newName);
        } else {
            await api.renameFile(item.id, newName);
        }
        loadFolder(currentFolder?.id || null);
    }, [currentFolder, loadFolder]);

    const handleDelete = useCallback(async (items) => {
        if (!window.confirm(`Delete ${items.length} item(s)? This cannot be undone.`)) return;
        for (const item of items) {
            if (item.isDirectory) {
                await api.deleteFolder(item.id);
            } else {
                await api.deleteAdminFile(item.id);
            }
        }
        loadFolder(currentFolder?.id || null);
    }, [currentFolder, loadFolder]);

    // Build breadcrumb path
    const breadcrumbs = [{ name: 'Root', id: null }];
    if (folderStack.length) {
        for (const f of folderStack) {
            if (f) breadcrumbs.push({ name: f.name, id: f.id });
        }
    }
    if (currentFolder) breadcrumbs.push({ name: currentFolder.name, id: currentFolder.id });

    return (
        <div className="files-page">
            <GlobalToolbar
                title="Files"
                subtitle="Administrative Documents"
                icon={Icons.folder}
                hideUndo
            />
            <div className="files-page__breadcrumbs">
                {breadcrumbs.map((b, i) => (
                    <span key={b.id ?? 'root'}>
                        {i > 0 && <span className="files-page__breadcrumb-sep">›</span>}
                        <button
                            className={`files-page__breadcrumb${i === breadcrumbs.length - 1 ? ' files-page__breadcrumb--active' : ''}`}
                            onClick={() => {
                                if (i < breadcrumbs.length - 1) {
                                    setFolderStack(folderStack.slice(0, i));
                                    loadFolder(b.id);
                                }
                            }}
                            disabled={i === breadcrumbs.length - 1}
                        >
                            {b.name}
                        </button>
                    </span>
                ))}
            </div>
            <div className="files-page__toolbar">
                {currentFolder && (
                    <button className="btn btn--secondary btn--sm" onClick={handleNavigateBack}>
                        ← Back
                    </button>
                )}
                <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                        const name = prompt('New folder name:');
                        if (name) handleCreateFolder(name);
                    }}
                >
                    + New Folder
                </button>
                {currentFolder && (
                    <label className="btn btn--primary btn--sm" style={{ cursor: 'pointer' }}>
                        ⬆ Upload
                        <input
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                                if (e.target.files.length) handleUpload(Array.from(e.target.files));
                                e.target.value = '';
                            }}
                        />
                    </label>
                )}
            </div>
            {loading ? (
                <div className="files-page__loading">Loading…</div>
            ) : items.length === 0 ? (
                <div className="files-page__empty">
                    {currentFolder ? 'This folder is empty. Upload files or create subfolders.' : 'No folders yet.'}
                </div>
            ) : (
                <div className="files-page__grid">
                    {items.map(item => (
                        <div
                            key={`${item.isDirectory ? 'f' : 'd'}-${item.id}`}
                            className="files-page__item"
                            onDoubleClick={() => handleFileOpen(item)}
                        >
                            <div className="files-page__item-icon">
                                {item.isDirectory ? '📁' : '📄'}
                            </div>
                            <div className="files-page__item-name" title={item.name}>
                                {item.name}
                            </div>
                            {!item.isDirectory && (
                                <div className="files-page__item-meta">
                                    {formatSize(item.size)}
                                </div>
                            )}
                            <div className="files-page__item-actions">
                                <button
                                    className="btn--icon"
                                    title="Rename"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newName = prompt('Rename to:', item.name);
                                        if (newName && newName !== item.name) handleRename(item, newName);
                                    }}
                                >✏️</button>
                                <button
                                    className="btn--icon"
                                    title="Delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete([item]);
                                    }}
                                >🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
