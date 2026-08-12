# Inline File Thumbnails + Hover Preview (Monday.com-style)

**Date:** 2026-08-10
**Status:** Approved (design)
**Area:** Client-only — employee Certifications tab (`EmployeeDetailPage.jsx`), File Manager (`FilesPage.jsx`), new shared components + hook.

## Summary

Replace the plain filename/paperclip and generic file-icon rendering with **inline file thumbnails** (Monday.com-style): a small real thumbnail per file, a `+N` overflow badge when a cell has more than one file, a larger-preview popover on hover, and the existing `PreviewModal` on click. Image thumbnails render via `<img>` (browser downscale); PDF thumbnails render page 1 client-side via `pdfjs-dist`. Lazy-loaded (visible-only) and cached per session. No server changes, no new endpoints — reuse the existing download routes.

Build-vs-adopt reasoning is recorded in `DECISIONS.md` (2026-08-10 entry): raw `pdfjs-dist` (client-side, zero deps, no native binaries) over `react-pdf` (full viewer), server-side `pdf2pic` (native binaries), and `sharp` (unneeded server pipeline).

## Current State (verified)

- Cert history rows in `CertificationsTab` (inside `EmployeeDetailPage.jsx`) currently render, per upload, a `paperclip` icon + a filename button that calls `handleDownloadUpload(upload)` + a `(NN KB)` size, plus (from the prior feature) a timestamp, an "Effective … · Expires …" line, an "Uploaded by …" line, and an eye/Preview button opening `PreviewModal`. There are two upload-row map blocks (active-record History, pending-record). The expired block has no uploads loop.
- `FilesPage.jsx` renders a file grid; each file has `{ id, name, mimeType }`. A child grid receives `onPreview={handlePreview}`; `handlePreview` opens `PreviewModal` (wired in the prior feature). Folders render `Icons.folder`.
- `PreviewModal` (`client/src/components/common/PreviewModal.jsx`) takes `{ open, fileName, fetchBlob: () => Promise<Response>, onClose }`. `fetchBlob` returns a fetch `Response`.
- Download seams: `api.downloadCertificationUpload(id)` returns a `Response`; `/files` uses an authorized `fetch('/api/files/${id}/download', { headers: { Authorization: 'Bearer ' + api.getToken() } })`.
- Client tests: vitest + @testing-library/react (`vi.fn()`), files in `client/src/__tests__/*.test.jsx`.
- `pdfjs-dist` latest is 6.2.108 (zero dependencies, no native binaries). Not yet a dependency.

## Dependency

Add `pdfjs-dist` (^6.2.108) to `client/package.json` (client only). Worker configured once via Vite's `?url` import:

```js
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;
```

pdfjs is loaded via dynamic `import()` inside the hook so it forms its own lazy chunk — the app doesn't pay for it unless a PDF thumbnail is actually rendered.

## Components

### 1. `useFileThumbnail` hook — `client/src/hooks/useFileThumbnail.js`

**Signature:** `useFileThumbnail(cacheKey, fetchBlob, mimeType, { enabled, maxPdfBytes }) → { status, thumbUrl }`
- `cacheKey: string` — stable, e.g. `cert-upload:{id}` or `file:{id}`.
- `fetchBlob: () => Promise<Response>`.
- `mimeType: string` — may be empty; fall back to filename extension where needed.
- `enabled: boolean` — when false the hook does nothing (used for lazy gating by `FileThumbnail`).
- `maxPdfBytes: number` — default `10 * 1024 * 1024`.
- Returns `status: 'idle' | 'loading' | 'ready' | 'icon'` and `thumbUrl: string | null`. `'icon'` means "render the typed file icon" (unknown type, oversized PDF, or render failure).

**Behavior:**
- Cache first: a module-level `Map<cacheKey, { status, thumbUrl }>`. On hit, return it without calling `fetchBlob`.
- On miss (and `enabled`): set `loading`; `await fetchBlob()`; read the blob.
  - Image mime (`image/png|jpeg|jpg|gif|webp|svg+xml`) → `URL.createObjectURL(blob)` → `ready`.
  - PDF mime (`application/pdf`) and blob size ≤ `maxPdfBytes` → dynamic-import pdfjs, render page 1 to an offscreen canvas at a small scale, `canvas.toDataURL('image/png')` → `ready`. Call `pdf.destroy()` after.
  - Otherwise (unknown, oversized PDF) → `icon`.
- Any thrown error → `icon` (never leaves `loading` stuck).
- Store the resulting `{ status, thumbUrl }` in the cache.
- **Cache bound:** soft cap 200 entries, LRU eviction; on eviction, if the evicted `thumbUrl` is an object URL (image), `URL.revokeObjectURL` it. Data URLs (PDF) need no revoke.
- The hook does not revoke on unmount (the value lives in the shared cache); revocation happens only on eviction.

### 2. `FileThumbnail` component — `client/src/components/common/FileThumbnail.jsx`

**Props:** `{ file: { fileName, mimeType }, cacheKey, fetchBlob, onClick, size }`.
- Wraps an `IntersectionObserver` on its root element; sets an internal `visible` flag true when it enters the viewport (once true, stays true).
- Calls `useFileThumbnail(cacheKey, fetchBlob, mimeType, { enabled: visible })`.
- Render:
  - `status === 'ready'` → `<img src={thumbUrl} alt={fileName}>` sized to `size` (default ~40px), `object-fit: cover`.
  - `status === 'loading'` → a subtle placeholder/spinner box.
  - `status === 'icon' | 'idle'` (idle = not yet visible) → a typed file icon (PDF → a doc icon like the screenshot; image → image icon; else generic file icon). Choose from existing `Icons` (e.g. `Icons.fileText`, `Icons.file`); pick the closest available names (read `Icons.jsx`).
- On hover → show a **larger preview popover** (absolutely-positioned card) containing the same thumbnail at ~240px (or "Rendering…" / the icon if not renderable) plus the filename. Popover is CSS/state-driven, no new lib.
- On click → call `onClick(file)` (the consumer opens `PreviewModal`).
- Keyboard: the thumbnail is a `<button>` so it is focusable and Enter/Space fire `onClick`.

### 3. `FileThumbnailStrip` component — `client/src/components/common/FileThumbnailStrip.jsx`

**Props:** `{ files: Array<{ id, fileName, mimeType }>, makeCacheKey, makeFetchBlob, onPreview, max }`.
- `makeCacheKey(file) → string`, `makeFetchBlob(file) → (() => Promise<Response>)` — the surface-specific seams.
- `max` default `1` (show the first thumbnail, then `+N`).
- Renders the first `max` files as `FileThumbnail`s; if `files.length > max`, renders a `+{files.length - max}` badge button.
- Clicking a thumbnail → `onPreview(file)`.
- Clicking the `+N` badge → opens a **gallery modal** (reuse `common/Modal`) listing ALL files as `FileThumbnail`s in a wrapping grid; clicking any → `onPreview(file)` (and close gallery).
- Empty `files` → renders nothing.

## Surface Wiring

### Cert history (`CertificationsTab` in `EmployeeDetailPage.jsx`)

In the active-record History block and the pending-record block, render a `FileThumbnailStrip` for that record's `uploads` (each upload has `id`, `fileName`, `fileType`). Wire:
- `makeCacheKey = (u) => 'cert-upload:' + u.id`
- `makeFetchBlob = (u) => () => api.downloadCertificationUpload(u.id)`
- `onPreview = (u) => setPreviewUpload(u)` (reuse the existing `previewUpload` state + `PreviewModal` render).
- Keep the existing per-row metadata (timestamp, effective/expiry, uploader) and the Download affordance; the strip replaces the paperclip+filename visual as the file's primary representation. Map `fileType` → the strip's `mimeType`.

The expired-records block has no uploads loop (unchanged).

### File Manager (`FilesPage.jsx`)

In each file tile, replace the generic file icon with a single `FileThumbnail` (one file per tile, so `+N` is not used here — use `FileThumbnail` directly, not the strip). Wire:
- `cacheKey = 'file:' + file.id`
- `fetchBlob = () => fetch('/api/files/' + file.id + '/download', { headers: { Authorization: 'Bearer ' + api.getToken() } })`
- `onClick = () => handlePreview(file)` (opens the existing `PreviewModal`).
- Folders keep `Icons.folder` (not thumbnailed).

## Error Handling

Every failure path resolves to a typed file icon — never a stuck spinner or broken `<img>`:
- `fetchBlob` rejects / non-ok Response → `icon`.
- pdfjs parse/render throw → `icon` (+ `pdf.destroy()` best-effort).
- Oversized PDF (> `maxPdfBytes`): after `fetchBlob()` resolves, check `blob.size`; if it exceeds `maxPdfBytes`, skip pdfjs rendering entirely and resolve to `icon`. (We do not attempt to pre-check size before fetching — the download is needed anyway; the cap only prevents the expensive parse/render of a huge PDF.)
- Unknown/unpreviewable mime → `icon`.
- Hover popover on an `icon` file shows the icon + filename (no enlargement).
- The gallery modal and `PreviewModal` retain their own loading/error states.

## Testing (vitest + @testing-library/react)

- **`useFileThumbnail`** (`client/src/__tests__/useFileThumbnail.test.jsx`): image blob → `ready` + an object URL; unknown mime → `icon`; a second call with the same `cacheKey` returns cached value WITHOUT calling `fetchBlob` again; oversized PDF (blob.size > maxPdfBytes) → `icon`; `fetchBlob` rejection → `icon`. Mock `URL.createObjectURL`/`revokeObjectURL`; mock the dynamic pdfjs import (assert it's invoked for a PDF under the cap, and that a thrown render → `icon`).
- **`FileThumbnail`** (`client/src/__tests__/FileThumbnail.test.jsx`): before intersection (enabled false) renders the typed-icon placeholder and does NOT call `fetchBlob`; once visible + resolved renders `<img>`; clicking fires `onClick(file)`. (Mock `IntersectionObserver` to drive visibility.)
- **`FileThumbnailStrip`** (`client/src/__tests__/FileThumbnailStrip.test.jsx`): one file → single thumbnail, no badge; `files.length > max` → a `+N` badge with the correct count; clicking `+N` opens the gallery (all files rendered); clicking a thumbnail fires `onPreview(file)`.
- No server tests (client-only feature).

## Files Touched

- `client/package.json` (+ `pdfjs-dist`)
- `client/src/hooks/useFileThumbnail.js` (new)
- `client/src/components/common/FileThumbnail.jsx` (new)
- `client/src/components/common/FileThumbnailStrip.jsx` (new)
- `client/src/pages/EmployeeDetailPage.jsx` (`CertificationsTab`: strip in the two upload blocks)
- `client/src/pages/FilesPage.jsx` (file tiles use `FileThumbnail`)
- Tests: the three `__tests__/*.test.jsx` above.
- `DECISIONS.md` (already updated).

## Out of Scope

- Server-side thumbnail generation / caching (client renders on demand).
- Full multi-page PDF viewing (that's `PreviewModal`'s iframe; the thumbnail is page 1 only).
- Thumbnails for folders, or for non-image/non-PDF types beyond a typed icon.
- Persisting thumbnails across sessions (cache is in-memory, session-scoped).
- Video/audio thumbnails.
