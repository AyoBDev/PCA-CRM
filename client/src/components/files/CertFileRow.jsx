import Icons from '../common/Icons';
import FileThumbnail from '../common/FileThumbnail';
import { formatDate, formatTimestamp } from '../../utils/dates';
import * as api from '../../api';

// A certification file rendered with the same look as the File Manager list
// rows (.file-row): thumbnail · name · meta line · preview/download actions.
// Used for both the CURRENT/active cert file and each history upload.
//
// `upload` carries: id, fileName, fileType, submittedAt, effectiveDate,
//   expirationDate, note.
// Optional props:
//   fetchBlob   — override the download source (active file uses the cert
//                 endpoint; history uses the upload endpoint — the default).
//   cacheKey    — thumbnail cache key (defaults to the upload id).
//   badge       — element rendered before the actions (e.g. status chip).
//   expiresText — override the meta line entirely (e.g. "Expires …" for the
//                 active file, which has no submittedAt).
//   selected    — adds an `is-selected` highlight to the row.
//   onSelect    — called with `upload` when the row body (name/meta area) is
//                 clicked. Omit to leave the row non-interactive (default).
export default function CertFileRow({ upload, onPreview, onDownload, fetchBlob, cacheKey, badge, expiresText, selected, onSelect }) {
    const resolvedFetch = fetchBlob || (() => api.downloadCertificationUpload(upload.id));

    let meta = expiresText;
    if (meta === undefined) {
        const metaParts = [];
        if (upload.submittedAt) metaParts.push(`Uploaded ${formatTimestamp(upload.submittedAt)}`);
        const renewal = [
            upload.effectiveDate ? `Effective ${formatDate(upload.effectiveDate)}` : '',
            upload.expirationDate ? `Expires ${formatDate(upload.expirationDate)}` : '',
        ].filter(Boolean).join(' · ');
        meta = [metaParts.join(' · '), renewal].filter(Boolean).join(' · ');
    }

    const previewItem = fetchBlob ? { ...upload, fetchBlob: resolvedFetch } : upload;

    return (
        <div className={`file-row file-row--cert${selected ? ' is-selected' : ''}`}>
            <div className="file-row__icon">
                <FileThumbnail
                    file={{ fileName: upload.fileName, mimeType: upload.fileType }}
                    cacheKey={cacheKey || `cert-upload:${upload.id}`}
                    fetchBlob={resolvedFetch}
                    onClick={() => onPreview(previewItem)}
                    size={28}
                />
            </div>
            <div
                className="file-row__main"
                onClick={onSelect ? () => onSelect(upload) : undefined}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
            >
                <div className="file-row__name" title={upload.fileName}>{upload.fileName}</div>
                {(meta || upload.note) && (
                    <div className="file-row__submeta">
                        {meta}
                        {upload.note && <>{meta ? ' · ' : ''}<em>{upload.note}</em></>}
                    </div>
                )}
            </div>
            {badge && <div className="file-row__badge">{badge}</div>}
            <div className="file-row__actions">
                <button className="btn--icon" title="Preview" onClick={(e) => { e.stopPropagation(); onPreview(previewItem); }}>{Icons.eye}</button>
                <button className="btn--icon" title="Download" onClick={(e) => { e.stopPropagation(); onDownload(upload); }}>{Icons.download}</button>
            </div>
        </div>
    );
}
