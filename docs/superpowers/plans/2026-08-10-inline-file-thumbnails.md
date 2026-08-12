# Inline File Thumbnails + Hover Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render inline file thumbnails (real image + PDF-page-1 thumbnails, typed-icon fallback) with a hover preview popover and a `+N` overflow gallery, in cert history rows and the File Manager, reusing the existing PreviewModal.

**Architecture:** A `useFileThumbnail` hook fetches a file's blob and produces a thumbnail URL (image object-URL, or a pdfjs-rendered page-1 data-URL, or `icon`), backed by a module-level LRU cache. A `FileThumbnail` component lazy-triggers the hook via IntersectionObserver, renders the thumb (or the existing `FileTypeIcon` fallback), shows a hover popover, and opens PreviewModal on click. A `FileThumbnailStrip` renders the first thumbnail + a `+N` badge that opens a gallery modal. These wire into `CertificationsTab` (strip per upload list) and `FileRow` (single thumbnail per row).

**Tech Stack:** React 19 + Vite; `pdfjs-dist` ^6.2.108 (client-only, dynamic-imported); vitest + @testing-library/react (`vi.fn()`). Reuses `client/src/components/files/fileTypeUtils.jsx` (`FileTypeIcon`, `getFileTypeInfo`) and `client/src/components/common/PreviewModal.jsx` / `Modal.jsx`.

## Global Constraints

- Client tests: **vitest** (`import { describe, it, expect, vi } from 'vitest'`) + `@testing-library/react`; test files in `client/src/__tests__/*.test.jsx`. Run one file: `cd client && npx vitest run src/__tests__/<name>.test.jsx`.
- Commits must NOT contain any AI attribution / Co-Authored-By trailer.
- No server changes, no new endpoints. Reuse download seams: cert uploads via `api.downloadCertificationUpload(id)` (returns a `Response`); `/files` via `fetch('/api/files/' + id + '/download', { headers: { Authorization: 'Bearer ' + api.getToken() } })`.
- `fetchBlob` contract everywhere: `() => Promise<Response>` (same as `PreviewModal`).
- Typed-icon fallback MUST reuse the existing `FileTypeIcon` from `client/src/components/files/fileTypeUtils.jsx` — do not invent new icon SVGs.
- PDF-thumbnail size cap: `maxPdfBytes` default `10 * 1024 * 1024`; oversized → icon (checked via `blob.size` after fetch).
- Cache: module-level `Map`, soft cap 200 entries, LRU eviction; revoke object URLs (images) on eviction; data URLs (PDF) need no revoke.
- pdfjs is loaded via dynamic `import()` inside the hook so it forms its own lazy chunk. Worker configured with Vite `?url` import.
- After frontend changes, gate each UI task on a successful `cd client && npm run build` (exit 0). Client `dist/` is gitignored — never commit built assets; if a build dirties `client/dist`, run `git checkout -- client/dist` before committing.

## Design System — MANDATORY for every UI task

Read `docs/superpowers/specs/2026-06-01-design-system-design.md` before writing any component. These are hard requirements — a senior UI/UX designer would reject inline-hardcoded colors/radii/shadows. All visual styling MUST go through the app's tokens and live in **CSS classes in `client/src/index.css`**, NOT as hardcoded inline `style={{…}}` values. Inline `style` is allowed ONLY for genuinely dynamic values (e.g. a computed `size` px passed as a prop, or a CSS variable set from a prop like `style={{ '--thumb-size': size + 'px' }}`).

Use these exact tokens/values (from the design system spec + `index.css`):
- **Radius:** `var(--radius)` (8px) for thumbnails, popover, gallery tiles. Circular `+N` badge uses `border-radius: 50%`.
- **Borders:** `1px solid hsl(var(--border))`.
- **Surfaces:** thumbnail placeholder `hsl(var(--muted))`; popover/gallery surface `hsl(var(--popover))` with text `hsl(var(--popover-foreground))`; `+N` badge `hsl(var(--muted))` / `hsl(var(--muted-foreground))` text, hover → `hsl(var(--accent))`.
- **Shadows:** popover uses the "Strong" card-lift shadow `0 4px 12px hsl(0 0% 0% / 0.06)`; the gallery modal inherits `Modal`'s own shadow (don't re-add).
- **Transitions:** hover/interaction `0.15s ease` (opacity, transform, box-shadow, border-color). Never animate `all`.
- **Focus:** interactive thumbnails/badges are `<button>`s and MUST show a visible focus ring `box-shadow: 0 0 0 2px hsl(var(--ring) / 0.1)` on `:focus-visible` (keyboard), matching the app.
- **Spacing:** 8px base scale — gaps between thumbnails `6px`, gallery tile gap `12px`, gallery tile padding to fit modal's `24px` padding.
- **Typography:** filename captions `11px` `hsl(var(--muted-foreground))`; `+N` badge `13px` weight `600`. Use `text-overflow: ellipsis` (single line) for filenames in the strip/gallery caption — never raw `word-break` walls of text.

UX craft requirements (a senior designer's checklist), verified in the running app on the UI tasks:
- **No layout shift:** the thumbnail slot reserves its box (fixed `size`) before the image loads, so rows don't jump when thumbnails resolve. Placeholder and final image occupy identical dimensions.
- **Hover popover polish:** fades/scales in over `0.15s` (subtle `opacity` + `translateY(2px)→0`), never abrupt. It must not overflow the viewport top — anchor above by default but the popover stays within the row's container; `pointer-events: none` so it never traps the cursor. Appears only after the thumbnail is hovered (small intent), and only shows the enlarged image when one is available (icon files show the icon at a comfortable size + filename, not an empty box).
- **Loading state is calm:** a quiet shimmer/neutral placeholder (`hsl(var(--muted))`), not a spinner that flickers for fast local loads. Image fades in (`opacity 0→1`, `0.15s`) when ready.
- **`+N` badge reads as interactive:** circular, `hsl(var(--muted))`, hover lightens to `hsl(var(--accent))` + cursor pointer + focus ring; clearly a control, aligned/sized to match the 40px thumbnail so the row stays on one baseline.
- **Gallery modal:** a tidy wrapping grid of uniform tiles (thumbnail + single-line ellipsized filename), comfortable `12px` gaps, using the existing `Modal` chrome (title, close, backdrop) — not a bespoke overlay.
- **Accessibility:** every thumbnail/badge is a real `<button>` with a meaningful `title`/`aria-label` (the filename, and "Show N more files" for the badge); keyboard-operable (Enter/Space) with the visible focus ring; images have `alt={fileName}`.

Each component gets a small dedicated block in `index.css` (e.g. `.file-thumb`, `.file-thumb__img`, `.file-thumb__popover`, `.file-thumb__more`, `.file-thumb-gallery`). Dynamic size is passed via a `--thumb-size` CSS variable set inline; everything else is class-driven.

---

### Task 1: Add pdfjs-dist dependency + a thin render helper

**Files:**
- Modify: `client/package.json` (add `pdfjs-dist`)
- Create: `client/src/lib/pdfThumbnail.js`
- Test: `client/src/__tests__/pdfThumbnail.test.js`

**Interfaces:**
- Consumes: nothing (pdfjs dynamically imported).
- Produces: `renderPdfFirstPage(arrayBuffer: ArrayBuffer, targetPx?: number): Promise<string>` — resolves to a PNG data URL of page 1, or throws on failure. Dynamically imports pdfjs, configures the worker once, renders page 1 to an offscreen canvas scaled so the larger dimension ≈ `targetPx` (default 96), returns `canvas.toDataURL('image/png')`, and calls `pdf.destroy()`.

- [ ] **Step 1: Install the dependency**

Run: `cd client && npm install pdfjs-dist@^6.2.108`
Expected: `pdfjs-dist` appears in `client/package.json` dependencies; install succeeds.

- [ ] **Step 2: Write the failing test**

```js
// client/src/__tests__/pdfThumbnail.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist BEFORE importing the helper.
const mockRender = vi.fn(() => ({ promise: Promise.resolve() }));
const mockGetViewport = vi.fn(() => ({ width: 200, height: 260 }));
const mockDestroy = vi.fn();
const mockGetPage = vi.fn(() => Promise.resolve({ getViewport: mockGetViewport, render: mockRender }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ getPage: mockGetPage, destroy: mockDestroy, numPages: 3 }) })),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom canvas: stub getContext + toDataURL
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
});

import { renderPdfFirstPage } from '../lib/pdfThumbnail';

describe('renderPdfFirstPage', () => {
  it('renders page 1 to a PNG data URL and destroys the doc', async () => {
    const url = await renderPdfFirstPage(new ArrayBuffer(8), 96);
    expect(url).toBe('data:image/png;base64,MOCK');
    expect(mockGetPage).toHaveBeenCalledWith(1);
    expect(mockRender).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('rejects when pdfjs throws', async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('bad pdf')) });
    await expect(renderPdfFirstPage(new ArrayBuffer(8))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/pdfThumbnail.test.js`
Expected: FAIL — module `../lib/pdfThumbnail` not found.

- [ ] **Step 4: Implement the helper**

```js
// client/src/lib/pdfThumbnail.js
let workerConfigured = false;

export async function renderPdfFirstPage(arrayBuffer, targetPx = 96) {
    const pdfjs = await import('pdfjs-dist');
    if (!workerConfigured) {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        workerConfigured = true;
    }
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = targetPx / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
    } finally {
        pdf.destroy();
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/pdfThumbnail.test.js`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/src/lib/pdfThumbnail.js client/src/__tests__/pdfThumbnail.test.js
git commit -m "feat(files): add pdfjs-dist + renderPdfFirstPage helper"
```

---

### Task 2: `useFileThumbnail` hook (with LRU cache)

**Files:**
- Create: `client/src/hooks/useFileThumbnail.js`
- Test: `client/src/__tests__/useFileThumbnail.test.jsx`

**Interfaces:**
- Consumes: `renderPdfFirstPage` (Task 1).
- Produces: `useFileThumbnail(cacheKey, fetchBlob, mimeType, { enabled = true, maxPdfBytes = 10*1024*1024 } = {}) → { status, thumbUrl }` where `status ∈ 'idle'|'loading'|'ready'|'icon'`, `thumbUrl: string|null`. Also exports `__clearThumbnailCache()` for tests.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useFileThumbnail.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/pdfThumbnail', () => ({
  renderPdfFirstPage: vi.fn(() => Promise.resolve('data:image/png;base64,PDF')),
}));
import { renderPdfFirstPage } from '../lib/pdfThumbnail';
import { useFileThumbnail, __clearThumbnailCache } from '../hooks/useFileThumbnail';

function resp({ type, size = 100 }) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : null) },
    blob: async () => ({ type, size, arrayBuffer: async () => new ArrayBuffer(size) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearThumbnailCache();
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
});

describe('useFileThumbnail', () => {
  it('returns an object URL for an image', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result } = renderHook(() => useFileThumbnail('file:1', fetchBlob, 'image/png'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.thumbUrl).toBe('blob:mock');
  });

  it('renders a PDF via renderPdfFirstPage', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/pdf' })));
    const { result } = renderHook(() => useFileThumbnail('file:2', fetchBlob, 'application/pdf'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(renderPdfFirstPage).toHaveBeenCalled();
    expect(result.current.thumbUrl).toBe('data:image/png;base64,PDF');
  });

  it('returns icon for an oversized PDF without rendering', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/pdf', size: 99 * 1024 * 1024 })));
    const { result } = renderHook(() => useFileThumbnail('file:3', fetchBlob, 'application/pdf', { maxPdfBytes: 1024 }));
    await waitFor(() => expect(result.current.status).toBe('icon'));
    expect(renderPdfFirstPage).not.toHaveBeenCalled();
  });

  it('returns icon for an unknown type', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/vnd.ms-excel' })));
    const { result } = renderHook(() => useFileThumbnail('file:4', fetchBlob, 'application/vnd.ms-excel'));
    await waitFor(() => expect(result.current.status).toBe('icon'));
  });

  it('returns icon when fetchBlob rejects', async () => {
    const fetchBlob = vi.fn(() => Promise.reject(new Error('net')));
    const { result } = renderHook(() => useFileThumbnail('file:5', fetchBlob, 'image/png'));
    await waitFor(() => expect(result.current.status).toBe('icon'));
  });

  it('serves a cached result without calling fetchBlob again', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result: r1 } = renderHook(() => useFileThumbnail('file:6', fetchBlob, 'image/png'));
    await waitFor(() => expect(r1.current.status).toBe('ready'));
    const { result: r2 } = renderHook(() => useFileThumbnail('file:6', fetchBlob, 'image/png'));
    await waitFor(() => expect(r2.current.status).toBe('ready'));
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result } = renderHook(() => useFileThumbnail('file:7', fetchBlob, 'image/png', { enabled: false }));
    expect(result.current.status).toBe('idle');
    expect(fetchBlob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/useFileThumbnail.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```js
// client/src/hooks/useFileThumbnail.js
import { useEffect, useState } from 'react';
import { renderPdfFirstPage } from '../lib/pdfThumbnail';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_CACHE = 200;
const cache = new Map(); // cacheKey -> { status, thumbUrl }

export function __clearThumbnailCache() {
    for (const v of cache.values()) {
        if (v.thumbUrl && v.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(v.thumbUrl);
    }
    cache.clear();
}

function cacheSet(key, value) {
    if (cache.size >= MAX_CACHE) {
        const oldestKey = cache.keys().next().value;
        const old = cache.get(oldestKey);
        if (old?.thumbUrl && old.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(old.thumbUrl);
        cache.delete(oldestKey);
    }
    cache.set(key, value);
}

export function useFileThumbnail(cacheKey, fetchBlob, mimeType, { enabled = true, maxPdfBytes = 10 * 1024 * 1024 } = {}) {
    const [state, setState] = useState(() => cache.get(cacheKey) || { status: 'idle', thumbUrl: null });

    useEffect(() => {
        if (!enabled) return;
        const cached = cache.get(cacheKey);
        if (cached) { setState(cached); return; }

        let cancelled = false;
        setState({ status: 'loading', thumbUrl: null });
        (async () => {
            let result = { status: 'icon', thumbUrl: null };
            try {
                const res = await fetchBlob();
                if (!res.ok) throw new Error('fetch failed');
                const blob = await res.blob();
                const type = (res.headers.get('Content-Type') || mimeType || blob.type || '').split(';')[0];
                if (IMAGE_TYPES.includes(type)) {
                    result = { status: 'ready', thumbUrl: URL.createObjectURL(blob) };
                } else if (type === 'application/pdf' && blob.size <= maxPdfBytes) {
                    const buf = await blob.arrayBuffer();
                    const url = await renderPdfFirstPage(buf, 96);
                    result = { status: 'ready', thumbUrl: url };
                } else {
                    result = { status: 'icon', thumbUrl: null };
                }
            } catch {
                result = { status: 'icon', thumbUrl: null };
            }
            if (cancelled) {
                if (result.thumbUrl && result.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(result.thumbUrl);
                return;
            }
            cacheSet(cacheKey, result);
            setState(result);
        })();
        return () => { cancelled = true; };
    }, [cacheKey, enabled, fetchBlob, mimeType, maxPdfBytes]);

    return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/useFileThumbnail.test.jsx`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useFileThumbnail.js client/src/__tests__/useFileThumbnail.test.jsx
git commit -m "feat(files): useFileThumbnail hook with lazy render + LRU cache"
```

---

### Task 3: `FileThumbnail` component (lazy + hover popover + click)

**Files:**
- Create: `client/src/components/common/FileThumbnail.jsx`
- Modify: `client/src/index.css` (add the `.file-thumb*` block)
- Test: `client/src/__tests__/FileThumbnail.test.jsx`

**Design note:** Read `docs/superpowers/specs/2026-06-01-design-system-design.md` first and follow the Global Constraints "Design System" section exactly. All styling is class-driven in `index.css` using tokens; the only inline style is the dynamic size via a `--thumb-size` CSS variable.

**Interfaces:**
- Consumes: `useFileThumbnail` (Task 2); `FileTypeIcon` from `../files/fileTypeUtils` (typed-icon fallback).
- Produces: default export `FileThumbnail`, props `{ file: { fileName, mimeType }, cacheKey, fetchBlob, onClick, size = 40 }`. Renders a focusable `<button>`; lazy-enables the hook via IntersectionObserver; shows `<img>` when ready, `FileTypeIcon` when `icon`/`idle`, a placeholder when `loading`; hover shows a larger-preview popover; click/Enter fires `onClick(file)`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/FileThumbnail.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let observeCb;
beforeEach(() => {
  // IntersectionObserver stub that we can trigger manually
  observeCb = null;
  global.IntersectionObserver = class {
    constructor(cb) { observeCb = cb; }
    observe() {}
    disconnect() {}
  };
});

vi.mock('../hooks/useFileThumbnail', () => ({
  useFileThumbnail: vi.fn((key, fetchBlob, mime, opts) =>
    opts?.enabled ? { status: 'ready', thumbUrl: 'blob:img' } : { status: 'idle', thumbUrl: null }
  ),
}));

import FileThumbnail from '../components/common/FileThumbnail';

const file = { fileName: 'scan.png', mimeType: 'image/png' };

describe('FileThumbnail', () => {
  it('shows the typed-icon fallback before it becomes visible (no img)', () => {
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an img once visible + ready', async () => {
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={vi.fn()} />);
    // trigger intersection
    observeCb([{ isIntersecting: true }]);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('fires onClick(file) when clicked', () => {
    const onClick = vi.fn();
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(file);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/FileThumbnail.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the design-system CSS block to `index.css`**

Append to `client/src/index.css` (all values from the design system spec / tokens; `--thumb-size` is set inline by the component):

```css
/* Inline file thumbnails (Monday.com-style) */
.file-thumb {
    position: relative;
    width: var(--thumb-size, 40px);
    height: var(--thumb-size, 40px);
    flex-shrink: 0;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--muted));
    overflow: visible;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.file-thumb:hover { border-color: hsl(var(--ring) / 0.4); }
.file-thumb:focus-visible { outline: none; box-shadow: 0 0 0 2px hsl(var(--ring) / 0.1); }
.file-thumb__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: calc(var(--radius) - 1px);
    display: block;
    opacity: 0;
    transition: opacity 0.15s ease;
}
.file-thumb__img--loaded { opacity: 1; }
.file-thumb__fallback {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.file-thumb__placeholder {
    width: 100%;
    height: 100%;
    border-radius: calc(var(--radius) - 1px);
    background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--accent)) 50%, hsl(var(--muted)) 75%);
    background-size: 200% 100%;
    animation: file-thumb-shimmer 1.2s ease-in-out infinite;
}
@keyframes file-thumb-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.file-thumb__popover {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(2px);
    z-index: 50;
    width: 240px;
    padding: 8px;
    background: hsl(var(--popover));
    color: hsl(var(--popover-foreground));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    box-shadow: 0 4px 12px hsl(0 0% 0% / 0.06);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
}
.file-thumb__popover--open { opacity: 1; transform: translateX(-50%) translateY(0); }
.file-thumb__popover-img { width: 100%; max-height: 240px; object-fit: contain; display: block; border-radius: calc(var(--radius) - 2px); }
.file-thumb__popover-icon { display: flex; align-items: center; justify-content: center; height: 120px; }
.file-thumb__popover-name {
    margin-top: 6px;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

- [ ] **Step 4: Implement the component (class-driven)**

```jsx
// client/src/components/common/FileThumbnail.jsx
import { useEffect, useRef, useState } from 'react';
import { useFileThumbnail } from '../../hooks/useFileThumbnail';
import { FileTypeIcon } from '../files/fileTypeUtils';

export default function FileThumbnail({ file, cacheKey, fetchBlob, onClick, size = 40 }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    const [hover, setHover] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    useEffect(() => {
        if (visible || !ref.current) return;
        const obs = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { setVisible(true); obs.disconnect(); }
        });
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, [visible]);

    const { status, thumbUrl } = useFileThumbnail(cacheKey, fetchBlob, file.mimeType, { enabled: visible });
    const showImg = status === 'ready' && thumbUrl;

    return (
        <button
            ref={ref}
            type="button"
            className="file-thumb"
            style={{ '--thumb-size': `${size}px` }}
            aria-label={`Preview ${file.fileName}`}
            title={file.fileName}
            onClick={() => onClick(file)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {showImg ? (
                <img
                    className={`file-thumb__img${imgLoaded ? ' file-thumb__img--loaded' : ''}`}
                    src={thumbUrl}
                    alt={file.fileName}
                    onLoad={() => setImgLoaded(true)}
                />
            ) : status === 'loading' ? (
                <span className="file-thumb__placeholder" aria-hidden="true" />
            ) : (
                <span className="file-thumb__fallback">
                    <FileTypeIcon fileName={file.fileName} size={Math.round(size * 0.6)} />
                </span>
            )}
            <span className={`file-thumb__popover${hover ? ' file-thumb__popover--open' : ''}`} role="tooltip">
                {showImg ? (
                    <img className="file-thumb__popover-img" src={thumbUrl} alt={file.fileName} />
                ) : (
                    <span className="file-thumb__popover-icon"><FileTypeIcon fileName={file.fileName} size={48} /></span>
                )}
                <div className="file-thumb__popover-name">{file.fileName}</div>
            </span>
        </button>
    );
}
```

> Note: the popover is always rendered (so the fade transition works) and toggled via the `--open` class; `pointer-events: none` keeps it from trapping the cursor. The image fades in via `--loaded` on `onLoad` (no layout shift — the box is reserved by `--thumb-size`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/FileThumbnail.test.jsx`
Expected: PASS (all 3). (The test triggers intersection via the mocked IntersectionObserver and asserts the `<img>` appears + click fires; the always-rendered popover span does not break `queryByRole('img')` before ready because no img renders until `ready`.)

- [ ] **Step 6: Build + commit**

```bash
cd client && npm run build   # exit 0
git checkout -- client/dist 2>/dev/null || true
git add client/src/components/common/FileThumbnail.jsx client/src/index.css client/src/__tests__/FileThumbnail.test.jsx
git commit -m "feat(files): FileThumbnail component (lazy IO + hover popover, design-system styled)"
```

---

### Task 4: `FileThumbnailStrip` component (+N badge + gallery modal)

**Files:**
- Create: `client/src/components/common/FileThumbnailStrip.jsx`
- Modify: `client/src/index.css` (add the `.file-thumb-strip` / `.file-thumb__more` / `.file-thumb-gallery` block)
- Test: `client/src/__tests__/FileThumbnailStrip.test.jsx`

**Design note:** class-driven styling in `index.css` using tokens (see Global Constraints "Design System"). The `+N` badge must read as an interactive control (hover lighten, focus ring) and align to the 40px thumbnail baseline; the gallery uses the existing `Modal` chrome with a tidy uniform-tile grid.

**Interfaces:**
- Consumes: `FileThumbnail` (Task 3); `Modal` from `./Modal` (gallery).
- Produces: default export `FileThumbnailStrip`, props `{ files: Array<{ id, fileName, mimeType }>, makeCacheKey, makeFetchBlob, onPreview, max = 1 }`. Renders the first `max` files as `FileThumbnail`s; a `+N` badge button when `files.length > max`; clicking `+N` opens a gallery `Modal` of all files; clicking any thumbnail → `onPreview(file)`; empty files → renders nothing.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/FileThumbnailStrip.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Render a simple stand-in for FileThumbnail so we can assert wiring.
vi.mock('../components/common/FileThumbnail', () => ({
  default: ({ file, onClick }) => (
    <button data-testid="thumb" onClick={() => onClick(file)}>{file.fileName}</button>
  ),
}));

import FileThumbnailStrip from '../components/common/FileThumbnailStrip';

const files = [
  { id: 1, fileName: 'a.png', mimeType: 'image/png' },
  { id: 2, fileName: 'b.pdf', mimeType: 'application/pdf' },
  { id: 3, fileName: 'c.jpg', mimeType: 'image/jpeg' },
];
const props = {
  makeCacheKey: (f) => 'k:' + f.id,
  makeFetchBlob: () => () => Promise.resolve({}),
};

describe('FileThumbnailStrip', () => {
  it('renders nothing for empty files', () => {
    const { container } = render(<FileThumbnailStrip files={[]} {...props} onPreview={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('one file → single thumb, no +N badge', () => {
    render(<FileThumbnailStrip files={[files[0]]} {...props} onPreview={vi.fn()} />);
    expect(screen.getAllByTestId('thumb')).toHaveLength(1);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('N>max → first thumb + "+2" badge', () => {
    render(<FileThumbnailStrip files={files} {...props} onPreview={vi.fn()} max={1} />);
    expect(screen.getAllByTestId('thumb')).toHaveLength(1);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('clicking a thumbnail fires onPreview(file)', () => {
    const onPreview = vi.fn();
    render(<FileThumbnailStrip files={[files[0]]} {...props} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('thumb'));
    expect(onPreview).toHaveBeenCalledWith(files[0]);
  });

  it('clicking +N opens the gallery with all files', () => {
    render(<FileThumbnailStrip files={files} {...props} onPreview={vi.fn()} max={1} />);
    fireEvent.click(screen.getByText('+2'));
    // gallery now shows all 3 thumbs
    expect(screen.getAllByTestId('thumb').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/FileThumbnailStrip.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the design-system CSS block to `index.css`**

Append to `client/src/index.css`:

```css
/* Thumbnail strip + overflow badge + gallery */
.file-thumb-strip { display: inline-flex; align-items: center; gap: 6px; }
.file-thumb__more {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}
.file-thumb__more:hover { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.file-thumb__more:focus-visible { outline: none; box-shadow: 0 0 0 2px hsl(var(--ring) / 0.1); }
.file-thumb-gallery { display: flex; flex-wrap: wrap; gap: 12px; }
.file-thumb-gallery__tile { display: flex; flex-direction: column; align-items: center; width: 88px; }
.file-thumb-gallery__name {
    margin-top: 4px;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

> Note: tokens `--accent`, `--accent-foreground`, `--ring`, `--popover`, `--popover-foreground`, `--muted`, `--muted-foreground`, `--border` are all defined in `index.css` `:root` — the class block above is safe to use as written.

- [ ] **Step 4: Implement the component (class-driven)**

```jsx
// client/src/components/common/FileThumbnailStrip.jsx
import { useState } from 'react';
import Modal from './Modal';
import FileThumbnail from './FileThumbnail';

export default function FileThumbnailStrip({ files, makeCacheKey, makeFetchBlob, onPreview, max = 1 }) {
    const [galleryOpen, setGalleryOpen] = useState(false);
    if (!files || files.length === 0) return null;

    const shown = files.slice(0, max);
    const extra = files.length - shown.length;

    const thumb = (file, size) => (
        <FileThumbnail
            key={file.id}
            file={{ fileName: file.fileName, mimeType: file.mimeType }}
            cacheKey={makeCacheKey(file)}
            fetchBlob={makeFetchBlob(file)}
            onClick={() => onPreview(file)}
            size={size}
        />
    );

    return (
        <div className="file-thumb-strip">
            {shown.map((f) => thumb(f, 40))}
            {extra > 0 && (
                <button
                    type="button"
                    className="file-thumb__more"
                    aria-label={`Show ${extra} more file${extra !== 1 ? 's' : ''}`}
                    title={`Show ${extra} more`}
                    onClick={() => setGalleryOpen(true)}
                >
                    +{extra}
                </button>
            )}
            {galleryOpen && (
                <Modal onClose={() => setGalleryOpen(false)}>
                    <h2 className="modal__title" style={{ marginBottom: 12 }}>{files.length} file{files.length !== 1 ? 's' : ''}</h2>
                    <div className="file-thumb-gallery">
                        {files.map((f) => (
                            <div key={f.id} className="file-thumb-gallery__tile">
                                {thumb(f, 72)}
                                <div className="file-thumb-gallery__name" title={f.fileName}>{f.fileName}</div>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/FileThumbnailStrip.test.jsx`
Expected: PASS (all 5).

- [ ] **Step 6: Build + commit**

```bash
cd client && npm run build   # exit 0
git checkout -- client/dist 2>/dev/null || true
git add client/src/components/common/FileThumbnailStrip.jsx client/src/index.css client/src/__tests__/FileThumbnailStrip.test.jsx
git commit -m "feat(files): FileThumbnailStrip with +N overflow gallery (design-system styled)"
```

---

### Task 5: Wire thumbnails into `/files` (FileRow)

**Files:**
- Modify: `client/src/components/files/FileRow.jsx`

**Interfaces:**
- Consumes: `FileThumbnail` (Task 3); existing `api.getToken()`.
- Produces: no exported change; the `file-row__icon` slot renders a `FileThumbnail` (single file) instead of the static `FileTypeIcon`.

- [ ] **Step 1: Replace the static icon with a thumbnail**

In `client/src/components/files/FileRow.jsx`, add imports:
```jsx
import FileThumbnail from '../common/FileThumbnail';
import * as api from '../../api';
```
Replace the `file-row__icon` block:
```jsx
<div className="file-row__icon">
    <FileTypeIcon fileName={file.name} size={28} />
</div>
```
with:
```jsx
<div className="file-row__icon">
    <FileThumbnail
        file={{ fileName: file.name, mimeType: file.mimeType }}
        cacheKey={`file:${file.id}`}
        fetchBlob={() => fetch(`/api/files/${file.id}/download`, { headers: { Authorization: `Bearer ${api.getToken()}` } })}
        onClick={() => onPreview(file)}
        size={28}
    />
</div>
```
Leave the rest of `FileRow` (name, meta, action buttons) unchanged. `FileTypeIcon` import stays (still used as the fallback inside `FileThumbnail`).

- [ ] **Step 2: Build**

Run: `cd client && npm run build`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Hard-refresh `localhost:4000/files` (after `git checkout -- client/dist` is NOT needed pre-manual; only before committing). Upload an image and a PDF; the row icon shows a real thumbnail; hovering shows the larger popover; clicking opens PreviewModal. A `.docx`/`.xlsx` shows the typed icon.

- [ ] **Step 4: Commit**

```bash
git checkout -- client/dist 2>/dev/null || true
git add client/src/components/files/FileRow.jsx
git commit -m "feat(files): show inline thumbnail in File Manager rows"
```

---

### Task 6: Wire thumbnails into cert history (CertificationsTab)

**Files:**
- Modify: `client/src/pages/EmployeeDetailPage.jsx` (`CertificationsTab` — the active-record History block ~lines 1097-1113 and the pending block ~lines 1135-1149)

**Interfaces:**
- Consumes: `FileThumbnailStrip` (Task 4); existing `api.downloadCertificationUpload`; existing `setPreviewUpload` state + `PreviewModal` render.
- Produces: no exported change; each upload list renders a `FileThumbnailStrip` whose thumbnails open the existing `previewUpload` modal.

- [ ] **Step 1: Add the import**

At the top of `EmployeeDetailPage.jsx`:
```jsx
import FileThumbnailStrip from '../components/common/FileThumbnailStrip';
```

- [ ] **Step 2: Render a strip in the History block**

In `renderCertCard`, in the active-record History block, ABOVE the existing `history.map(upload => ...)` list (keep the existing rows with their timestamp/effective/uploader/download — the strip is an additional visual affording thumbnails + preview), add:
```jsx
<FileThumbnailStrip
    files={history.map(u => ({ id: u.id, fileName: u.fileName, mimeType: u.fileType }))}
    makeCacheKey={(f) => `cert-upload:${f.id}`}
    makeFetchBlob={(f) => () => api.downloadCertificationUpload(f.id)}
    onPreview={(f) => setPreviewUpload(f)}
    max={1}
/>
```
Do the same in the pending block for `(rec.uploads || [])`:
```jsx
<FileThumbnailStrip
    files={(rec.uploads || []).map(u => ({ id: u.id, fileName: u.fileName, mimeType: u.fileType }))}
    makeCacheKey={(f) => `cert-upload:${f.id}`}
    makeFetchBlob={(f) => () => api.downloadCertificationUpload(f.id)}
    onPreview={(f) => setPreviewUpload(f)}
    max={1}
/>
```

> Note: `setPreviewUpload(f)` receives `{ id, fileName, mimeType }`; the existing `PreviewModal` render uses `previewUpload.fileName` and `previewUpload.id` (`api.downloadCertificationUpload(previewUpload.id)`) — both present on `f`, so it works unchanged. Confirm by reading the existing `previewUpload` render block.

- [ ] **Step 3: Build**

Run: `cd client && npm run build`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

Hard-refresh an employee's Certifications tab → expand a cert with history: a thumbnail (or typed icon) shows for the first file, `+N` for the rest; clicking a thumb or a gallery item opens PreviewModal; hover shows the popover.

- [ ] **Step 5: Commit**

```bash
git checkout -- client/dist 2>/dev/null || true
git add client/src/pages/EmployeeDetailPage.jsx
git commit -m "feat(certs): inline file thumbnails in certification history"
```

---

### Task 7: Regression + build verification

**Files:** none (verification only).

- [ ] **Step 1: Client tests**

Run: `cd client && npm test`
Expected: PASS, including the four new suites (`pdfThumbnail`, `useFileThumbnail`, `FileThumbnail`, `FileThumbnailStrip`).

- [ ] **Step 2: Client build**

Run: `cd client && npm run build`
Expected: exit 0. Confirm a pdfjs chunk is emitted lazily (a separate `pdf.worker` / pdfjs chunk in the build output).

- [ ] **Step 3: Restore dist + final manual smoke**

Run: `git checkout -- client/dist 2>/dev/null || true`
Hard-refresh `localhost:4000`. Verify end-to-end on both surfaces: `/files` row thumbnails (image real, PDF real, docx icon), hover popover, click→PreviewModal; cert history strip + `+N` gallery.

- [ ] **Step 4: Design/UX craft review (senior-designer checklist)**

Verify in the running app, at real data density, that the UX-craft requirements from the Global Constraints "Design System" section hold:
- No layout shift as thumbnails resolve (rows don't jump); image fades in, no flicker.
- Hover popover fades/scales in smoothly (0.15s), stays within view, never traps the cursor, shows the icon+name for non-previewable files (no empty box).
- `+N` badge reads as a control (hover lighten, pointer, keyboard focus ring) and sits on the row baseline.
- Gallery is a tidy uniform grid using `Modal` chrome; filenames ellipsize on one line (no text walls).
- Colors/radii/shadows visibly match the rest of the app (no off-palette or hardcoded values); dark/light consistency with neighboring rows.
- Keyboard: Tab reaches thumbnails and the badge; Enter/Space open preview/gallery; focus ring visible.
Fix any visual issue found before completing (styling stays in `index.css` classes, not inline).

- [ ] **Step 4: Commit any fixups**

```bash
git checkout -- client/dist 2>/dev/null || true
git commit -am "chore: fixups for inline file thumbnails" || echo "nothing to commit"
```
