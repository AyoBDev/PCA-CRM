// client/src/components/common/PreviewModal.jsx
// Full-screen in-app document viewer: renders PDFs (pdf.js, multi-page canvas)
// and images with a Monday.com-style toolbar (zoom, fit, page nav, rotate,
// download, print, optional delete). Falls back to a Download panel for
// unpreviewable or oversized files.
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Icons from './Icons';
import { loadPdfDocument } from '../../lib/pdfThumbnail';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function extType(fileName = '') {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return '';
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

export default function PreviewModal({ open, fileName, fetchBlob, onClose, onDelete, maxBytes = DEFAULT_MAX_BYTES }) {
    const [state, setState] = useState({ status: 'idle', mime: '', tooBig: false });
    const [blobUrl, setBlobUrl] = useState(null);          // for image render + download/print
    const [pdf, setPdf] = useState(null);                  // pdf.js document
    const [numPages, setNumPages] = useState(0);
    const [page, setPage] = useState(1);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [fit, setFit] = useState(true);                  // fit-to-width auto-scales

    const scrollRef = useRef(null);
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);

    // ---- Load the file ------------------------------------------------------
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        let localUrl = null;
        let localPdf = null;
        setState({ status: 'loading', mime: '', tooBig: false });
        setBlobUrl(null); setPdf(null); setNumPages(0); setPage(1);
        setZoom(1); setRotation(0); setFit(true);

        (async () => {
            try {
                const res = await fetchBlob();
                if (!res.ok) throw new Error('Preview failed');
                const mime = res.headers.get('Content-Type') || extType(fileName) || 'application/octet-stream';
                const len = parseInt(res.headers.get('Content-Length') || '0', 10);
                const tooBig = len > 0 && len > maxBytes;
                const blob = await res.blob();
                if (cancelled) return;

                const isPdf = mime === 'application/pdf';
                const isImage = IMAGE_TYPES.includes(mime);

                localUrl = URL.createObjectURL(blob);
                if (cancelled) { URL.revokeObjectURL(localUrl); return; }
                setBlobUrl(localUrl);

                if (isPdf && !tooBig) {
                    // pdf.js consumes the buffer, so hand it a copy.
                    const buf = await blob.arrayBuffer();
                    if (cancelled) return;
                    localPdf = await loadPdfDocument(buf.slice(0));
                    if (cancelled) { localPdf.destroy(); return; }
                    setPdf(localPdf);
                    setNumPages(localPdf.numPages);
                }
                setState({ status: 'ready', mime, tooBig });
            } catch {
                if (!cancelled) setState({ status: 'error', mime: '', tooBig: false });
            }
        })();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
            if (localPdf) { try { localPdf.destroy(); } catch { /* noop */ } }
            if (localUrl) URL.revokeObjectURL(localUrl);
        };
    }, [open, fetchBlob, fileName, maxBytes]);

    // ---- Render the current PDF page ---------------------------------------
    useEffect(() => {
        if (!pdf || state.status !== 'ready') return;
        let cancelled = false;
        (async () => {
            const pg = await pdf.getPage(page);
            if (cancelled) return;
            let scale = zoom;
            if (fit && scrollRef.current) {
                const base = pg.getViewport({ scale: 1, rotation });
                const avail = scrollRef.current.clientWidth - 48; // gutter
                if (avail > 0) scale = clamp(avail / base.width, ZOOM_MIN, ZOOM_MAX);
            }
            const viewport = pg.getViewport({ scale, rotation });
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(viewport.width * ratio);
            canvas.height = Math.ceil(viewport.height * ratio);
            canvas.style.width = `${Math.ceil(viewport.width)}px`;
            canvas.style.height = `${Math.ceil(viewport.height)}px`;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
            const task = pg.render({ canvasContext: ctx, viewport });
            renderTaskRef.current = task;
            try { await task.promise; } catch { /* cancelled */ }
        })();
        return () => { cancelled = true; };
    }, [pdf, page, zoom, rotation, fit, state.status]);

    // ---- Keyboard shortcuts -------------------------------------------------
    const isPdf = state.mime === 'application/pdf';
    const goPage = useCallback((delta) => {
        setFit(true);
        setPage(p => clamp(p + delta, 1, numPages || 1));
    }, [numPages]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (isPdf && numPages > 1) {
                if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(1); }
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(-1); }
            }
        };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [open, isPdf, numPages, goPage, onClose]);

    if (!open) return null;

    const { status, mime, tooBig } = state;
    const isImage = IMAGE_TYPES.includes(mime);
    const canPreview = status === 'ready' && !tooBig && (isPdf || isImage);

    const zoomBy = (delta) => { setFit(false); setZoom(z => clamp(+(z + delta).toFixed(2), ZOOM_MIN, ZOOM_MAX)); };
    const resetZoom = () => { setFit(true); setZoom(1); };
    const rotate = () => setRotation(r => (r + 90) % 360);

    const download = () => {
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const print = () => {
        if (!blobUrl) return;
        const w = window.open(blobUrl, '_blank');
        if (w) w.addEventListener('load', () => { try { w.print(); } catch { /* noop */ } });
    };

    // Zoom % for the toolbar readout (image uses `zoom`; fit-mode reads ~ via style)
    const zoomPct = Math.round((fit && isImage ? 1 : zoom) * 100);

    const viewer = (
        <div className="doc-viewer" role="dialog" aria-modal="true" aria-label={fileName || 'Document preview'}>
            {/* Header */}
            <div className="doc-viewer__header">
                <div className="doc-viewer__title">
                    <span className="doc-viewer__title-icon">{Icons.fileText}</span>
                    <span className="doc-viewer__title-text" title={fileName}>{fileName || 'Preview'}</span>
                </div>
                <button className="doc-viewer__close" onClick={onClose} title="Close (Esc)" aria-label="Close">
                    {Icons.x}
                </button>
            </div>

            {/* Canvas / content */}
            <div className="doc-viewer__stage" ref={scrollRef}>
                {status === 'loading' && <div className="doc-viewer__msg">Loading…</div>}
                {status === 'error' && <div className="doc-viewer__msg doc-viewer__msg--error">Could not load this file.</div>}

                {canPreview && isPdf && (
                    <div className="doc-viewer__page">
                        <canvas ref={canvasRef} className="doc-viewer__canvas" />
                    </div>
                )}

                {canPreview && isImage && (
                    <div className="doc-viewer__page">
                        <img
                            alt={fileName}
                            src={blobUrl}
                            className="doc-viewer__image"
                            style={{
                                transform: `rotate(${rotation}deg) scale(${fit ? 1 : zoom})`,
                                maxWidth: fit ? '100%' : 'none',
                                maxHeight: fit ? '100%' : 'none',
                            }}
                        />
                    </div>
                )}

                {status === 'ready' && !canPreview && (
                    <div className="doc-viewer__fallback">
                        <span className="doc-viewer__fallback-icon">{Icons.fileText}</span>
                        <p className="doc-viewer__fallback-name">{fileName}</p>
                        <p className="doc-viewer__fallback-note">
                            {tooBig ? 'This file is too large to preview.' : 'This file type can’t be previewed.'}
                        </p>
                        <button className="btn btn--primary" onClick={download}>
                            {Icons.download}<span>Download</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom toolbar */}
            {canPreview && (
                <div className="doc-viewer__toolbar" role="toolbar" aria-label="Document controls">
                    <div className="doc-viewer__toolgroup">
                        <button className="doc-viewer__tool" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Zoom out" aria-label="Zoom out">−</button>
                        <button className="doc-viewer__tool doc-viewer__tool--text" onClick={resetZoom} title="Reset zoom">{zoomPct}%</button>
                        <button className="doc-viewer__tool" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Zoom in" aria-label="Zoom in">+</button>
                    </div>

                    <span className="doc-viewer__sep" />

                    <button
                        className={`doc-viewer__tool doc-viewer__tool--text${fit ? ' is-active' : ''}`}
                        onClick={() => setFit(f => !f)}
                        title="Fit to width"
                        aria-pressed={fit}
                    >Fit</button>

                    {isPdf && numPages > 1 && (
                        <>
                            <span className="doc-viewer__sep" />
                            <div className="doc-viewer__toolgroup">
                                <button className="doc-viewer__tool" onClick={() => goPage(-1)} disabled={page <= 1} title="Previous page" aria-label="Previous page">{Icons.chevronLeft}</button>
                                <span className="doc-viewer__pageinfo">{page} / {numPages}</span>
                                <button className="doc-viewer__tool" onClick={() => goPage(1)} disabled={page >= numPages} title="Next page" aria-label="Next page">{Icons.chevronRight}</button>
                            </div>
                        </>
                    )}

                    <span className="doc-viewer__sep" />
                    <button className="doc-viewer__tool" onClick={rotate} title="Rotate" aria-label="Rotate">{Icons.rotateCcw}</button>

                    <span className="doc-viewer__spacer" />

                    <button className="doc-viewer__tool" onClick={download} title="Download" aria-label="Download">{Icons.download}</button>
                    <button className="doc-viewer__tool" onClick={print} title="Print" aria-label="Print">{Icons.printer || Icons.fileText}</button>
                    {onDelete && (
                        <button className="doc-viewer__tool doc-viewer__tool--danger" onClick={onDelete} title="Delete" aria-label="Delete">{Icons.trash}</button>
                    )}
                </div>
            )}
        </div>
    );

    return createPortal(viewer, document.body);
}
