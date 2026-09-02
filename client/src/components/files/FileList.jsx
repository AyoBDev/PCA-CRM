import { useState, useMemo } from 'react';
import UploadZone from './UploadZone';
import FilePreviewPane from '../common/FilePreviewPane';
import Tooltip from '../common/Tooltip';
import ToggleSwitch from '../common/ToggleSwitch';
import Icons from '../common/Icons';
import { getFileTypeInfo, formatFileSize } from './fileTypeUtils.jsx';
import * as api from '../../api';

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
    previewOn,
    onTogglePreview,
    selectedFileId,
    onSelectFile,
    hideHeader = false,
    hideDropzone = false,
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

    const previewItems = useMemo(() => filtered.map(f => {
        const isPdf = f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
        return {
            id: f.id,
            fileName: f.name,
            fileType: f.mimeType,
            cacheKey: `file:${f.id}`,
            fetchBlob: () => fetch(`/api/files/${f.id}/download`, {
                headers: { Authorization: `Bearer ${api.getToken()}` },
            }),
            meta: `${getFileTypeInfo(f.name).label} · ${formatFileSize(f.size)}`,
            // Checkbox (multi-select) + file-management actions preserved from the
            // old FileRow list, injected into the shared CertFileRow via slots.
            leading: (
                <label className="file-row__checkbox">
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => onToggleSelect(f.id)} />
                </label>
            ),
            extraActions: (
                <>
                    {isPdf && <button className="btn--icon" title="Edit PDF" onClick={() => onEditPdf(f, folder.id)}>{Icons.pen}</button>}
                    <button className="btn--icon" title="Rename" onClick={() => onRename(f)}>{Icons.edit}</button>
                    <button className="btn--icon" title="Delete" onClick={() => onDelete(f)}>{Icons.trash}</button>
                </>
            ),
        };
    }), [filtered, selected, onToggleSelect, onEditPdf, onRename, onDelete, folder]);

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
                {!hideHeader && <h2 className="file-list__title">{folder.name}</h2>}
                <div className="file-list__controls" style={hideHeader ? { marginLeft: 'auto' } : undefined}>
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
                    <Tooltip content={previewOn ? 'Switch back to the list view' : 'Show a docked preview alongside the file list'}>
                        <span className="file-list__preview-toggle">
                            <ToggleSwitch checked={previewOn} onChange={onTogglePreview} label="Preview" />
                        </span>
                    </Tooltip>
                </div>
            </div>

            {!hideDropzone && <UploadZone onUpload={onUpload} />}

            {filtered.length === 0 ? (
                <div className="file-list__empty">
                    {filterType !== 'all' ? 'No files match this filter.' : 'No files yet. Upload files above.'}
                </div>
            ) : (
                // Always the docked pane: clicking a file docks it inline (even
                // with the toggle off — the click reveals the panel); the Preview
                // toggle only shows/hides the empty panel by default. Full-screen
                // is the explicit Expand button, or narrow-screen fallback.
                <FilePreviewPane
                    items={previewItems}
                    selectedId={selectedFileId}
                    onSelect={onSelectFile}
                    open={previewOn}
                    onExpand={(item) => onPreview(filtered.find(f => f.id === item.id))}
                    onDownload={(item) => onDownload(filtered.find(f => f.id === item.id))}
                    emptyText="No files yet. Upload files above."
                />
            )}
        </div>
    );
}
