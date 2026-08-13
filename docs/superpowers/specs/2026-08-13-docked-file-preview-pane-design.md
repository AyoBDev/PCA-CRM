# Docked File Preview Pane — Reusable Split-View Document Preview

**Date:** 2026-08-13
**Status:** Draft (design)
**Area:** Shared file components (`common/`), employee certifications (`EmployeeDetailPage`), File Manager (`FilesPage`), client Programs/auth tab (`ProgramsAuthTab` / `ClientDetailPage`)

## Summary

Add a **reusable docked split-view file preview** that renders a document inline on the page — a file list on one side, the selected document rendered in a panel on the other — as an alternative to the full-screen `PreviewModal`. It is a single presentational component (`FilePreviewPane`) driven by a **normalized item list**, reused on three surfaces:

1. **Employee Certifications tab** (`EmployeeDetailPage`)
2. **File Manager** (`/files`, `FilesPage`)
3. **Client Programs/Authorizations tab** attachments (`ProgramsAuthTab`) — currently download-only links, upgraded to the full file-row + preview experience.

The existing full-screen `PreviewModal` is **kept** and reachable from the docked pane via an **Expand** control. On narrow screens the docked split does not render; tapping a file opens the full-screen modal instead.

To avoid two divergent PDF renderers, the pdf.js/image rendering engine currently inside `PreviewModal` is **extracted into a shared `DocViewer`** component that both `PreviewModal` (full-screen chrome) and `FilePreviewPane` (docked chrome) render.

This extends the "File Preview & Thumbnails — Reusable Components" system already documented in `CLAUDE.md`.

## Current State (verified)

- `common/PreviewModal.jsx` owns the only in-app viewer: it fetches via a `fetchBlob: () => Promise<Response>`, renders **PDF via pdf.js multi-page canvas** and images via `<img>`, with a toolbar (zoom −/reset/+, fit, page nav, rotate, download, print, optional delete), portalled to `<body>`. All render state (`status/blobUrl/pdf/numPages/page/zoom/rotation/fit`) lives inline in the component.
- `files/CertFileRow.jsx` is the app's reusable file row (thumbnail · name · meta · preview/download; optional `fetchBlob`/`cacheKey`/`badge`/`expiresText`). Backed by `FileThumbnail` + `useFileThumbnail` + `lib/pdfThumbnail.js`.
- `lib/pdfThumbnail.js` exposes `getPdfjs()`, `loadPdfDocument(arrayBuffer)`, `renderPdfFirstPage(...)` — shared pdf.js worker setup.
- **Employee Certs tab** (`EmployeeDetailPage.jsx`): renders current file + `uploads[]` history using `CertFileRow`; preview opens `PreviewModal` via `previewUpload` (honors a per-item `fetchBlob`). Download endpoints: `api.downloadEmployeeCertification(id)` (active) and `api.downloadCertificationUpload(id)` (history) — both return a `Response`.
- **`/files`** (`FilesPage.jsx` → `files/FileList.jsx` → `files/FileRow.jsx`): full-width list; preview opens `PreviewModal` via `previewFile`. Download is a raw authorized `fetch` to `/api/files/:id/download` (returns a `Response`).
- **Client Programs/auth tab** (`ProgramsAuthTab.jsx`): each authorization has a collapsible `cp-auth-attachments` list of **download-only** links (`handleDownloadAuthDoc` in `ClientDetailPage.jsx`). No thumbnails, no preview. **`api.downloadAuthDocument(id)` returns a raw `blob`, NOT a `Response`** — this differs from the other two endpoints (see Data Contract note).

## Component 1 — `DocViewer` (extracted rendering engine)

New file: `common/DocViewer.jsx`. Extract the fetch + pdf.js/image render logic out of `PreviewModal` into a **frame-agnostic** component that renders the document body and (optionally) the control toolbar, but no surrounding chrome (no backdrop, no portal, no header).

### Interface

```jsx
<DocViewer
  fileName={item.fileName}
  fetchBlob={item.fetchBlob}        // () => Promise<Response>
  maxBytes={25 * 1024 * 1024}
  showToolbar                        // render the built-in toolbar (default true)
  extraToolbarActions={[…]}          // optional buttons injected into the toolbar (e.g. Expand, Delete)
  onDownload={fn} onPrint={fn}       // optional overrides; defaults use the fetched blob
/>
```

- Owns: `status/blobUrl/pdf/numPages/page/zoom/rotation/fit`, the load effect (object-URL lifecycle + revoke), the page-render effect, keyboard page nav, download/print.
- Renders: loading / error / canvas (PDF) / `<img>` (image) / download fallback (unpreviewable/oversized) — exactly today's behavior.
- The toolbar is the same control set; `extraToolbarActions` lets a frame add buttons (Modal adds Delete; Pane adds Expand).

### `PreviewModal` after extraction

`PreviewModal` keeps its full-screen portal + header + close, and renders `<DocViewer showToolbar extraToolbarActions={onDelete ? [deleteBtn] : []} />` for the body. **Its public props and behavior are unchanged**, so existing usages and tests keep working.

## Component 2 — `FilePreviewPane` (docked split view)

New file: `common/FilePreviewPane.jsx`. Presentational, knows nothing about certs/files/auths.

### Interface

```jsx
<FilePreviewPane
  items={[{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }]}
  selectedId={selectedId}
  onSelect={(id) => …}
  open={split}                       // false = list only; true = list + docked panel
  onToggle={() => …}                 // header "Preview" toggle
  onExpand={(item) => …}             // opens the full-screen PreviewModal for the item
  onDownload={(item) => …}           // optional; falls back to item.fetchBlob download
  emptyText="No files"
  title?                             // optional pane header title
/>
```

### Layout & behavior

- **Header**: title + a **Preview** toggle (list-only ↔ split). Matches the app toolbar look.
- **List column** (left): one `CertFileRow` per item; the row whose `id === selectedId` gets an `is-selected` highlight. Clicking a row calls `onSelect(id)`. Each row keeps its own Preview (→ `onExpand`) and Download actions.
- **Preview panel** (right, only when `open`): renders `<DocViewer>` for the selected item, plus an **Expand** action (calls `onExpand`) that pops the full-screen `PreviewModal`. Empty state when no selection.
- **Responsive**: below `~900px` the split does not render — the component shows the list only, and row clicks call `onExpand` (full-screen modal) instead of docking. Implemented with a `matchMedia`/resize check (a small `useIsWide()` hook) so behavior is deterministic, not just CSS.
- New scoped CSS `.file-preview-pane*` using design tokens; reuses `.file-row`/`.cert-history__list` for the list side.

## Component 3 — Per-page wiring

Each page maps its own data to the normalized item shape and owns selection + the `PreviewModal` mount (for Expand / narrow-screen).

### 3a — Employee Certifications tab (`EmployeeDetailPage.jsx`)

- Build `items` from the current file (`{ id: 'cert:'+rec.id, fileName, fileType, fetchBlob: () => api.downloadEmployeeCertification(rec.id), badge: <status> }`) + each history upload (`fetchBlob: () => api.downloadCertificationUpload(u.id)`, `meta` = uploaded time + renewal).
- Replace the current `CertFileRow` lists inside the expanded cert card with `<FilePreviewPane>` (default `open=false`, so it starts as today's list; toggling Preview docks the panel). `onExpand` reuses the existing `previewUpload` → `PreviewModal` mount.

### 3b — File Manager (`FilesPage.jsx`)

- Map the folder's `files` to items (`fetchBlob: () => fetch('/api/files/'+f.id+'/download', authHeader)`). Render `<FilePreviewPane>` in the right panel (`files-page__right`) as the single code path: `open=false` shows the list exactly as today, `open=true` docks the preview alongside it. (This replaces the direct `<FileList>` render on this surface.) `onExpand` reuses `previewFile` → `PreviewModal`. `onDelete` per row keeps the existing confirm flow. Checkbox multi-select must be preserved in the paned list — see Open Question 1.

### 3c — Client Programs/auth tab (`ProgramsAuthTab.jsx`) — full treatment

- Replace the `cp-auth-attachments` download-only link list with items mapped from each auth's `documents[]` (`fetchBlob` wraps `api.downloadAuthDocument(id)`; see Data Contract note) rendered through `<FilePreviewPane>` (or, per auth, a `CertFileRow` list that toggles into the pane). Upload + delete affordances already on that tab are preserved. `onExpand` mounts a `PreviewModal` on the client detail page.

## Data Contract note — `downloadAuthDocument` returns a blob, not a Response

`DocViewer`/`PreviewModal`/`FileThumbnail` all expect `fetchBlob: () => Promise<Response>` (they read `Content-Type`/`Content-Length` and call `.blob()`). `api.downloadAuthDocument(id)` currently returns a **blob** directly. Resolution (pick during implementation, prefer the first):

- **Preferred:** change `api.downloadAuthDocument` to return the raw `Response` (like `downloadCertificationUpload`), and update its one existing caller (`handleDownloadAuthDoc`) to `.blob()` off the response. Keeps the whole system on one contract.
- Fallback: wrap at the call site into a synthetic `Response` (`new Response(blob)`), losing the real `Content-Length` (large-file guard degrades to type-only). Avoid unless changing the api helper is risky.

## Reuse & consistency

- `FilePreviewPane` and `DocViewer` join the documented reusable set; **update `CLAUDE.md`** ("File Preview & Thumbnails") to add both, note the docked-vs-modal distinction, and the "single rendering engine (`DocViewer`)" rule.
- The normalized item shape `{ id, fileName, fileType, fetchBlob, cacheKey?, meta?, badge? }` is the contract every consumer maps to — pages own mapping, the pane stays dumb.
- pdf.js still only via `lib/pdfThumbnail.js` (shared worker; code-split `pdf-*.js` chunk).

## Testing

- **`DocViewer`** (vitest, mock `loadPdfDocument`): renders canvas for a PDF item, `<img>` for an image, download fallback for unpreviewable + oversized; toolbar actions fire; `extraToolbarActions` render.
- **`FilePreviewPane`** (vitest): renders a row per item; `is-selected` tracks `selectedId`; toggle shows/hides the panel; selecting shows the item in the panel; Expand fires `onExpand`; narrow-screen (mock `matchMedia`) renders list-only and row click calls `onExpand`.
- **`PreviewModal`**: existing tests unchanged and still green (now renders `DocViewer` internally) — this is the regression guard for the extraction.
- Manual: all three pages — toggle Preview, select files, Expand to modal, download; narrow-window falls back to modal.

## Out of Scope

- No new backend endpoints (beyond the optional `downloadAuthDocument` return-type change).
- No `.docx`/`.xlsx` inline rendering (download fallback only, unchanged).
- No change to archive/soft-delete, cert history data model, or the active/inactive toggle.
- No multi-file compare / side-by-side of two documents.

## Open Questions

1. **`/files` checkbox multi-select** in the paned list: keep checkboxes on the pane's rows (needs `CertFileRow` to optionally render a checkbox, or use `FileRow` on that surface) vs. only offer the pane when not in select mode. Lean: allow a `leading` slot on the row for the checkbox so `/files` keeps multi-select in split view.
2. Whether the Programs/auth tab docks per-authorization or has one shared pane for the whole tab. Lean: one pane per expanded authorization card (attachments are scoped to an auth).

## Files Touched

- `client/src/components/common/DocViewer.jsx` (new — extracted engine)
- `client/src/components/common/PreviewModal.jsx` (refactor to render `DocViewer`)
- `client/src/components/common/FilePreviewPane.jsx` (new)
- `client/src/hooks/useIsWide.js` (new — responsive breakpoint hook) or inline
- `client/src/components/files/CertFileRow.jsx` (optional `is-selected`, optional leading slot)
- `client/src/pages/EmployeeDetailPage.jsx` (cert tab wiring)
- `client/src/pages/FilesPage.jsx` (files wiring)
- `client/src/pages/client-tabs/ProgramsAuthTab.jsx` + `client/src/pages/ClientDetailPage.jsx` (auth attachments wiring)
- `client/src/api.js` (optional `downloadAuthDocument` → Response)
- `client/src/index.css` (`.file-preview-pane*`, row `is-selected`)
- `CLAUDE.md` (document `FilePreviewPane` + `DocViewer`)
- Tests: `client/src/__tests__/DocViewer.test.jsx`, `FilePreviewPane.test.jsx`; keep `PreviewModal.test.jsx` green.
```
