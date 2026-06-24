import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import Icons from '../components/common/Icons';
import { useUndoStack } from '../hooks/useUndoStack';
import { useToast } from '../hooks/useToast';
import FolderTree from '../components/files/FolderTree';
import FileList from '../components/files/FileList';
import * as api from '../api';

export default function FilesPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const undoState = useUndoStack();
    const { showToast } = useToast();

    const [selectedFolder, setSelectedFolder] = useState(null);
    const [files, setFiles] = useState([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [nameModal, setNameModal] = useState(null);
    const [deleteModal, setDeleteModal] = useState(null);
    const [conflictModal, setConflictModal] = useState(null);
    const [moveModal, setMoveModal] = useState(null);
    const [trashModal, setTrashModal] = useState(null);
    const [folders, setFolders] = useState([]);
    const [treeRefreshKey, setTreeRefreshKey] = useState(0);
    const [search, setSearch] = useState('');
    const nameInputRef = useRef(null);

    const loadFiles = useCallback(async (folder) => {
        if (!folder) { setFiles([]); return; }
        setLoadingFiles(true);
        setSelected(new Set());
        try {
            const data = await api.getFolder(folder.id);
            setFiles(data.files.map(f => ({
                id: f.id,
                name: f.name,
                size: f.fileSize,
                mimeType: f.mimeType,
                updatedAt: f.updatedAt,
                uploadedBy: f.uploader?.name,
            })));
        } catch (err) {
            console.error('Failed to load files:', err);
        } finally {
            setLoadingFiles(false);
        }
    }, []);

    const handleSelectFolder = useCallback((folder) => {
        setSelectedFolder(folder);
        loadFiles(folder);
    }, [loadFiles]);

    useEffect(() => {
        const initFolder = searchParams.get('folder');
        if (initFolder) {
            api.getFolder(initFolder).then(data => {
                setSelectedFolder(data.folder);
                setFiles(data.files.map(f => ({
                    id: f.id,
                    name: f.name,
                    size: f.fileSize,
                    mimeType: f.mimeType,
                    updatedAt: f.updatedAt,
                    uploadedBy: f.uploader?.name,
                })));
            }).catch(() => {});
        }
    }, [searchParams]);

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
            showToast('Preview failed', 'error');
        }
    }, [showToast]);

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
            showToast('Download failed', 'error');
        }
    }, [showToast]);

    const handleUpload = useCallback(async (uploadFiles) => {
        if (!selectedFolder) return;
        for (const file of uploadFiles) {
            try {
                await api.uploadAdminFile(selectedFolder.id, file);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    setConflictModal({ file, folderId: selectedFolder.id });
                    return;
                }
                showToast('Upload failed: ' + err.message, 'error');
            }
        }
        loadFiles(selectedFolder);
        setTreeRefreshKey(k => k + 1);
    }, [selectedFolder, loadFiles, showToast]);

    const handleConflictReplace = useCallback(async () => {
        if (!conflictModal) return;
        const { file, folderId } = conflictModal;
        const existing = files.find(f => f.name === file.name);
        if (existing) await api.deleteAdminFile(existing.id);
        await api.uploadAdminFile(folderId, file);
        setConflictModal(null);
        loadFiles(selectedFolder);
    }, [conflictModal, files, selectedFolder, loadFiles]);

    const handleConflictKeepBoth = useCallback(async () => {
        if (!conflictModal) return;
        const { file, folderId } = conflictModal;
        const nameParts = file.name.split('.');
        const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
        const baseName = nameParts.join('.');
        let counter = 1;
        let newName = `${baseName} (${counter})${ext}`;
        const existingNames = files.map(f => f.name);
        while (existingNames.includes(newName)) { counter++; newName = `${baseName} (${counter})${ext}`; }
        const renamedFile = new File([file], newName, { type: file.type });
        await api.uploadAdminFile(folderId, renamedFile);
        setConflictModal(null);
        loadFiles(selectedFolder);
    }, [conflictModal, files, selectedFolder, loadFiles]);

    const handleRename = useCallback((file) => {
        setNameModal({ mode: 'rename', item: file, defaultValue: file.name });
    }, []);

    const handleDelete = useCallback((file) => {
        setDeleteModal([file]);
    }, []);

    const handleEditPdf = useCallback((file, folderId) => {
        navigate(`/files/edit/${file.id}?folder=${folderId}`);
    }, [navigate]);

    const handleDeleteConfirmed = useCallback(async () => {
        if (deleteModal.type === 'folder') {
            try {
                await api.deleteFolder(deleteModal.item.id);
                setTreeRefreshKey(k => k + 1);
                if (selectedFolder?.id === deleteModal.item.id) {
                    setSelectedFolder(null);
                    setFiles([]);
                }
                showToast('Folder deleted');
            } catch (err) {
                showToast(err.message || 'Failed to delete folder', 'error');
            }
        } else {
            const itemsToDelete = Array.isArray(deleteModal) ? deleteModal : deleteModal.items;
            for (const item of itemsToDelete) {
                await api.deleteAdminFile(item.id);
            }
            setSelected(new Set());
            loadFiles(selectedFolder);
            setTreeRefreshKey(k => k + 1);
        }
        setDeleteModal(null);
    }, [deleteModal, selectedFolder, loadFiles, showToast]);

    const handleToggleSelect = useCallback((fileId) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selected.size === files.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(files.map(f => f.id)));
        }
    }, [files, selected]);

    const handleBulkDelete = useCallback(() => {
        const items = files.filter(f => selected.has(f.id));
        if (items.length) setDeleteModal(items);
    }, [files, selected]);

    const handleBulkDownload = useCallback(async () => {
        const items = files.filter(f => selected.has(f.id));
        for (const file of items) { await handleDownload(file); }
    }, [files, selected, handleDownload]);

    const handleCreateFolder = useCallback(() => {
        setNameModal({ mode: 'create', item: null, defaultValue: '' });
    }, []);

    const handleRenameFolder = useCallback((folder) => {
        setNameModal({ mode: 'renameFolder', item: folder, defaultValue: folder.name });
    }, []);

    const handleDeleteFolder = useCallback((folder) => {
        setDeleteModal({ type: 'folder', item: folder });
    }, []);

    const handleViewTrash = useCallback(async () => {
        try {
            const data = await api.listArchivedFolders();
            setTrashModal(data.folders || []);
        } catch (err) {
            showToast('Failed to load deleted folders', 'error');
        }
    }, [showToast]);

    const handleRestoreFolder = useCallback(async (folder) => {
        try {
            await api.restoreFolder(folder.id);
            showToast(`Folder "${folder.name}" restored`);
            setTrashModal(prev => prev.filter(f => f.id !== folder.id));
            setTreeRefreshKey(k => k + 1);
        } catch (err) {
            showToast(err.message || 'Failed to restore folder', 'error');
        }
    }, [showToast]);

    const handleMoveFiles = useCallback(async () => {
        const allFolders = await api.listFolders(null);
        const flat = [];
        const flatten = async (parentId) => {
            const data = await api.listFolders(parentId);
            for (const f of (data.folders || [])) {
                flat.push(f);
                await flatten(f.id);
            }
        };
        for (const f of (allFolders.folders || [])) {
            flat.push(f);
            await flatten(f.id);
        }
        setFolders(flat);
        setMoveModal({ fileIds: [...selected] });
    }, [selected]);

    const handleNameSubmit = useCallback(async (e) => {
        e.preventDefault();
        const value = nameInputRef.current?.value?.trim();
        if (!value) return;
        if (nameModal.mode === 'create') {
            try {
                await api.createFolder(value, selectedFolder?.id || null);
                setTreeRefreshKey(k => k + 1);
            } catch (err) {
                showToast(err.message || 'Failed to create folder', 'error');
            }
        } else if (nameModal.mode === 'rename') {
            if (value !== nameModal.item.name) {
                await api.renameFile(nameModal.item.id, value);
                loadFiles(selectedFolder);
            }
        } else if (nameModal.mode === 'renameFolder') {
            if (value !== nameModal.item.name) {
                try {
                    await api.renameFolder(nameModal.item.id, value);
                    setTreeRefreshKey(k => k + 1);
                    if (selectedFolder?.id === nameModal.item.id) {
                        setSelectedFolder(prev => ({ ...prev, name: value }));
                    }
                } catch (err) {
                    showToast(err.message || 'Failed to rename folder', 'error');
                }
            }
        }
        setNameModal(null);
    }, [nameModal, selectedFolder, loadFiles, showToast]);

    const handleExportAll = useCallback(async () => {
        try {
            const token = api.getToken();
            const res = await fetch('/api/files/export', { headers: { 'Authorization': `Bearer ${token}` } });
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

    const filteredFiles = search
        ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
        : files;

    return (
        <div className="files-page">
            <GlobalToolbar
                title="Files"
                subtitle={selectedFolder ? selectedFolder.name : 'Administrative Documents'}
                icon={Icons.folder}
                undoState={undoState}
                activityEntity="AdminFile"
                overflowItems={[
                    { label: 'Deleted Folders', icon: Icons.trash, action: handleViewTrash },
                    { label: 'Export All Files', icon: Icons.download, action: handleExportAll },
                ]}
            />
            <ContextBar>
                <ContextBar.Left>
                    <input
                        type="text"
                        className="context-bar__search"
                        placeholder="Search files..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {files.length > 0 && (
                        <label className="files-page__select-all" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={files.length > 0 && selected.size === files.length}
                                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < files.length; }}
                                onChange={handleSelectAll}
                            />
                            <span>Select All</span>
                        </label>
                    )}
                    {selected.size > 0 && (
                        <>
                            <span className="files-page__selection-count">{selected.size} selected</span>
                            <button className="btn btn--outline btn--sm" onClick={handleMoveFiles}>{Icons.folder} Move</button>
                            <button className="btn btn--danger btn--sm" onClick={handleBulkDelete}>{Icons.trash} Delete</button>
                            <button className="btn btn--secondary btn--sm" onClick={handleBulkDownload}>{Icons.download} Download</button>
                            <button className="btn btn--outline btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
                        </>
                    )}
                </ContextBar.Left>
                <ContextBar.Right>
                    {selectedFolder && (
                        <label className="btn btn--primary btn--sm" style={{ cursor: 'pointer' }}>
                            {Icons.upload} Upload File
                            <input type="file" multiple hidden onChange={(e) => { if (e.target.files.length) handleUpload(Array.from(e.target.files)); e.target.value = ''; }} />
                        </label>
                    )}
                </ContextBar.Right>
            </ContextBar>

            <div className="files-page__panels">
                <div className="files-page__left">
                    <FolderTree
                        activeFolderId={selectedFolder?.id}
                        onSelectFolder={handleSelectFolder}
                        onCreateFolder={handleCreateFolder}
                        onRenameFolder={handleRenameFolder}
                        onDeleteFolder={handleDeleteFolder}
                        refreshKey={treeRefreshKey}
                    />
                </div>
                <div className="files-page__right">
                    {loadingFiles ? (
                        <div className="file-list file-list--empty-state"><p>Loading...</p></div>
                    ) : (
                        <FileList
                            folder={selectedFolder}
                            files={filteredFiles}
                            selected={selected}
                            onToggleSelect={handleToggleSelect}
                            onPreview={handlePreview}
                            onDownload={handleDownload}
                            onRename={handleRename}
                            onDelete={handleDelete}
                            onEditPdf={handleEditPdf}
                            onUpload={handleUpload}
                        />
                    )}
                </div>
            </div>

            {nameModal && (
                <Modal onClose={() => setNameModal(null)}>
                    <h2 className="modal__title">{nameModal.mode === 'create' ? 'New Folder' : nameModal.mode === 'renameFolder' ? 'Rename Folder' : 'Rename File'}</h2>
                    <form onSubmit={handleNameSubmit}>
                        <div className="form-group">
                            <label className="form-label">{nameModal.mode === 'create' ? 'Folder name' : 'New name'}</label>
                            <input ref={nameInputRef} className="form-input" type="text" defaultValue={nameModal.defaultValue} autoFocus placeholder={nameModal.mode === 'create' ? 'Enter folder name' : 'Enter new name'} />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn--outline" onClick={() => setNameModal(null)}>Cancel</button>
                            <button type="submit" className="btn btn--primary">{nameModal.mode === 'create' ? 'Create' : 'Rename'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {moveModal && (
                <Modal onClose={() => setMoveModal(null)}>
                    <h2 className="modal__title">Move {moveModal.fileIds.length} file{moveModal.fileIds.length !== 1 ? 's' : ''} to...</h2>
                    <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 8, marginBottom: 16 }}>
                        {folders.filter(f => f.id !== selectedFolder?.id).map(f => (
                            <button
                                key={f.id}
                                className="btn btn--ghost"
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 8 }}
                                onClick={async () => {
                                    try {
                                        for (const fileId of moveModal.fileIds) {
                                            await api.moveFile(fileId, f.id);
                                        }
                                        showToast(`Moved ${moveModal.fileIds.length} file${moveModal.fileIds.length !== 1 ? 's' : ''} to ${f.name}`);
                                        setMoveModal(null);
                                        setSelected(new Set());
                                        loadFiles(selectedFolder);
                                        setTreeRefreshKey(k => k + 1);
                                    } catch (err) {
                                        showToast(err.message || 'Move failed', 'error');
                                    }
                                }}
                            >
                                {Icons.folder}
                                <span>{f.path || f.name}</span>
                            </button>
                        ))}
                        {folders.filter(f => f.id !== selectedFolder?.id).length === 0 && (
                            <div style={{ padding: 16, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>No other folders available</div>
                        )}
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setMoveModal(null)}>Cancel</button>
                    </div>
                </Modal>
            )}

            {deleteModal && (
                <ConfirmModal
                    title={deleteModal.type === 'folder' ? 'Delete Folder' : `Delete ${Array.isArray(deleteModal) && deleteModal.length === 1 ? 'file' : `${(Array.isArray(deleteModal) ? deleteModal.length : 1)} files`}`}
                    message={deleteModal.type === 'folder'
                        ? `Delete folder "${deleteModal.item.name}" and all its contents? This cannot be undone.`
                        : Array.isArray(deleteModal) && deleteModal.length === 1
                            ? `Delete "${deleteModal[0].name}"? This cannot be undone.`
                            : `Delete ${deleteModal.length} files? This cannot be undone.`}
                    confirmLabel="Delete"
                    confirmVariant="danger"
                    onConfirm={handleDeleteConfirmed}
                    onClose={() => setDeleteModal(null)}
                />
            )}

            {conflictModal && (
                <Modal onClose={() => setConflictModal(null)}>
                    <h2 className="modal__title">File Already Exists</h2>
                    <p className="modal__desc">A file named "{conflictModal.file.name}" already exists in this folder.</p>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setConflictModal(null)}>Cancel</button>
                        <button className="btn btn--secondary" onClick={handleConflictKeepBoth}>Keep Both</button>
                        <button className="btn btn--danger" onClick={handleConflictReplace}>Replace</button>
                    </div>
                </Modal>
            )}

            {trashModal && (
                <Modal onClose={() => setTrashModal(null)}>
                    <h2 className="modal__title">Deleted Folders</h2>
                    <p className="modal__desc">These folders have been deleted. You can restore them to bring them back.</p>
                    {trashModal.length === 0 ? (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                            No deleted folders
                        </div>
                    ) : (
                        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 8, marginBottom: 16 }}>
                            {trashModal.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ display: 'flex', width: 16, height: 16 }}>{Icons.folder}</span>
                                        <span style={{ fontSize: 14 }}>{f.path || f.name}</span>
                                    </div>
                                    <button className="btn btn--primary btn--sm" onClick={() => handleRestoreFolder(f)}>
                                        Restore
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setTrashModal(null)}>Close</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
