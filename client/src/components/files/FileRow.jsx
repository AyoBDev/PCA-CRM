import Icons from '../common/Icons';
import { getFileTypeInfo, formatFileSize, formatUploadDate } from './fileTypeUtils';
import FileThumbnail from '../common/FileThumbnail';
import * as api from '../../api';

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
                <FileThumbnail
                    file={{ fileName: file.name, mimeType: file.mimeType }}
                    cacheKey={`file:${file.id}`}
                    fetchBlob={() => fetch(`/api/files/${file.id}/download`, { headers: { Authorization: `Bearer ${api.getToken()}` } })}
                    onClick={() => onPreview(file)}
                    size={28}
                />
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
