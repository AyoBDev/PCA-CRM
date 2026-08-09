// client/src/components/common/PreviewModal.jsx
import { useEffect, useState } from 'react';
import Modal from './Modal';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];

function extType(fileName = '') {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return '';
}

export default function PreviewModal({ open, fileName, fetchBlob, onClose, maxBytes = DEFAULT_MAX_BYTES }) {
    const [state, setState] = useState({ status: 'idle', url: null, mime: '', tooBig: false });

    useEffect(() => {
        if (!open) return;
        let objectUrl = null;
        let cancelled = false;
        setState({ status: 'loading', url: null, mime: '', tooBig: false });
        (async () => {
            try {
                const res = await fetchBlob();
                if (!res.ok) throw new Error('Preview failed');
                const mime = res.headers.get('Content-Type') || extType(fileName) || 'application/octet-stream';
                const len = parseInt(res.headers.get('Content-Length') || '0', 10);
                const tooBig = len > 0 && len > maxBytes;
                const blob = await res.blob();
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setState({ status: 'ready', url: objectUrl, mime, tooBig });
            } catch {
                if (!cancelled) setState({ status: 'error', url: null, mime: '', tooBig: false });
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [open, fetchBlob, fileName, maxBytes]);

    if (!open) return null;

    const { status, url, mime, tooBig } = state;
    const isPdf = mime === 'application/pdf';
    const isImage = IMAGE_TYPES.includes(mime);
    const canPreview = status === 'ready' && !tooBig && (isPdf || isImage);

    const download = () => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title" style={{ marginBottom: 12 }}>{fileName || 'Preview'}</h2>
            <div style={{ minHeight: 320, height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {status === 'loading' && <p style={{ color: 'hsl(var(--muted-foreground))' }}>Loading…</p>}
                {status === 'error' && <p style={{ color: 'hsl(var(--destructive, 0 84% 60%))' }}>Could not load this file.</p>}
                {canPreview && isPdf && (
                    <iframe title="preview" src={url} style={{ width: '100%', height: '100%', border: 'none' }} />
                )}
                {canPreview && isImage && (
                    <img alt={fileName} src={url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                )}
                {status === 'ready' && !canPreview && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ marginBottom: 12, color: 'hsl(var(--muted-foreground))' }}>
                            {tooBig ? 'This file is too large to preview.' : 'This file type can\'t be previewed.'}
                        </p>
                        <button className="btn btn--primary" onClick={download}>Download</button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
