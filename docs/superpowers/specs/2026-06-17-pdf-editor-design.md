# In-App PDF Editor

**Date:** 2026-06-17
**Status:** Design approved

## Problem

Admins need to edit PDFs (authorization documents, care plans, forms) directly in the app — updating dates, adding notes, signing, highlighting — without downloading, editing externally, and re-uploading.

## Solution

A client-side PDF editor built with **pdfjs-dist** (rendering) and **pdf-lib** (modification). Opens as a full-screen page from FilesPage. Supports adding text, freehand drawing/signatures, and highlights/strikethrough. Saves back to the same file or as a new version.

## Architecture

```
FilesPage → "Edit" button on PDF → /files/edit/:fileId (PdfEditorPage)

PdfEditorPage
├── Toolbar (tools + actions)
├── Page Canvas (pdfjs-dist renders pages to <canvas>)
└── Annotation Overlay (SVG layer per page, captures user edits)

Save flow:
  annotations[] → pdf-lib embeds into PDF binary → PUT /api/files/:id (overwrite)
                                                  or POST /api/files/upload (new version)
```

## Libraries

| Library | Purpose | License |
|---------|---------|---------|
| `pdfjs-dist` | Render PDF pages to canvas | Apache 2.0 |
| `pdf-lib` | Modify PDF binary (embed text, drawings, shapes) | MIT |

Both are client-side only. No new server dependencies.

## Components

### PdfEditorPage (`client/src/pages/PdfEditorPage.jsx`)

Full-screen editor with three zones:

**Top toolbar:**
- Left: Tool buttons — Select/Move, Text, Draw, Highlight, Eraser
- Center: Undo/Redo, Zoom in/out, Page navigation (prev/next + page indicator)
- Right: Save dropdown (Save | Save as new version), Close button

**Center canvas area:**
- Vertically scrollable, pages stacked
- Each page: `<canvas>` (PDF.js render) + `<svg>` overlay (annotations)
- Lazy rendering: only visible pages + 1 buffer above/below

**Contextual options popover:**
- Appears when a tool is active
- Text: font size (12/16/20/24), color picker
- Draw: stroke width (1/2/4/8px), color picker
- Highlight: color (yellow/green/blue/pink), opacity fixed at 0.3

### Annotation Model

```javascript
// In-memory during editing session
annotations = [
  { id, page, type: 'text', x, y, content, fontSize, color },
  { id, page, type: 'drawing', points: [{x, y}, ...], strokeWidth, color },
  { id, page, type: 'highlight', x, y, width, height, color },
]
```

- Stored in React state, managed with undo/redo stack
- Rendered as SVG elements on the overlay
- Selectable, movable, deletable (Select tool)
- Coordinate system: SVG (top-left origin), flipped to PDF (bottom-left) on save

### Save Logic (`client/src/utils/pdfSave.js`)

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function flattenAnnotations(originalPdfBytes, annotations) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const ann of annotations) {
    const page = pdfDoc.getPage(ann.page);
    const { height } = page.getSize();

    switch (ann.type) {
      case 'text':
        page.drawText(ann.content, {
          x: ann.x,
          y: height - ann.y - ann.fontSize, // flip Y
          size: ann.fontSize,
          font,
          color: parseColor(ann.color),
        });
        break;
      case 'drawing':
        // Convert points array to SVG path, draw as lines
        for (let i = 1; i < ann.points.length; i++) {
          page.drawLine({
            start: { x: ann.points[i-1].x, y: height - ann.points[i-1].y },
            end: { x: ann.points[i].x, y: height - ann.points[i].y },
            thickness: ann.strokeWidth,
            color: parseColor(ann.color),
          });
        }
        break;
      case 'highlight':
        page.drawRectangle({
          x: ann.x,
          y: height - ann.y - ann.height,
          width: ann.width,
          height: ann.height,
          color: parseColor(ann.color),
          opacity: 0.3,
        });
        break;
    }
  }

  return pdfDoc.save(); // Uint8Array
}
```

## API Changes

### New endpoint: `PUT /api/files/:id`

Replaces the file content for an existing AdminFile.

```javascript
// server/src/controllers/fileController.js
async function replaceFile(req, res) {
  const { id } = req.params;
  const file = await prisma.adminFile.findUnique({ where: { id: Number(id) } });
  if (!file) return res.status(404).json({ error: 'File not found' });

  // Replace in storage (S3 or local)
  await storageService.put(file.storageKey, req.file.buffer, file.mimeType);

  // Update metadata
  await prisma.adminFile.update({
    where: { id: Number(id) },
    data: { fileSize: req.file.size },
  });

  // Audit log
  audit.logAction(req.user.id, req.user.name, req.user.role,
    'UPDATE', 'AdminFile', id, file.fileName,
    [{ field: 'fileSize', oldValue: file.fileSize, newValue: req.file.size }]);

  res.json({ success: true });
}
```

**Route:** `PUT /api/files/:id` — admin-only, multer single file upload.

### "Save as new version" flow

Uses existing `POST /api/files/upload` endpoint. Frontend appends `_v2`, `_v3`, etc. to the filename before uploading to the same folder.

## Routing

New client-side route: `/files/edit/:fileId`

Accessible only when the file is a PDF (`mimeType === 'application/pdf'`). The "Edit" button in FilesPage is conditionally shown for PDFs only.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Large PDFs (50+ pages) | Lazy page rendering — only visible + 1 buffer |
| Unsaved changes on close | `beforeunload` prompt + confirm modal |
| Concurrent edits | Last save wins (acceptable for internal tool) |
| Existing PDF text | Cannot modify — user adds new text on top, or highlights/strikes old text |
| Coordinate flip | SVG (top-left) → PDF (bottom-left) conversion on save |
| Version naming | Auto-increment: `file.pdf` → `file_v2.pdf` → `file_v3.pdf` |

## Fonts

Default to Helvetica (embedded in pdf-lib standard fonts). No custom font upload. Sufficient for dates, notes, and annotations.

## Scope Boundaries

**In scope:**
- Add text annotations (positioned freely)
- Freehand drawing / signatures
- Highlight rectangles with color options
- Strikethrough (highlight with thin height)
- Select, move, delete annotations
- Undo/redo
- Save (overwrite) / Save as new version
- Zoom and page navigation

**Out of scope:**
- Editing existing PDF text (requires text extraction/reflow — different problem)
- Multi-user collaboration
- Form field detection/auto-fill
- Page add/remove/reorder
- Mobile phone optimization (tablet OK)
- Offline support (requires server for file fetch)

## File Changes Summary

| File | Change |
|------|--------|
| `client/package.json` | Add `pdfjs-dist`, `pdf-lib` |
| `client/src/pages/PdfEditorPage.jsx` | New — full editor page |
| `client/src/utils/pdfSave.js` | New — annotation → pdf-lib flattening logic |
| `client/src/pages/FilesPage.jsx` | Add "Edit" button for PDFs |
| `client/src/App.jsx` | Add `/files/edit/:fileId` route |
| `server/src/controllers/fileController.js` | Add `replaceFile` handler |
| `server/src/routes/api.js` | Add `PUT /api/files/:id` route |
