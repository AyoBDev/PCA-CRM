import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import Icons from '../components/common/Icons';
import { useUndoStack } from '../hooks/useUndoStack';
import { useToast } from '../hooks/useToast';
import * as api from '../api';

export default function FilesPage() {
    const navigate = useNavigate();
    const undoState = useUndoStack();
    const { showToast } = useToast();
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folderStack, setFolderStack] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nameModal, setNameModal] = useState(null);
    const [deleteModal, setDeleteModal] = useState(null);
    const [conflictModal, setConflictModal] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const nameInputRef = useRef(null);

    const loadFolder = useCallback(async (folderId) => {
        setLoading(true);
        setSelected(new Set());
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

    const handlePreview = useCallback(async (file) => {
        try {
            const token = api.getToken();
            const res = await fetch(`/api/files/${file.id}/download`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Preview failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (err) {
            console.error('Preview failed:', err);
        }
    }, []);

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
            handlePreview(file);
        }
    }, [currentFolder, loadFolder, handlePreview]);

    const handleNavigateBack = useCallback(() => {
        const prev = folderStack[folderStack.length - 1];
        setFolderStack(s => s.slice(0, -1));
        loadFolder(prev?.id || null);
    }, [folderStack, loadFolder]);

    const handleCreateFolder = useCallback(async (name) => {
        try {
            await api.createFolder(name, currentFolder?.id || null);
            loadFolder(currentFolder?.id || null);
        } catch (err) {
            showToast(err.message || 'Failed to create folder', 'error');
        }
    }, [currentFolder, loadFolder, showToast]);

    const handleUpload = useCallback(async (files) => {
        if (!currentFolder) return;
        for (const file of files) {
            try {
                await api.uploadAdminFile(currentFolder.id, file);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    setConflictModal({ file, folderId: currentFolder.id });
                    return;
                }
            }
        }
        loadFolder(currentFolder.id);
    }, [currentFolder, loadFolder]);

    const handleConflictReplace = useCallback(async () => {
        if (!conflictModal) return;
        const { file, folderId } = conflictModal;
        const existing = items.find(i => !i.isDirectory && i.name === file.name);
        if (existing) {
            await api.deleteAdminFile(existing.id);
        }
        await api.uploadAdminFile(folderId, file);
        setConflictModal(null);
        loadFolder(folderId);
    }, [conflictModal, items, loadFolder]);

    const handleConflictKeepBoth = useCallback(async () => {
        if (!conflictModal) return;
        const { file, folderId } = conflictModal;
        const nameParts = file.name.split('.');
        const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
        const baseName = nameParts.join('.');
        let counter = 1;
        let newName = `${baseName} (${counter})${ext}`;
        const existingNames = items.filter(i => !i.isDirectory).map(i => i.name);
        while (existingNames.includes(newName)) {
            counter++;
            newName = `${baseName} (${counter})${ext}`;
        }
        const renamedFile = new File([file], newName, { type: file.type });
        await api.uploadAdminFile(folderId, renamedFile);
        setConflictModal(null);
        loadFolder(folderId);
    }, [conflictModal, items, loadFolder]);

    const handleRename = useCallback(async (item, newName) => {
        if (item.isDirectory) {
            await api.renameFolder(item.id, newName);
        } else {
            await api.renameFile(item.id, newName);
        }
        loadFolder(currentFolder?.id || null);
    }, [currentFolder, loadFolder]);

    const handleDeleteConfirmed = useCallback(async (itemsToDelete) => {
        for (const item of itemsToDelete) {
            if (item.isDirectory) {
                await api.deleteFolder(item.id);
            } else {
                await api.deleteAdminFile(item.id);
            }
        }
        setDeleteModal(null);
        setSelected(new Set());
        loadFolder(currentFolder?.id || null);
    }, [currentFolder, loadFolder]);

    const itemKey = (item) => `${item.isDirectory ? 'f' : 'd'}-${item.id}`;

    const handleSelectAll = useCallback(() => {
        if (selected.size === items.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(items.map(i => itemKey(i))));
        }
    }, [items, selected]);

    const selectedItems = items.filter(i => selected.has(itemKey(i)));

    const handleBulkDelete = useCallback(() => {
        if (selectedItems.length) setDeleteModal(selectedItems);
    }, [selectedItems]);

    const handleBulkDownload = useCallback(async () => {
        const files = selectedItems.filter(i => !i.isDirectory);
        for (const file of files) {
            await handleDownload(file);
        }
    }, [selectedItems, handleDownload]);

    const handleExportAll = useCallback(async () => {
        try {
            const token = api.getToken();
            const res = await fetch('/api/files/export', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'admin-files-export.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast('Export failed: ' + err.message, 'error');
        }
    }, [showToast]);

    const handleNameSubmit = useCallback((e) => {
        e.preventDefault();
        const value = nameInputRef.current?.value?.trim();
        if (!value) return;
        if (nameModal.mode === 'create') {
            handleCreateFolder(value);
        } else if (nameModal.mode === 'rename') {
            if (value !== nameModal.item.name) {
                handleRename(nameModal.item, value);
            }
        }
        setNameModal(null);
    }, [nameModal, handleCreateFolder, handleRename]);

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
                undoState={undoState}
                activityEntity="AdminFile"
                overflowItems={[
                    { label: 'Export All Files', icon: Icons.download, action: handleExportAll },
                ]}
            />
            <div className="files-page__breadcrumbs">
                {breadcrumbs.map((b, i) => (
                    <span key={b.id ?? 'root'}>
                        {i > 0 && <span className="files-page__breadcrumb-sep">&rsaquo;</span>}
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
            <ContextBar>
                <ContextBar.Left>
                    {currentFolder && (
                        <button className="btn btn--secondary btn--sm" onClick={handleNavigateBack}>
                            {Icons.chevronLeft} Back
                        </button>
                    )}
                    {items.length > 0 && (
                        <label className="files-page__select-all" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={items.length > 0 && selected.size === items.length}
                                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < items.length; }}
                                onChange={handleSelectAll}
                            />
                            <span>Select All</span>
                        </label>
                    )}
                    {selected.size > 0 && (
                        <span className="files-page__selection-count">
                            {selected.size} selected
                        </span>
                    )}
                    {selected.size > 0 && (
                        <>
                            <button className="btn btn--danger btn--sm" onClick={handleBulkDelete}>
                                {Icons.trash} Delete
                            </button>
                            {selectedItems.some(i => !i.isDirectory) && (
                                <button className="btn btn--secondary btn--sm" onClick={handleBulkDownload}>
                                    {Icons.download} Download
                                </button>
                            )}
                            <button className="btn btn--outline btn--sm" onClick={() => setSelected(new Set())}>
                                Clear
                            </button>
                        </>
                    )}
                </ContextBar.Left>
                <ContextBar.Right>
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={() => setNameModal({ mode: 'create', item: null, defaultValue: '' })}
                    >
                        + New Folder
                    </button>
                    {currentFolder && (
                        <label className="btn btn--primary btn--sm" style={{ cursor: 'pointer' }}>
                            {Icons.upload} Upload
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
                </ContextBar.Right>
            </ContextBar>
            {loading ? (
                <div className="files-page__loading">Loading...</div>
            ) : items.length === 0 ? (
                <div className="files-page__empty">
                    {currentFolder ? 'This folder is empty. Upload files or create subfolders.' : 'No folders yet.'}
                </div>
            ) : (
                <div className="files-page__grid">
                    {items.map(item => (
                        <div
                            key={itemKey(item)}
                            className={`files-page__item${selected.has(itemKey(item)) ? ' files-page__item--selected' : ''}`}
                            onClick={() => handleFileOpen(item)}
                        >
                            <label className="files-page__item-checkbox" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    checked={selected.has(itemKey(item))}
                                    onChange={() => {
                                        const key = itemKey(item);
                                        setSelected(prev => {
                                            const next = new Set(prev);
                                            if (next.has(key)) next.delete(key);
                                            else next.add(key);
                                            return next;
                                        });
                                    }}
                                />
                            </label>
                            <div className="files-page__item-icon">
                                {item.isDirectory ? Icons.folder : Icons.fileText}
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
                                {!item.isDirectory && item.mimeType === 'application/pdf' && (
                                    <button
                                        className="btn--icon"
                                        title="Edit PDF"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/files/edit/${item.id}?folder=${currentFolder?.id || ''}`);
                                        }}
                                    >
                                        {Icons.pen}
                                    </button>
                                )}
                                {!item.isDirectory && (
                                    <button
                                        className="btn--icon"
                                        title="Download"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownload(item);
                                        }}
                                    >
                                        {Icons.download}
                                    </button>
                                )}
                                <button
                                    className="btn--icon"
                                    title="Rename"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setNameModal({ mode: 'rename', item, defaultValue: item.name });
                                    }}
                                >
                                    {Icons.edit}
                                </button>
                                <button
                                    className="btn--icon"
                                    title="Delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteModal([item]);
                                    }}
                                >
                                    {Icons.trash}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {nameModal && (
                <Modal onClose={() => setNameModal(null)}>
                    <h2 className="modal__title">
                        {nameModal.mode === 'create' ? 'New Folder' : 'Rename'}
                    </h2>
                    <form onSubmit={handleNameSubmit}>
                        <div className="form-group">
                            <label className="form-label">
                                {nameModal.mode === 'create' ? 'Folder name' : 'New name'}
                            </label>
                            <input
                                ref={nameInputRef}
                                className="form-input"
                                type="text"
                                defaultValue={nameModal.defaultValue}
                                autoFocus
                                placeholder={nameModal.mode === 'create' ? 'Enter folder name' : 'Enter new name'}
                            />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setNameModal(null)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn--primary">
                                {nameModal.mode === 'create' ? 'Create' : 'Rename'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {deleteModal && (
                <ConfirmModal
                    title={`Delete ${deleteModal.length === 1 ? (deleteModal[0].isDirectory ? 'folder' : 'file') : `${deleteModal.length} items`}`}
                    message={deleteModal.length === 1
                        ? `Are you sure you want to delete "${deleteModal[0].name}"? ${deleteModal[0].isDirectory ? 'All contents will be permanently removed.' : 'This cannot be undone.'}`
                        : `Are you sure you want to delete ${deleteModal.length} items? This cannot be undone.`
                    }
                    confirmLabel="Delete"
                    confirmVariant="danger"
                    onConfirm={() => handleDeleteConfirmed(deleteModal)}
                    onClose={() => setDeleteModal(null)}
                />
            )}

            {conflictModal && (
                <Modal onClose={() => setConflictModal(null)}>
                    <h2 className="modal__title">File Already Exists</h2>
                    <p className="modal__desc">
                        A file named "{conflictModal.file.name}" already exists in this folder.
                    </p>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setConflictModal(null)}>
                            Cancel
                        </button>
                        <button className="btn btn--secondary" onClick={handleConflictKeepBoth}>
                            Keep Both
                        </button>
                        <button className="btn btn--danger" onClick={handleConflictReplace}>
                            Replace
                        </button>
                    </div>
                </Modal>
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
