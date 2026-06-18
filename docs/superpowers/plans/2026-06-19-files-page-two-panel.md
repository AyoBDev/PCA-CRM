# Files Page Two-Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-grid FilesPage with a two-panel file manager: expandable folder tree on the left, file list with always-visible actions on the right.

**Architecture:** FilesPage becomes a layout shell with two child components — FolderTree (left) and FileList (right). The folder tree fetches and caches folder data independently. Selecting a folder loads its files into the right panel. All existing CRUD operations (upload, rename, delete, preview, edit PDF, bulk actions) are preserved.

**Tech Stack:** React 19, existing API endpoints (no backend changes), CSS custom properties for theming.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `client/src/components/files/fileTypeUtils.js` | File type → color, icon SVG, label mapping |
| `client/src/components/files/UploadZone.jsx` | Drag-and-drop + click-to-upload area |
| `client/src/components/files/FileRow.jsx` | Single file row: icon, name, metadata, action buttons |
| `client/src/components/files/FileList.jsx` | Right panel: header, upload zone, file rows, empty state |
| `client/src/components/files/FolderTreeItem.jsx` | Single folder in tree: expand arrow, name, count badge |
| `client/src/components/files/FolderTree.jsx` | Left panel: recursive tree, fetches/caches folder data |
| `client/src/pages/FilesPage.jsx` | Rewrite: two-panel shell, state coordination, modals |
| `client/src/index.css` | Replace `.files-page__*` block with two-panel styles |

---

## Task 1: File Type Utilities

**Files:**
- Create: `client/src/components/files/fileTypeUtils.js`

- [ ] **Step 1: Create fileTypeUtils.js**

```javascript
export function getFileTypeInfo(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();

    const types = {
        pdf: { color: 'hsl(0 55% 42%)', label: 'PDF', icon: 'pdf' },
        xlsx: { color: 'hsl(140 60% 35%)', label: 'XLSX', icon: 'spreadsheet' },
        xls: { color: 'hsl(140 60% 35%)', label: 'XLS', icon: 'spreadsheet' },
        csv: { color: 'hsl(140 60% 35%)', label: 'CSV', icon: 'spreadsheet' },
        doc: { color: 'hsl(215 70% 50%)', label: 'DOC', icon: 'document' },
        docx: { color: 'hsl(215 70% 50%)', label: 'DOCX', icon: 'document' },
        jpg: { color: 'hsl(270 50% 50%)', label: 'JPG', icon: 'image' },
        jpeg: { color: 'hsl(270 50% 50%)', label: 'JPEG', icon: 'image' },
        png: { color: 'hsl(270 50% 50%)', label: 'PNG', icon: 'image' },
        gif: { color: 'hsl(270 50% 50%)', label: 'GIF', icon: 'image' },
        webp: { color: 'hsl(270 50% 50%)', label: 'WEBP', icon: 'image' },
    };

    return types[ext] || { color: 'hsl(215 15% 55%)', label: ext.toUpperCase() || 'FILE', icon: 'file' };
}

export function FileTypeIcon({ fileName, size = 24 }) {
    const { color, icon } = getFileTypeInfo(fileName);

    const icons = {
        pdf: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6" strokeWidth="2"/></svg>,
        spreadsheet: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
        document: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>,
        image: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
        file: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,
    };

    return icons[icon] || icons.file;
}

export function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p client/src/components/files
git add client/src/components/files/fileTypeUtils.js
git commit -m "feat: add file type utilities (color, icon, label mapping)"
```

---

## Task 2: UploadZone Component

**Files:**
- Create: `client/src/components/files/UploadZone.jsx`

- [ ] **Step 1: Create UploadZone.jsx**

```javascript
import { useState, useRef, useCallback } from 'react';

export default function UploadZone({ onUpload }) {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef(null);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragging(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onUpload(files);
    }, [onUpload]);

    const handleClick = useCallback(() => {
        inputRef.current?.click();
    }, []);

    const handleChange = useCallback((e) => {
        const files = Array.from(e.target.files);
        if (files.length) onUpload(files);
        e.target.value = '';
    }, [onUpload]);

    return (
        <div
            className={`upload-zone ${dragging ? 'upload-zone--active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <svg className="upload-zone__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4"/>
                <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/>
            </svg>
            <p className="upload-zone__text">
                Drag & drop or <span className="upload-zone__link">click to upload</span>
            </p>
            <input ref={inputRef} type="file" multiple hidden onChange={handleChange} />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/files/UploadZone.jsx
git commit -m "feat: add UploadZone component with drag-and-drop"
```

---

## Task 3: FileRow Component

**Files:**
- Create: `client/src/components/files/FileRow.jsx`

- [ ] **Step 1: Create FileRow.jsx**

```javascript
import Icons from '../common/Icons';
import { FileTypeIcon, getFileTypeInfo, formatFileSize, formatUploadDate } from './fileTypeUtils';

export default function FileRow({
    file,
    selected,
    onSelect,
    onPreview,
    onDownload,
    onRename,
    onDelete,
    onEditPdf,
    folderId,
}) {
    const { label } = getFileTypeInfo(file.name);
    const isPdf = file.mimeType === 'application/pdf';

    return (
        <div className={`file-row ${selected ? 'file-row--selected' : ''}`}>
            <label className="file-row__checkbox" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onSelect}
                />
            </label>
            <div className="file-row__icon">
                <FileTypeIcon fileName={file.name} size={28} />
            </div>
            <div className="file-row__name" title={file.name}>
                {file.name}
            </div>
            <div className="file-row__meta">
                {label} &middot; {formatFileSize(file.size)} &middot; Uploaded {formatUploadDate(file.updatedAt)}
            </div>
            <div className="file-row__actions">
                <button className="btn--icon" title="Preview" onClick={() => onPreview(file)}>
                    {Icons.eye}
                </button>
                <button className="btn--icon" title="Download" onClick={() => onDownload(file)}>
                    {Icons.download}
                </button>
                {isPdf && (
                    <button className="btn--icon" title="Edit PDF" onClick={() => onEditPdf(file, folderId)}>
                        {Icons.pen}
                    </button>
                )}
                <button className="btn--icon" title="Rename" onClick={() => onRename(file)}>
                    {Icons.edit}
                </button>
                <button className="btn--icon" title="Delete" onClick={() => onDelete(file)}>
                    {Icons.trash}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/files/FileRow.jsx
git commit -m "feat: add FileRow component with always-visible actions"
```

---

## Task 4: FileList Component (Right Panel)

**Files:**
- Create: `client/src/components/files/FileList.jsx`

- [ ] **Step 1: Create FileList.jsx**

```javascript
import { useState, useMemo } from 'react';
import UploadZone from './UploadZone';
import FileRow from './FileRow';

export default function FileList({
    folder,
    files,
    selected,
    onToggleSelect,
    onPreview,
    onDownload,
    onRename,
    onDelete,
    onEditPdf,
    onUpload,
}) {
    const [sortBy, setSortBy] = useState('name');
    const [filterType, setFilterType] = useState('all');

    const filtered = useMemo(() => {
        let list = files;
        if (filterType !== 'all') {
            list = list.filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                if (filterType === 'pdf') return ext === 'pdf';
                if (filterType === 'spreadsheet') return ['xlsx', 'xls', 'csv'].includes(ext);
                if (filterType === 'document') return ['doc', 'docx'].includes(ext);
                if (filterType === 'image') return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                return true;
            });
        }
        list = [...list].sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'date') return new Date(b.updatedAt) - new Date(a.updatedAt);
            if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
            return 0;
        });
        return list;
    }, [files, filterType, sortBy]);

    if (!folder) {
        return (
            <div className="file-list file-list--empty-state">
                <div className="file-list__placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <p>Select a folder to view its files</p>
                </div>
            </div>
        );
    }

    return (
        <div className="file-list">
            <div className="file-list__header">
                <h2 className="file-list__title">{folder.name}</h2>
                <div className="file-list__controls">
                    <select
                        className="file-list__filter"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="pdf">PDF</option>
                        <option value="spreadsheet">Spreadsheet</option>
                        <option value="document">Document</option>
                        <option value="image">Image</option>
                    </select>
                    <select
                        className="file-list__sort"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="name">Name</option>
                        <option value="date">Date</option>
                        <option value="size">Size</option>
                    </select>
                </div>
            </div>

            <UploadZone onUpload={onUpload} />

            {filtered.length === 0 ? (
                <div className="file-list__empty">
                    {filterType !== 'all' ? 'No files match this filter.' : 'No files yet. Upload files above.'}
                </div>
            ) : (
                <div className="file-list__rows">
                    {filtered.map(file => (
                        <FileRow
                            key={file.id}
                            file={file}
                            selected={selected.has(file.id)}
                            onSelect={() => onToggleSelect(file.id)}
                            onPreview={onPreview}
                            onDownload={onDownload}
                            onRename={onRename}
                            onDelete={onDelete}
                            onEditPdf={onEditPdf}
                            folderId={folder.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/files/FileList.jsx
git commit -m "feat: add FileList right panel with filter, sort, upload zone"
```

---

## Task 5: FolderTreeItem Component

**Files:**
- Create: `client/src/components/files/FolderTreeItem.jsx`

- [ ] **Step 1: Create FolderTreeItem.jsx**

```javascript
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
                            isActive={isActive && false}
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/files/FolderTreeItem.jsx
git commit -m "feat: add FolderTreeItem with expand/collapse and count badge"
```

---

## Task 6: FolderTree Component (Left Panel)

**Files:**
- Create: `client/src/components/files/FolderTree.jsx`

- [ ] **Step 1: Create FolderTree.jsx**

```javascript
import { useState, useEffect, useCallback } from 'react';
import FolderTreeItem from './FolderTreeItem';
import Icons from '../common/Icons';
import * as api from '../../api';

export default function FolderTree({ activeFolderId, onSelectFolder, onCreateFolder, refreshKey }) {
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

    useEffect(() => { loadRoot(); }, [loadRoot, refreshKey]);

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
                    {Icons.plus}
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
                            onSelect={onSelectFolder}
                            onLoadChildren={handleLoadChildren}
                            childrenCache={childrenCache}
                            fileCountCache={fileCountCache}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/files/FolderTree.jsx
git commit -m "feat: add FolderTree left panel with lazy-loaded children"
```

---

## Task 7: Rewrite FilesPage with Two-Panel Layout

**Files:**
- Modify: `client/src/pages/FilesPage.jsx`

- [ ] **Step 1: Rewrite FilesPage.jsx**

Replace the entire contents of `client/src/pages/FilesPage.jsx` with:

```javascript
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

    const handleDeleteConfirmed = useCallback(async (itemsToDelete) => {
        for (const item of itemsToDelete) {
            await api.deleteAdminFile(item.id);
        }
        setDeleteModal(null);
        setSelected(new Set());
        loadFiles(selectedFolder);
        setTreeRefreshKey(k => k + 1);
    }, [selectedFolder, loadFiles]);

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
                    { label: 'Export All Files', icon: Icons.download, action: handleExportAll },
                ]}
            />
            <ContextBar>
                <ContextBar.Left>
                    <input
                        type="text"
                        className="form-input form-input--sm"
                        placeholder="Search files..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: 180 }}
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
                    <h2 className="modal__title">{nameModal.mode === 'create' ? 'New Folder' : 'Rename'}</h2>
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

            {deleteModal && (
                <ConfirmModal
                    title={`Delete ${deleteModal.length === 1 ? 'file' : `${deleteModal.length} files`}`}
                    message={deleteModal.length === 1 ? `Delete "${deleteModal[0].name}"? This cannot be undone.` : `Delete ${deleteModal.length} files? This cannot be undone.`}
                    confirmLabel="Delete"
                    confirmVariant="danger"
                    onConfirm={() => handleDeleteConfirmed(deleteModal)}
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
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/FilesPage.jsx
git commit -m "feat: rewrite FilesPage with two-panel layout (folder tree + file list)"
```

---

## Task 8: CSS — Two-Panel Layout Styles

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace all `.files-page__*` CSS**

Find the existing files-page CSS block (starts with `/* ===== Files Page =====` or `.files-page {`) and replace it entirely with:

```css
/* ===== Files Page (Two-Panel) ===== */
.files-page { padding: 0; }

.files-page__select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
}
.files-page__select-all input { width: 15px; height: 15px; accent-color: hsl(var(--primary)); }
.files-page__selection-count { font-size: 13px; font-weight: 500; color: hsl(var(--primary)); }

.files-page__panels {
    display: flex;
    height: calc(100vh - 140px);
    overflow: hidden;
}

.files-page__left {
    width: 300px;
    min-width: 300px;
    border-right: 1px solid hsl(var(--border));
    overflow-y: auto;
    background: hsl(var(--card));
}

.files-page__right {
    flex: 1;
    overflow-y: auto;
    background: hsl(var(--background));
}

/* ===== Folder Tree ===== */
.folder-tree { padding: 0; }

.folder-tree__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid hsl(var(--border));
}

.folder-tree__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
}

.folder-tree__header .btn--icon { padding: 4px; }
.folder-tree__header .btn--icon svg { width: 14px; height: 14px; }

.folder-tree__list { padding: 8px 0; }
.folder-tree__loading,
.folder-tree__empty {
    padding: 16px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    text-align: center;
}

/* ===== Folder Tree Item ===== */
.folder-tree-item__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin: 1px 8px;
    transition: background 0.1s;
}

.folder-tree-item__row:hover { background: hsl(var(--muted)); }
.folder-tree-item__row--active {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
}

.folder-tree-item__toggle {
    border: none;
    background: none;
    padding: 0 4px;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    line-height: 1;
}

.folder-tree-item__arrow { display: inline-block; transition: transform 0.15s; }
.folder-tree-item__arrow--open { transform: rotate(90deg); }
.folder-tree-item__spinner { font-size: 10px; }

.folder-tree-item__icon { display: flex; }
.folder-tree-item__icon svg { width: 16px; height: 16px; }

.folder-tree-item__name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.folder-tree-item__badge {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
}

/* ===== Upload Zone ===== */
.upload-zone {
    border: 2px dashed hsl(var(--border));
    border-radius: 8px;
    padding: 20px;
    margin: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
}

.upload-zone:hover,
.upload-zone--active {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.03);
}

.upload-zone__icon { color: hsl(var(--muted-foreground)); }
.upload-zone__text { font-size: 13px; color: hsl(var(--muted-foreground)); margin: 0; }
.upload-zone__link { color: hsl(var(--primary)); font-weight: 500; }

/* ===== File List ===== */
.file-list { padding: 0; }

.file-list--empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
}

.file-list__placeholder {
    text-align: center;
    color: hsl(var(--muted-foreground));
}
.file-list__placeholder p { margin-top: 8px; font-size: 14px; }

.file-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid hsl(var(--border));
}

.file-list__title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
}

.file-list__controls { display: flex; gap: 8px; }

.file-list__filter,
.file-list__sort {
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    background: hsl(var(--card));
    color: hsl(var(--foreground));
}

.file-list__empty {
    padding: 32px 16px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}

.file-list__rows { padding: 8px 0; }

/* ===== File Row ===== */
.file-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    transition: background 0.1s;
}

.file-row:hover { background: hsl(var(--primary) / 0.04); }
.file-row--selected { background: hsl(var(--primary) / 0.06); }

.file-row__checkbox input {
    width: 15px;
    height: 15px;
    accent-color: hsl(var(--primary));
}

.file-row__icon { flex-shrink: 0; display: flex; }

.file-row__name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.file-row__meta {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
}

.file-row__actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
}

.file-row__actions .btn--icon {
    padding: 4px;
    border: none;
    background: none;
    border-radius: 4px;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
}
.file-row__actions .btn--icon:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--muted));
}
.file-row__actions .btn--icon svg { width: 14px; height: 14px; }
```

- [ ] **Step 2: Remove old `.files-page__grid`, `.files-page__item`, `.files-page__breadcrumbs` CSS blocks**

Delete all old classes that are no longer used: `.files-page__grid`, `.files-page__item`, `.files-page__item--selected`, `.files-page__item-checkbox`, `.files-page__item-icon`, `.files-page__item-name`, `.files-page__item-meta`, `.files-page__item-actions`, `.files-page__breadcrumbs`, `.files-page__breadcrumb`, `.files-page__breadcrumb--active`, `.files-page__breadcrumb-sep`, `.files-page__loading`, `.files-page__empty`.

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style: two-panel file manager CSS (folder tree, file list, upload zone)"
```

---

## Task 9: Build and Verify

**Files:** None (verification)

- [ ] **Step 1: Build the client**

```bash
cd client && npm run build
```

Expected: `✓ built` with no errors.

- [ ] **Step 2: Check for missing icon references**

The FolderTree uses `Icons.plus`. Verify it exists:

```bash
grep -n "plus:" client/src/components/common/Icons.jsx
```

If missing, add to Icons.jsx:
```javascript
plus: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
),
```

- [ ] **Step 3: Visual test**

Start dev servers and verify:
1. Left panel shows folder tree with expandable arrows
2. Clicking a folder shows its files in the right panel
3. Files have colored type icons, metadata, and always-visible action buttons
4. Upload zone appears in right panel when folder selected
5. Drag-and-drop upload works
6. All action buttons work (preview, download, edit PDF, rename, delete)
7. Bulk select works
8. URL `?folder=X` param restores folder on load

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during two-panel files page testing"
```
