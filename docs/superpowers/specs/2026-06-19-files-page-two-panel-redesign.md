# Files Page Two-Panel Redesign

**Date:** 2026-06-19
**Status:** Design approved

## Problem

The current FilesPage uses a card-based grid layout with hover-revealed actions. This makes it hard to see folder hierarchy at a glance and requires hovering to discover file actions. The goal is a two-panel layout matching a professional file manager: folder tree on the left, file list on the right with always-visible actions.

## Solution

Replace the card grid with a split-panel layout:
- **Left panel (300px)**: Expandable folder tree with file count badges
- **Right panel (flex)**: Selected folder's files in a list format with drag-and-drop upload, colored file type icons, metadata, and always-visible action buttons

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ GlobalToolbar: "Administrative Files" + breadcrumb path          │
├─────────────────────────────────────────────────────────────────┤
│ ContextBar: [Search] [Select All]              [+ Upload File]  │
├────────────────────────┬────────────────────────────────────────┤
│  FOLDERS               │  SELECTED FOLDER NAME   [Filter] [Sort]│
│                        │                                        │
│  ▸ 2025          (12) │  ┌──────────────────────────────────┐  │
│  ▾ 2026          (24) │  │  ☁ Drag & drop or click to upload│  │
│    ▸ 01 January   (4) │  └──────────────────────────────────┘  │
│    ▸ 02 February  (4) │                                        │
│    ● 03 March     (4) │  [☐] [xlsx] File.xlsx  XLSX·42KB·01/01 [👁][⬇][✎][🗑] │
│    ▸ 04 April     (3) │  [☐] [pdf]  Report.pdf PDF·128KB·01/02 [👁][⬇][✏][✎][🗑]│
│  ▸ Templates      (5) │  [☐] [img]  Photo.jpg  JPG·2MB·01/03  [👁][⬇][✎][🗑] │
│                        │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

## Left Panel — Folder Tree

**Width:** 300px fixed, independent scroll, border-right separator.

**Tree behavior:**
- Root level shows top-level folders
- Click arrow (▸/▾) to expand/collapse children
- Click folder name to select it → right panel shows its contents
- Active/selected folder gets highlighted background
- Each folder shows a count badge (number of files inside, not recursive)

**Data loading:**
- On mount, fetch root folders via `GET /api/files/folders` (existing endpoint)
- On expand, fetch children via `GET /api/files/folders/:id` (existing endpoint, returns `children` array)
- Cache expanded folders in state to avoid re-fetching

**Visual style:**
- Folder icon + name + count badge
- Indentation: 20px per depth level
- Active folder: primary color background tint
- Count badge: small rounded pill, muted background

## Right Panel — File List

**Width:** Flex, fills remaining space. Independent scroll.

**Header row:**
- Selected folder name (large, bold)
- Filter button (by file type)
- Sort button (name, date, size)

**Upload zone:**
- Dashed border box with cloud icon
- Text: "Drag & drop or **click to upload**"
- Click opens native file picker
- Drop zone accepts files via `onDragOver`/`onDrop`
- Only shown when a folder is selected (not at root)

**File rows (always visible, no hover required for actions):**

```
[checkbox] [type-icon] filename.ext    TYPE · SIZE · Uploaded DATE    [preview][download][editPdf?][rename][delete]
```

| Element | Behavior |
|---------|----------|
| Checkbox | Always visible, subtle. Enables bulk operations |
| Type icon | Colored by file type (see color table below) |
| Filename | Truncated with ellipsis, max ~40% width |
| Metadata | File type label, formatted size, upload date — muted text |
| Actions | Always visible. Icon buttons: preview (eye), download (arrow), edit PDF (pen-square, PDFs only), rename (edit pencil), delete (trash) |

**Row hover:** Subtle background highlight (`hsl(var(--primary) / 0.04)`) for visual feedback only — not needed for action discovery.

**Bulk actions:** When items are selected, ContextBar shows count + bulk delete/download buttons (existing behavior preserved).

## File Type Icons & Colors

| File Type | Extensions | Color | Label |
|-----------|-----------|-------|-------|
| PDF | .pdf | `hsl(0 55% 42%)` | PDF |
| Spreadsheet | .xlsx, .xls, .csv | `hsl(140 60% 35%)` | XLSX/XLS/CSV |
| Document | .doc, .docx | `hsl(215 70% 50%)` | DOC/DOCX |
| Image | .jpg, .jpeg, .png, .gif, .webp | `hsl(270 50% 50%)` | JPG/PNG/etc |
| Other | anything else | `hsl(var(--muted-foreground))` | extension uppercased |

Icons are simple SVG shapes:
- PDF/Document: page with folded corner
- Spreadsheet: grid/table icon
- Image: landscape/photo icon
- Other: generic file icon

## Existing Features Preserved

All existing functionality carries over with new visual treatment:

| Feature | How it works in new layout |
|---------|---------------------------|
| Create folder | Button in left panel header or context menu |
| Rename folder | Right-click or edit icon on folder in tree |
| Delete folder | Context menu or button on selected folder |
| Upload file | Drag-drop zone + "Upload File" button in ContextBar |
| Rename file | Always-visible rename (pencil) icon on each row |
| Delete file | Always-visible trash icon on each row |
| Download file | Always-visible download icon on each row |
| Preview file | Always-visible eye icon (opens in new tab for PDFs, downloads others) |
| Edit PDF | Always-visible pen-square icon (PDFs only), navigates to PDF editor |
| Bulk select | Checkboxes always visible, select-all in ContextBar |
| Bulk delete/download | ContextBar shows bulk actions when items selected |
| File conflict resolution | Same modal dialog when uploading duplicate names |
| Search | Search input in ContextBar filters across current view |
| Folder navigation via URL | `?folder=X` query param preserved for PDF editor return |

## Component Structure

| File | Responsibility |
|------|---------------|
| `client/src/pages/FilesPage.jsx` | Rewrite — two-panel layout, state management |
| `client/src/components/files/FolderTree.jsx` | New — left panel folder tree with expand/collapse |
| `client/src/components/files/FolderTreeItem.jsx` | New — single folder row in tree (recursive) |
| `client/src/components/files/FileList.jsx` | New — right panel file list with upload zone |
| `client/src/components/files/FileRow.jsx` | New — single file row with actions |
| `client/src/components/files/UploadZone.jsx` | New — drag-and-drop upload area |
| `client/src/components/files/fileTypeUtils.js` | New — file type → color/icon/label mapping |
| `client/src/index.css` | Replace `.files-page__*` styles with new two-panel layout |

## CSS Design Tokens

```css
/* Panel layout */
--files-panel-left-width: 300px;
--files-tree-indent: 20px;

/* File type colors */
--file-color-pdf: hsl(0 55% 42%);
--file-color-spreadsheet: hsl(140 60% 35%);
--file-color-document: hsl(215 70% 50%);
--file-color-image: hsl(270 50% 50%);
--file-color-other: hsl(var(--muted-foreground));
```

## No API Changes

All data comes from existing endpoints:
- `GET /api/files/folders` — root folder listing
- `GET /api/files/folders/:id` — folder contents (children + files)
- `POST /api/files/upload` — file upload
- `PUT /api/files/:id` — replace file (PDF editor save)
- `PATCH /api/files/:id` — rename/move file
- `DELETE /api/files/:id` — delete file
- `GET /api/files/:id/download` — download/preview

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No folder selected | Right panel shows "Select a folder" placeholder |
| Empty folder | Right panel shows upload zone + "No files yet" message |
| Deep nesting | Tree indents with scroll, no max depth |
| Many files | Right panel scrolls independently |
| Root has files | Show them when no folder is selected (root-level files) |
| Folder tree loading | Show skeleton/spinner in left panel |
| Resize | Left panel fixed width, right panel responsive |
