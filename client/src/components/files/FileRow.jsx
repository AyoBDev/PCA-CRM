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
