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
