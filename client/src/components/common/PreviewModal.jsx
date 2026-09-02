// client/src/components/common/PreviewModal.jsx
// Full-screen in-app document viewer: portals the DocViewer rendering engine
// with a header (icon + name + close). Escape-to-close and body-scroll-lock
// live here; PDF page rendering, zoom, and toolbar live in DocViewer.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icons from './Icons';
import DocViewer from './DocViewer';

export default function PreviewModal({ open, fileName, fetchBlob, onClose, onDelete, maxBytes, breadcrumb }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="doc-viewer doc-viewer--modal" role="dialog" aria-modal="true" aria-label={fileName || 'Document preview'}>
            <div className="doc-viewer__header">
                <button className="doc-viewer__back" onClick={onClose} title="Back (Esc)" aria-label="Back">
                    {Icons.arrowLeft || Icons.chevronLeft} <span>Back</span>
                </button>
                <div className="doc-viewer__title">
                    <span className="doc-viewer__title-icon">{Icons.fileText}</span>
                    <div className="doc-viewer__title-stack">
                        {breadcrumb && <span className="doc-viewer__breadcrumb">{breadcrumb}</span>}
                        <span className="doc-viewer__title-text" title={fileName}>{fileName || 'Preview'}</span>
                    </div>
                </div>
                <button className="doc-viewer__close" onClick={onClose} title="Close (Esc)" aria-label="Close">{Icons.x}</button>
            </div>
            <DocViewer
                fileName={fileName}
                fetchBlob={fetchBlob}
                maxBytes={maxBytes}
                extraToolbarActions={onDelete ? (
                    <button className="doc-viewer__tool doc-viewer__tool--danger" onClick={onDelete} title="Delete" aria-label="Delete">{Icons.trash}</button>
                ) : null}
            />
        </div>,
        document.body
    );
}
