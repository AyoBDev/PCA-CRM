// Shared attachment list for leads ("potential patients").
// Rendered identically by the intake wizard (Step 1) and the Quick View modal
// so the same data always looks and behaves the same way. Saved attachments
// open in the app-wide PreviewModal (DocViewer engine) — never a new tab.
import { useState } from 'react';
import Icons from '../common/Icons';
import PreviewModal from '../common/PreviewModal';
import * as api from '../../api';

export function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// PreviewModal/DocViewer can render images and PDFs inline; anything else
// (Word docs) has no in-app renderer, so we only offer Download for those.
export function isPreviewable(mimeType) {
    const m = (mimeType || '').toLowerCase();
    return m === 'application/pdf' || m.startsWith('image/');
}

/**
 * @param docs     saved LeadDocument rows ({ id, fileName, fileSize, mimeType })
 * @param pending  File objects staged on a not-yet-created lead (wizard only)
 * @param busy     disables the destructive/remove controls while a call is in flight
 * @param onRemoveExisting/onRemovePending  omit to render a read-only list (Quick View)
 */
export default function LeadAttachmentList({
    docs = [],
    pending = [],
    busy = false,
    onRemoveExisting,
    onRemovePending,
}) {
    const [preview, setPreview] = useState(null);

    const rows = [
        ...docs.map((d) => ({
            key: `e-${d.id}`, id: d.id, name: d.fileName, size: d.fileSize,
            mimeType: d.mimeType, saved: true,
        })),
        ...pending.map((f, i) => ({
            key: `p-${i}`, idx: i, name: f.name, size: f.size,
            mimeType: f.type, saved: false,
        })),
    ];

    if (!rows.length) return null;

    async function handleDownload(row) {
        const res = await api.fetchLeadDocument(row.id);
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    return (
        <>
            <ul className="lead-attach__list">
                {rows.map((r) => {
                    const canPreview = r.saved && isPreviewable(r.mimeType);
                    return (
                        <li key={r.key} className="lead-attach__item">
                            <span className="lead-attach__icon">{Icons.fileText}</span>
                            {canPreview ? (
                                <button
                                    type="button"
                                    className="lead-attach__name lead-attach__name--link"
                                    title={`Preview ${r.name}`}
                                    onClick={() => setPreview(r)}
                                >
                                    {r.name}
                                </button>
                            ) : (
                                <span className="lead-attach__name" title={r.name}>{r.name}</span>
                            )}
                            <span className="lead-attach__size">{fmtSize(r.size)}</span>
                            {!r.saved && <span className="lead-attach__badge">Pending</span>}

                            {canPreview && (
                                <button
                                    type="button"
                                    className="lead-attach__action"
                                    aria-label={`Preview ${r.name}`}
                                    title="Preview"
                                    onClick={() => setPreview(r)}
                                >
                                    {Icons.eye}
                                </button>
                            )}
                            {r.saved && (
                                <button
                                    type="button"
                                    className="lead-attach__action"
                                    aria-label={`Download ${r.name}`}
                                    title="Download"
                                    onClick={() => handleDownload(r)}
                                >
                                    {Icons.download}
                                </button>
                            )}
                            {((r.saved && onRemoveExisting) || (!r.saved && onRemovePending)) && (
                                <button
                                    type="button"
                                    className="lead-attach__remove"
                                    aria-label={`Remove ${r.name}`}
                                    disabled={busy}
                                    onClick={() => (r.saved ? onRemoveExisting(r.id) : onRemovePending(r.idx))}
                                >
                                    {Icons.x}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {preview && (
                <PreviewModal
                    open
                    fileName={preview.name}
                    fetchBlob={() => api.fetchLeadDocument(preview.id)}
                    onClose={() => setPreview(null)}
                />
            )}
        </>
    );
}
