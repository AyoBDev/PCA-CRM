# Docked File Preview Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable docked split-view file preview (`FilePreviewPane`) — a file list beside an inline document panel — reusing the existing PreviewModal's rendering engine, wired on employee certs, `/files`, and client auth attachments.

**Architecture:** Extract the pdf.js/image render engine out of `PreviewModal` into a frame-agnostic `DocViewer`; `PreviewModal` becomes chrome + `DocViewer`. A new presentational `FilePreviewPane` renders a list of `CertFileRow`s beside a `DocViewer` panel, driven by a normalized item list and controlled `open`/`selectedId`. Pages map their data to items, own the toggle (in their existing toolbar) and the `PreviewModal` mount for Expand / narrow screens.

**Tech Stack:** React 19 + Vite; vitest + @testing-library/react (client tests, `vi.fn()`), test files in `client/src/__tests__/*.test.jsx`, run `cd client && npm test` or `npx vitest run <path>`; pdf.js via `lib/pdfThumbnail.js` (shared worker, code-split `pdf-*.js`).

## Global Constraints

- Reusable file components take a **`fetchBlob: () => Promise<Response>`** (a raw `fetch` Response; component reads `Content-Type`/`Content-Length`/`.blob()`). Never pass a URL or a bare blob.
- **`PreviewModal` is the only full-screen in-app viewer**; the docked pane reuses the same engine (`DocViewer`). Never add a second pdf renderer or `window.open`/`<iframe>` preview.
- pdf.js only via `lib/pdfThumbnail.js` (`loadPdfDocument`); the `pdfjs-dist` import stays code-split — do not import it directly elsewhere.
- Client tests: vitest + @testing-library/react (`import { describe, it, expect, vi } from 'vitest'`). Mock pdf.js by mocking `../lib/pdfThumbnail`.
- Normalized item shape everywhere: `{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }`.
- After frontend changes the client must be rebuilt (`cd client && npm run build`) for the prod server at `localhost:4000`; dev server at `5173` hot-reloads.
- Existing `PreviewModal.test.jsx` (6 tests) MUST stay green after the extraction — it is the regression guard.

---

### Task 1: Extract `DocViewer` (rendering engine) from `PreviewModal`

**Files:**
- Create: `client/src/components/common/DocViewer.jsx`
- Modify: `client/src/components/common/PreviewModal.jsx`
- Test: `client/src/__tests__/DocViewer.test.jsx`

**Interfaces:**
- Consumes: `loadPdfDocument` from `lib/pdfThumbnail`; `Icons` from `common/Icons`.
- Produces: default export `DocViewer`, props:
  - `fileName?: string`
  - `fetchBlob: () => Promise<Response>`
  - `maxBytes?: number` (default `25 * 1024 * 1024`)
  - `showToolbar?: boolean` (default `true`)
  - `extraToolbarActions?: React.ReactNode` (rendered at the right end of the toolbar)
  - Renders the document body (loading/error/pdf canvas/image/download-fallback) and, when `showToolbar`, the control toolbar (zoom −/reset/+, fit, page nav, rotate, download, print). No portal, no backdrop, no header, no close. Root element: `<div className="doc-viewer doc-viewer--embedded">`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/DocViewer.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocViewer from '../components/common/DocViewer';

vi.mock('../lib/pdfThumbnail', () => ({
  loadPdfDocument: vi.fn(async () => ({
    numPages: 2,
    getPage: async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }),
    destroy: () => {},
  })),
}));

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn() }));
});

function mockResponse({ type = 'application/pdf', length = '1024' } = {}) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : h === 'Content-Length' ? length : null) },
    blob: async () => { const b = new Blob(['x'], { type }); b.arrayBuffer = async () => new ArrayBuffer(8); return b; },
  };
}

describe('DocViewer', () => {
  it('renders a canvas + page controls for a multi-page PDF', async () => {
    render(<DocViewer fileName="a.pdf" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf' }))} />);
    await waitFor(() => expect(document.querySelector('.doc-viewer__canvas')).toBeInTheDocument());
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('renders an img for an image', async () => {
    render(<DocViewer fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('shows a download fallback for unpreviewable types', async () => {
    render(<DocViewer fileName="a.docx" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/msword' }))} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__canvas')).not.toBeInTheDocument();
  });

  it('shows the download fallback when the file exceeds maxBytes', async () => {
    render(<DocViewer fileName="big.pdf" maxBytes={512} fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf', length: '99999' }))} />);
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
  });

  it('renders extraToolbarActions', async () => {
    render(<DocViewer fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} extraToolbarActions={<button>Expand</button>} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument());
  });

  it('hides the toolbar when showToolbar is false', async () => {
    render(<DocViewer fileName="a.png" showToolbar={false} fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__toolbar')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/DocViewer.test.jsx`
Expected: FAIL — module `DocViewer` not found.

- [ ] **Step 3: Create `DocViewer.jsx`**

Move everything from `PreviewModal.jsx` EXCEPT the portal, backdrop, header, and close into `DocViewer`. Concretely: copy the constants (`DEFAULT_MAX_BYTES`, `IMAGE_TYPES`, `ZOOM_*`), `extType`, `clamp`, the two `useEffect`s (load + page-render), the keyboard effect **minus the Escape/onClose branch** (Escape stays in the modal), all state, `download`, `print`, `zoomBy`, `resetZoom`, `rotate`, `zoomPct`. Render the `.doc-viewer__stage` body and the `.doc-viewer__toolbar` (gated by `showToolbar`), plus `{extraToolbarActions}` right after the print button. No `createPortal`, no `.doc-viewer__header`. Root: `<div className="doc-viewer doc-viewer--embedded">`.

```jsx
// client/src/components/common/DocViewer.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import Icons from './Icons';
import { loadPdfDocument } from '../../lib/pdfThumbnail';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
const ZOOM_MIN = 0.25, ZOOM_MAX = 4, ZOOM_STEP = 0.25;

function extType(fileName = '') {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return '';
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

export default function DocViewer({ fileName, fetchBlob, maxBytes = DEFAULT_MAX_BYTES, showToolbar = true, extraToolbarActions = null }) {
    const [state, setState] = useState({ status: 'idle', mime: '', tooBig: false });
    const [blobUrl, setBlobUrl] = useState(null);
    const [pdf, setPdf] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [page, setPage] = useState(1);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [fit, setFit] = useState(true);
    const scrollRef = useRef(null);
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);

    useEffect(() => {
        let cancelled = false, localUrl = null, localPdf = null;
        setState({ status: 'loading', mime: '', tooBig: false });
        setBlobUrl(null); setPdf(null); setNumPages(0); setPage(1); setZoom(1); setRotation(0); setFit(true);
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
                localUrl = URL.createObjectURL(blob);
                if (cancelled) { URL.revokeObjectURL(localUrl); return; }
                setBlobUrl(localUrl);
                if (isPdf && !tooBig) {
                    const buf = await blob.arrayBuffer();
                    if (cancelled) return;
                    localPdf = await loadPdfDocument(buf.slice(0));
                    if (cancelled) { localPdf.destroy(); return; }
                    setPdf(localPdf); setNumPages(localPdf.numPages);
                }
                setState({ status: 'ready', mime, tooBig });
            } catch { if (!cancelled) setState({ status: 'error', mime: '', tooBig: false }); }
        })();
        return () => {
            cancelled = true;
            if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
            if (localPdf) { try { localPdf.destroy(); } catch { /* noop */ } }
            if (localUrl) URL.revokeObjectURL(localUrl);
        };
    }, [fetchBlob, fileName, maxBytes]);

    useEffect(() => {
        if (!pdf || state.status !== 'ready') return;
        let cancelled = false;
        (async () => {
            const pg = await pdf.getPage(page);
            if (cancelled) return;
            let scale = zoom;
            if (fit && scrollRef.current) {
                const base = pg.getViewport({ scale: 1, rotation });
                const avail = scrollRef.current.clientWidth - 48;
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

    const isPdf = state.mime === 'application/pdf';
    const goPage = useCallback((delta) => { setFit(true); setPage(p => clamp(p + delta, 1, numPages || 1)); }, [numPages]);

    useEffect(() => {
        const onKey = (e) => {
            if (!isPdf || numPages <= 1) return;
            if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(1); }
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(-1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isPdf, numPages, goPage]);

    const { status, mime, tooBig } = state;
    const isImage = IMAGE_TYPES.includes(mime);
    const canPreview = status === 'ready' && !tooBig && (isPdf || isImage);
    const zoomBy = (d) => { setFit(false); setZoom(z => clamp(+(z + d).toFixed(2), ZOOM_MIN, ZOOM_MAX)); };
    const resetZoom = () => { setFit(true); setZoom(1); };
    const rotate = () => setRotation(r => (r + 90) % 360);
    const download = () => { if (!blobUrl) return; const a = document.createElement('a'); a.href = blobUrl; a.download = fileName || 'download'; document.body.appendChild(a); a.click(); a.remove(); };
    const print = () => { if (!blobUrl) return; const w = window.open(blobUrl, '_blank'); if (w) w.addEventListener('load', () => { try { w.print(); } catch { /* noop */ } }); };
    const zoomPct = Math.round((fit && isImage ? 1 : zoom) * 100);

    return (
        <div className="doc-viewer doc-viewer--embedded">
            <div className="doc-viewer__stage" ref={scrollRef}>
                {status === 'loading' && <div className="doc-viewer__msg">Loading…</div>}
                {status === 'error' && <div className="doc-viewer__msg doc-viewer__msg--error">Could not load this file.</div>}
                {canPreview && isPdf && (<div className="doc-viewer__page"><canvas ref={canvasRef} className="doc-viewer__canvas" /></div>)}
                {canPreview && isImage && (
                    <div className="doc-viewer__page">
                        <img alt={fileName} src={blobUrl} className="doc-viewer__image"
                            style={{ transform: `rotate(${rotation}deg) scale(${fit ? 1 : zoom})`, maxWidth: fit ? '100%' : 'none', maxHeight: fit ? '100%' : 'none' }} />
                    </div>
                )}
                {status === 'ready' && !canPreview && (
                    <div className="doc-viewer__fallback">
                        <span className="doc-viewer__fallback-icon">{Icons.fileText}</span>
                        <p className="doc-viewer__fallback-name">{fileName}</p>
                        <p className="doc-viewer__fallback-note">{tooBig ? 'This file is too large to preview.' : 'This file type can’t be previewed.'}</p>
                        <button className="btn btn--primary" onClick={download}>{Icons.download}<span>Download</span></button>
                    </div>
                )}
            </div>
            {showToolbar && canPreview && (
                <div className="doc-viewer__toolbar" role="toolbar" aria-label="Document controls">
                    <div className="doc-viewer__toolgroup">
                        <button className="doc-viewer__tool" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Zoom out" aria-label="Zoom out">−</button>
                        <button className="doc-viewer__tool doc-viewer__tool--text" onClick={resetZoom} title="Reset zoom">{zoomPct}%</button>
                        <button className="doc-viewer__tool" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Zoom in" aria-label="Zoom in">+</button>
                    </div>
                    <span className="doc-viewer__sep" />
                    <button className={`doc-viewer__tool doc-viewer__tool--text${fit ? ' is-active' : ''}`} onClick={() => setFit(f => !f)} title="Fit to width" aria-pressed={fit}>Fit</button>
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
                    {extraToolbarActions}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Rewrite `PreviewModal.jsx` to use `DocViewer`**

Replace the whole file body with a thin wrapper: keep the portal, `.doc-viewer__header` (icon + name + close), Escape-to-close + body-scroll-lock effect, and render `<DocViewer>` for the content. Pass `extraToolbarActions={onDelete ? <deleteButton/> : null}`. Public props unchanged (`open, fileName, fetchBlob, onClose, onDelete, maxBytes`).

```jsx
// client/src/components/common/PreviewModal.jsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icons from './Icons';
import DocViewer from './DocViewer';

export default function PreviewModal({ open, fileName, fetchBlob, onClose, onDelete, maxBytes }) {
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
                <div className="doc-viewer__title">
                    <span className="doc-viewer__title-icon">{Icons.fileText}</span>
                    <span className="doc-viewer__title-text" title={fileName}>{fileName || 'Preview'}</span>
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
```

- [ ] **Step 5: Update the CSS so the modal fills the screen and the embedded viewer fills its box**

In `client/src/index.css`, change `.doc-viewer` (currently `position: fixed; inset: 0`) so the fixed/full-screen behavior applies only to `.doc-viewer--modal`; `.doc-viewer--embedded` is `height: 100%` and fills its parent. Find the `.doc-viewer {` block and split it:

```css
.doc-viewer { display: flex; flex-direction: column; background: hsl(224 30% 12%); color: hsl(0 0% 96%); }
.doc-viewer--modal { position: fixed; inset: 0; z-index: 200; animation: fadeIn 0.15s ease; }
.doc-viewer--embedded { height: 100%; min-height: 0; border-radius: var(--radius); overflow: hidden; }
```

(Leave `.doc-viewer__header/__stage/__toolbar/__tool/...` rules as-is — they already work for both.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx vitest run src/__tests__/DocViewer.test.jsx src/__tests__/PreviewModal.test.jsx`
Expected: PASS — DocViewer (6) and PreviewModal (6, unchanged).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/common/DocViewer.jsx client/src/components/common/PreviewModal.jsx client/src/__tests__/DocViewer.test.jsx client/src/index.css
git commit -m "refactor(preview): extract DocViewer engine; PreviewModal renders it"
```

---

### Task 2: `useIsWide` responsive hook

**Files:**
- Create: `client/src/hooks/useIsWide.js`
- Test: `client/src/__tests__/useIsWide.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useIsWide(minWidth = 900): boolean` — `true` when `window.innerWidth >= minWidth`, updates on resize.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useIsWide.test.jsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useIsWide } from '../hooks/useIsWide';

describe('useIsWide', () => {
  it('is true when window is at/above the breakpoint', () => {
    window.innerWidth = 1200;
    const { result } = renderHook(() => useIsWide(900));
    expect(result.current).toBe(true);
  });

  it('is false below the breakpoint and updates on resize', () => {
    window.innerWidth = 600;
    const { result } = renderHook(() => useIsWide(900));
    expect(result.current).toBe(false);
    act(() => { window.innerWidth = 1000; window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/useIsWide.test.jsx`
Expected: FAIL — `useIsWide` not exported.

- [ ] **Step 3: Write the implementation**

```js
// client/src/hooks/useIsWide.js
import { useEffect, useState } from 'react';

export function useIsWide(minWidth = 900) {
    const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= minWidth : true));
    useEffect(() => {
        const onResize = () => setWide(window.innerWidth >= minWidth);
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [minWidth]);
    return wide;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/useIsWide.test.jsx`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useIsWide.js client/src/__tests__/useIsWide.test.jsx
git commit -m "feat(hooks): add useIsWide responsive breakpoint hook"
```

---

### Task 3: `CertFileRow` gains selection + click affordance

**Files:**
- Modify: `client/src/components/files/CertFileRow.jsx`
- Modify: `client/src/index.css`
- Test: `client/src/__tests__/CertFileRow.test.jsx`

**Interfaces:**
- Consumes: existing `CertFileRow` props (`upload, onPreview, onDownload, fetchBlob, cacheKey, badge, expiresText`).
- Produces: two new optional props: `selected?: boolean` (adds `is-selected` class) and `onSelect?: (upload) => void` (clicking the row body — name/meta area — calls it; Preview/Download buttons still call their own handlers via `stopPropagation`). Backward compatible: with neither prop the row behaves exactly as today.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/CertFileRow.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertFileRow from '../components/files/CertFileRow';

vi.mock('../components/common/FileThumbnail', () => ({ default: () => <div data-testid="thumb" /> }));

const upload = { id: 1, fileName: 'a.pdf', fileType: 'application/pdf' };

describe('CertFileRow', () => {
  it('adds is-selected when selected', () => {
    const { container } = render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={vi.fn()} selected />);
    expect(container.querySelector('.file-row--cert.is-selected')).toBeInTheDocument();
  });

  it('calls onSelect when the row body is clicked', () => {
    const onSelect = vi.fn();
    render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={vi.fn()} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('a.pdf'));
    expect(onSelect).toHaveBeenCalledWith(upload);
  });

  it('does not call onSelect when Download is clicked', () => {
    const onSelect = vi.fn(); const onDownload = vi.fn();
    render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={onDownload} onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle('Download'));
    expect(onDownload).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/CertFileRow.test.jsx`
Expected: FAIL — no `is-selected` / `onSelect` behavior.

- [ ] **Step 3: Implement**

In `CertFileRow.jsx`: add `selected` and `onSelect` to the props. On the root `<div className="file-row file-row--cert">` add `${selected ? ' is-selected' : ''}`. Wrap the `file-row__main` block in an `onClick={() => onSelect && onSelect(upload)}` (only wire the handler when `onSelect` is provided; add `role="button"`/`tabIndex={0}` when clickable). On the two action `<button>`s add `onClick={(e) => { e.stopPropagation(); onPreview(previewItem); }}` and the same for download, so row-body selection and button actions don't collide.

- [ ] **Step 4: Add the selected style**

In `index.css`, near `.file-row--cert`:

```css
.file-row--cert.is-selected { background: hsl(var(--primary) / 0.08); box-shadow: inset 3px 0 0 hsl(var(--primary)); }
.file-row__main { cursor: default; }
.file-row--cert[role="button"] .file-row__main, .file-row--cert .file-row__main[role="button"] { cursor: pointer; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/CertFileRow.test.jsx`
Expected: PASS (3).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/files/CertFileRow.jsx client/src/index.css client/src/__tests__/CertFileRow.test.jsx
git commit -m "feat(certs): CertFileRow selection highlight + row-body onSelect"
```

---

### Task 4: `FilePreviewPane` (docked split view)

**Files:**
- Create: `client/src/components/common/FilePreviewPane.jsx`
- Modify: `client/src/index.css`
- Test: `client/src/__tests__/FilePreviewPane.test.jsx`

**Interfaces:**
- Consumes: `DocViewer` (Task 1), `CertFileRow` (Task 3), `useIsWide` (Task 2), `Icons`.
- Produces: default export `FilePreviewPane`, props:
  - `items: Array<{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }>`
  - `selectedId: string | number | null`
  - `onSelect: (id) => void`
  - `open: boolean` (false → list only; true → list + docked panel)
  - `onExpand: (item) => void` (open full-screen modal for an item)
  - `onDownload?: (item) => void`
  - `emptyText?: string` (default `'No files'`)
  - Behavior: renders one `CertFileRow` per item (selected when `item.id === selectedId`, row click → `onSelect(item.id)`; Preview button → `onExpand(item)`; Download → `onDownload`). When `open` **and** `useIsWide()`, renders a right-hand `<DocViewer>` for the selected item (empty-state text if none) with an Expand action in its toolbar. When not wide, never renders the panel and row clicks call `onExpand` instead of `onSelect` (so narrow screens go straight to the modal).

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/FilePreviewPane.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilePreviewPane from '../components/common/FilePreviewPane';

vi.mock('../components/common/FileThumbnail', () => ({ default: () => <div data-testid="thumb" /> }));
vi.mock('../components/common/DocViewer', () => ({ default: ({ fileName }) => <div data-testid="docviewer">{fileName}</div> }));

let wide = true;
vi.mock('../hooks/useIsWide', () => ({ useIsWide: () => wide }));

const items = [
  { id: 'a', fileName: 'a.pdf', fileType: 'application/pdf', fetchBlob: vi.fn() },
  { id: 'b', fileName: 'b.png', fileType: 'image/png', fetchBlob: vi.fn() },
];

beforeEach(() => { wide = true; });

describe('FilePreviewPane', () => {
  it('renders a row per item', () => {
    render(<FilePreviewPane items={items} selectedId={null} onSelect={vi.fn()} open={false} onExpand={vi.fn()} />);
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
  });

  it('does not render the panel when open is false', () => {
    render(<FilePreviewPane items={items} selectedId="a" onSelect={vi.fn()} open={false} onExpand={vi.fn()} />);
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });

  it('shows the selected item in the panel when open on a wide screen', () => {
    render(<FilePreviewPane items={items} selectedId="a" onSelect={vi.fn()} open onExpand={vi.fn()} />);
    expect(screen.getByTestId('docviewer')).toHaveTextContent('a.pdf');
  });

  it('selecting a row calls onSelect on a wide screen', () => {
    const onSelect = vi.fn();
    render(<FilePreviewPane items={items} selectedId={null} onSelect={onSelect} open onExpand={vi.fn()} />);
    fireEvent.click(screen.getByText('b.png'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('on a narrow screen, row click calls onExpand and no panel renders', () => {
    wide = false;
    const onExpand = vi.fn();
    render(<FilePreviewPane items={items} selectedId={null} onSelect={vi.fn()} open onExpand={onExpand} />);
    fireEvent.click(screen.getByText('a.pdf'));
    expect(onExpand).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/FilePreviewPane.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// client/src/components/common/FilePreviewPane.jsx
import Icons from './Icons';
import DocViewer from './DocViewer';
import CertFileRow from '../files/CertFileRow';
import { useIsWide } from '../../hooks/useIsWide';

export default function FilePreviewPane({ items, selectedId, onSelect, open, onExpand, onDownload, emptyText = 'No files' }) {
    const wide = useIsWide(900);
    const docked = open && wide;
    const selected = items.find(i => i.id === selectedId) || null;

    const rowSelect = (item) => { if (docked) onSelect(item.id); else onExpand(item); };

    return (
        <div className={`file-preview-pane${docked ? ' file-preview-pane--split' : ''}`}>
            <div className="file-preview-pane__list cert-history__list">
                {items.length === 0 ? (
                    <div className="file-preview-pane__empty">{emptyText}</div>
                ) : items.map(item => (
                    <CertFileRow
                        key={item.id}
                        upload={item}
                        fetchBlob={item.fetchBlob}
                        cacheKey={item.cacheKey}
                        badge={item.badge}
                        expiresText={item.meta}
                        selected={docked && item.id === selectedId}
                        onSelect={() => rowSelect(item)}
                        onPreview={() => onExpand(item)}
                        onDownload={() => (onDownload ? onDownload(item) : onExpand(item))}
                    />
                ))}
            </div>
            {docked && (
                <div className="file-preview-pane__panel">
                    {selected ? (
                        <DocViewer
                            fileName={selected.fileName}
                            fetchBlob={selected.fetchBlob}
                            extraToolbarActions={(
                                <button className="doc-viewer__tool" onClick={() => onExpand(selected)} title="Expand" aria-label="Expand">{Icons.externalLink || Icons.eye}</button>
                            )}
                        />
                    ) : (
                        <div className="file-preview-pane__panel-empty">Select a file to preview</div>
                    )}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Add pane CSS**

In `index.css`:

```css
.file-preview-pane { display: flex; flex-direction: column; min-height: 0; }
.file-preview-pane--split { flex-direction: row; gap: 16px; align-items: stretch; }
.file-preview-pane--split .file-preview-pane__list { flex: 0 0 320px; overflow-y: auto; max-height: 70vh; }
.file-preview-pane__panel { flex: 1 1 auto; min-width: 0; min-height: 420px; height: 70vh; }
.file-preview-pane__panel-empty, .file-preview-pane__empty { display: flex; align-items: center; justify-content: center; height: 100%; color: hsl(var(--muted-foreground)); font-size: 13px; padding: 24px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/FilePreviewPane.test.jsx`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/common/FilePreviewPane.jsx client/src/index.css client/src/__tests__/FilePreviewPane.test.jsx
git commit -m "feat(common): FilePreviewPane docked split-view (list + DocViewer)"
```

---

### Task 5: Wire `FilePreviewPane` into the Employee Certifications tab

**Files:**
- Modify: `client/src/pages/EmployeeDetailPage.jsx` (`CertificationsTab` render; imports)

**Interfaces:**
- Consumes: `FilePreviewPane` (Task 4); existing `previewUpload` state + `PreviewModal` mount; `api.downloadEmployeeCertification` / `api.downloadCertificationUpload`.
- Produces: no exported interface; per-cert-card `items` + a `split`/`selectedId` state.

- [ ] **Step 1: Add state + a Preview toggle to each expanded cert card**

In `CertificationsTab`, add `const [split, setSplit] = useState(false);` and `const [selectedFileId, setSelectedFileId] = useState(null);`. Add a small toggle button near the card's "History" label / card header:

```jsx
<button className="btn btn--outline btn--sm" onClick={() => setSplit(s => !s)}>{split ? 'Hide preview' : 'Preview'}</button>
```

- [ ] **Step 2: Build items + render the pane**

Replace the two `cert-history__list` blocks (current file + history) inside the expanded card with one `items` array and a `FilePreviewPane`. Build items:

```jsx
const items = [];
if (rec.fileName) items.push({ id: `cert:${rec.id}`, fileName: rec.fileName, fileType: rec.fileType, cacheKey: `cert:${rec.id}`,
    fetchBlob: () => api.downloadEmployeeCertification(rec.id),
    meta: rec.expirationDate ? `Expires ${formatDate(rec.expirationDate)}` : 'No expiry',
    badge: <span className={`ts-badge ts-badge--${statusBadgeClass(status)}`}>{statusLabel(status)}</span> });
(rec.uploads || []).filter(u => u.fileName !== rec.fileName).forEach(u => items.push({
    id: `upload:${u.id}`, fileName: u.fileName, fileType: u.fileType, cacheKey: `cert-upload:${u.id}`,
    fetchBlob: () => api.downloadCertificationUpload(u.id),
    meta: [u.submittedAt ? `Uploaded ${formatTimestamp(u.submittedAt)}` : '', u.expirationDate ? `Expires ${formatDate(u.expirationDate)}` : ''].filter(Boolean).join(' · '),
}));
```

Add a shared save helper next to the existing handlers (it does exactly what `handleDownload`/`handleDownloadUpload` already do, but from an item's `fetchBlob`):

```jsx
const saveItem = async (item) => {
    try {
        const res = await item.fetchBlob();
        if (!res.ok) throw new Error('Download failed');
        const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
        const blob = await res.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
        if (contentType === 'application/pdf') { window.open(url, '_blank'); }
        else { const a = document.createElement('a'); a.href = url; a.download = item.fileName; a.click(); URL.revokeObjectURL(url); }
    } catch (err) { showToast(err.message, 'error'); }
};
```

```jsx
<FilePreviewPane
    items={items}
    selectedId={selectedFileId}
    onSelect={setSelectedFileId}
    open={split}
    onExpand={(item) => setPreviewUpload({ fileName: item.fileName, fetchBlob: item.fetchBlob })}
    onDownload={saveItem}
/>
```

> Note: `onExpand` sets `previewUpload` with a `fetchBlob`; the existing `PreviewModal` mount already honors `previewUpload.fetchBlob`. Re-import `formatTimestamp` (it was removed earlier) alongside `formatDate`.

- [ ] **Step 3: Manual verification**

Run: `cd client && npm run build`; hard-refresh an employee with cert history (e.g. Jie Feng), Certifications tab, expand a cert.
Expected: rows render as before; clicking **Preview** docks a panel; selecting a row shows it inline; Expand opens the full-screen modal; narrow window → row click opens the modal.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EmployeeDetailPage.jsx
git commit -m "feat(certs): docked FilePreviewPane in the certifications tab"
```

---

### Task 6: Wire `FilePreviewPane` into the File Manager (`/files`)

**Files:**
- Modify: `client/src/pages/FilesPage.jsx` (right panel; state)
- Modify: `client/src/components/files/FileList.jsx` (add a Preview toggle to `.file-list__controls`, beside the "All Types"/"Name" selects; expose an `onTogglePreview`/`previewOn` prop)

**Interfaces:**
- Consumes: `FilePreviewPane` (Task 4); existing `previewFile` state + `PreviewModal`; `api.getToken()`; `/api/files/:id/download`.
- Produces: no exported interface; `split` + `selectedFileId` state on `FilesPage`; a `previewOn`/`onTogglePreview` prop pair on `FileList`.

- [ ] **Step 1: Add the toggle to `FileList` controls**

In `FileList.jsx`, add props `previewOn` and `onTogglePreview`, and render a toggle in `.file-list__controls` beside the existing selects:

```jsx
<button className={`file-list__filter${previewOn ? ' is-active' : ''}`} onClick={onTogglePreview} title="Toggle preview">
    {Icons.eye} {previewOn ? 'Preview: On' : 'Preview'}
</button>
```

- [ ] **Step 2: Add state + render the pane in `FilesPage`**

Add `const [split, setSplit] = useState(false);` and `const [selectedFileId, setSelectedFileId] = useState(null);`. Keep `FileList` for the list header/controls/empty-state, but when a folder is selected render the pane for the file rows. Simplest single-path approach: pass `previewOn={split}` / `onTogglePreview={() => setSplit(s => !s)}` to `FileList`, and have `FileList` render a `<FilePreviewPane>` for its rows (map `files` → items) instead of `FileRow`s. Map:

```jsx
const items = files.map(f => ({ id: f.id, fileName: f.name, fileType: f.mimeType, cacheKey: `file:${f.id}`,
    fetchBlob: () => fetch(`/api/files/${f.id}/download`, { headers: { Authorization: `Bearer ${api.getToken()}` } }),
    meta: `${label(f)} · ${formatFileSize(f.size)}` }));
```

`onExpand={(item) => setPreviewFile(files.find(f => f.id === item.id))}` (reuses the `previewFile` → `PreviewModal` mount, which already supports `onDelete`).

> Note: multi-select checkboxes live on the current `FileRow`; in split mode the pane uses `CertFileRow` (no checkbox). Per the spec decision, the toggle is a toolbar control and select-mode stays on the non-split list — so render the pane only when `split` is on, and the plain `FileList`/`FileRow` list (with checkboxes) when off. Confirm both paths compile.

- [ ] **Step 3: Manual verification**

Run: `cd client && npm run build`; hard-refresh `/files`, open a folder.
Expected: a **Preview** toggle sits beside "All Types"/"Name"; off = today's list with checkboxes; on = split list + inline preview; Expand opens the modal; delete still works from the modal.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/FilesPage.jsx client/src/components/files/FileList.jsx
git commit -m "feat(files): docked FilePreviewPane toggle in the File Manager toolbar"
```

---

### Task 7: Normalize `downloadAuthDocument` to return a Response

**Files:**
- Modify: `client/src/api.js` (`downloadAuthDocument`, ~line 326)
- Modify: `client/src/pages/ClientDetailPage.jsx` (`handleDownloadAuthDoc`, ~line 673)

**Interfaces:**
- Consumes: nothing new.
- Produces: `api.downloadAuthDocument(id)` returns a `Response` (like `downloadCertificationUpload`); `handleDownloadAuthDoc` reads `.blob()` off it.

- [ ] **Step 1: Change the api helper**

In `api.js`, make `downloadAuthDocument` return the raw `Response` (do not `.blob()` inside it) — match the shape of `downloadCertificationUpload`. Keep auth headers.

- [ ] **Step 2: Update the one caller**

In `ClientDetailPage.jsx` `handleDownloadAuthDoc`, change `const blob = await api.downloadAuthDocument(doc.id);` to read from the response: `const res = await api.downloadAuthDocument(doc.id); const blob = await res.blob();` (mirror `handleDownloadUpload`).

- [ ] **Step 3: Verify no other callers**

Run: `cd client && grep -rn "downloadAuthDocument" src/`
Expected: only `api.js` (definition) and `ClientDetailPage.jsx` (the updated caller).

- [ ] **Step 4: Manual verification + build**

Run: `cd client && npm run build`; on a client with an authorization attachment, download it.
Expected: download still works.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.js client/src/pages/ClientDetailPage.jsx
git commit -m "refactor(api): downloadAuthDocument returns a Response (viewer contract)"
```

---

### Task 8: Wire the shared preview pane into the client Programs/Auth tab

**Files:**
- Modify: `client/src/pages/client-tabs/ProgramsAuthTab.jsx` (attachments render; a shared pane)
- Modify: `client/src/pages/ClientDetailPage.jsx` (mount a `PreviewModal` for auth-doc Expand; pass state/handlers into the tab)

**Interfaces:**
- Consumes: `FilePreviewPane` (Task 4); `api.downloadAuthDocument` (Task 7, now a `Response`); a `PreviewModal` mount on the client detail page.
- Produces: no exported interface; **one shared** `split` + `selectedId` state for the whole tab; items namespaced `auth-doc:<id>`.

- [ ] **Step 1: Lift shared pane state**

At the tab level (or `ClientDetailPage`, passed down), add `const [authDocSplit, setAuthDocSplit] = useState(false);` and `const [selectedAuthDoc, setSelectedAuthDoc] = useState(null);`, plus a `previewAuthDoc` state driving a `PreviewModal` mount on `ClientDetailPage`.

- [ ] **Step 2: Build one item list across all authorizations**

Flatten every authorization's `documents[]` into a single items array (keep each doc's parent auth for labeling if useful):

```jsx
const authDocItems = auths.flatMap(a => (a.documents || []).map(doc => ({
    id: `auth-doc:${doc.id}`, fileName: doc.fileName || doc.name, fileType: doc.fileType || doc.mimeType,
    cacheKey: `auth-doc:${doc.id}`, fetchBlob: () => api.downloadAuthDocument(doc.id),
    meta: a.serviceCode ? `${a.serviceCode}` : '',
})));
```

- [ ] **Step 3: Replace the download-only links with the shared pane**

Add a **Preview** toggle in the tab's toolbar area (`setAuthDocSplit`). Render one `<FilePreviewPane items={authDocItems} selectedId={selectedAuthDoc} onSelect={setSelectedAuthDoc} open={authDocSplit} onExpand={(item) => setPreviewAuthDoc({ fileName: item.fileName, fetchBlob: item.fetchBlob })} />` for the whole tab (not per card). Keep each auth card's existing upload/delete affordances. On `ClientDetailPage`, mount `{previewAuthDoc && <PreviewModal open fileName={previewAuthDoc.fileName} fetchBlob={previewAuthDoc.fetchBlob} onClose={() => setPreviewAuthDoc(null)} />}`.

> Note: preserve the current per-auth `cp-auth-attachments__toggle` count display; the shared pane is the preview surface, the per-auth list can remain the source of upload/delete actions, or be folded into the pane rows — keep upload/delete reachable either way.

- [ ] **Step 4: Manual verification**

Run: `cd client && npm run build`; open a client with authorization attachments, Programs/Authorizations tab.
Expected: toggling Preview docks one shared pane; selecting a doc from any auth previews it inline; Expand opens the modal; upload/delete still work.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/client-tabs/ProgramsAuthTab.jsx client/src/pages/ClientDetailPage.jsx
git commit -m "feat(client): shared docked preview pane for authorization attachments"
```

---

### Task 9: Document the pane in CLAUDE.md + full regression

**Files:**
- Modify: `CLAUDE.md` ("File Preview & Thumbnails — Reusable Components")

- [ ] **Step 1: Update CLAUDE.md**

Add `DocViewer` and `FilePreviewPane` to the reusable-components table and the shared-components index. Document: `DocViewer` is the single rendering engine (both `PreviewModal` and `FilePreviewPane` render it); `FilePreviewPane` is the **docked** alternative to the full-screen modal, toggle lives in the host page toolbar, `useIsWide` collapses it to modal-only on narrow screens; the normalized item shape `{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }`.

- [ ] **Step 2: Full client test + build**

Run: `cd client && npm test`
Expected: PASS — including `DocViewer`, `FilePreviewPane`, `useIsWide`, `CertFileRow`, and the unchanged `PreviewModal` (regression guard).

Run: `cd client && npm run build`
Expected: build succeeds; `pdf-*.js` still code-split.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document DocViewer + FilePreviewPane reusable components"
```
