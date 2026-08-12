import Icons from '../common/Icons';
import FileThumbnail from '../common/FileThumbnail';
import { getFileTypeInfo, formatFileSize } from './fileTypeUtils';
import { formatDate, formatTimestamp } from '../../utils/dates';
import * as api from '../../api';

// A certification-history file rendered with the same look as the File Manager
// list rows (.file-row): thumbnail · name · meta line · preview/download actions.
// `upload` carries: id, fileName, fileType, fileSize, submittedAt,
// effectiveDate, expirationDate, uploadedByName, note.
export default function CertFileRow({ upload, onPreview, onDownload }) {
    const { label } = getFileTypeInfo(upload.fileName);

    const metaParts = [label];
    if (upload.fileSize) metaParts.push(formatFileSize(upload.fileSize));
    if (upload.submittedAt) metaParts.push(`Uploaded ${formatTimestamp(upload.submittedAt)}`);

    const renewal = [
        upload.effectiveDate ? `Effective ${formatDate(upload.effectiveDate)}` : '',
        upload.expirationDate ? `Expires ${formatDate(upload.expirationDate)}` : '',
    ].filter(Boolean).join(' · ');

    return (
        <div className="file-row file-row--cert">
            <div className="file-row__icon">
                <FileThumbnail
                    file={{ fileName: upload.fileName, mimeType: upload.fileType }}
                    cacheKey={`cert-upload:${upload.id}`}
                    fetchBlob={() => api.downloadCertificationUpload(upload.id)}
                    onClick={() => onPreview(upload)}
                    size={28}
                />
            </div>
            <div className="file-row__main">
                <div className="file-row__name" title={upload.fileName}>{upload.fileName}</div>
                <div className="file-row__submeta">
                    {metaParts.join(' · ')}
                    {renewal && <> · {renewal}</>}
                    {' · '}by {upload.uploadedByName || '—'}
                    {upload.note && <> · <em>{upload.note}</em></>}
                </div>
            </div>
            <div className="file-row__actions">
                <button className="btn--icon" title="Preview" onClick={() => onPreview(upload)}>{Icons.eye}</button>
                <button className="btn--icon" title="Download" onClick={() => onDownload(upload)}>{Icons.download}</button>
            </div>
        </div>
    );
}
