# In-App PDF Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side PDF editor to the Files section that lets admins open a PDF, add text/drawings/highlights, and save it back without downloading.

**Architecture:** PDF.js renders pages to canvas, SVG overlays capture annotations, pdf-lib flattens annotations into the PDF binary on save. One new API endpoint (`PUT /api/files/:id`) replaces file content. Everything else uses existing infrastructure.

**Tech Stack:** pdfjs-dist (PDF rendering), pdf-lib (PDF modification), React (component UI), SVG (annotation layer)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `client/src/pages/PdfEditorPage.jsx` | Main editor page: toolbar, page canvas, annotation state, save logic |
| `client/src/components/pdf/PdfPageCanvas.jsx` | Single PDF page: renders canvas + SVG overlay, handles tool interactions |
| `client/src/components/pdf/PdfToolbar.jsx` | Top toolbar: tool buttons, zoom, page nav, save/close |
| `client/src/components/pdf/ToolOptionsPopover.jsx` | Contextual options: font size, color, stroke width |
| `client/src/utils/pdfSave.js` | Flattens annotations into PDF binary via pdf-lib |
| `client/src/utils/pdfAnnotations.js` | Annotation model helpers: create, update, coordinate transforms |
| `server/src/controllers/fileManagerController.js` | Add `replaceFile` handler (PUT endpoint) |
| `server/src/routes/api.js` | Register `PUT /api/files/:id` route |
| `client/src/api.js` | Add `replaceAdminFile(id, blob)` function |
| `client/src/App.jsx` | Add `/files/edit/:fileId` route |
| `client/src/pages/FilesPage.jsx` | Add "Edit" button for PDF files |
| `client/src/index.css` | PDF editor styles |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install pdfjs-dist and pdf-lib**

```bash
cd client && npm install pdfjs-dist pdf-lib
```

- [ ] **Step 2: Verify installation**

```bash
cd client && node -e "require('pdfjs-dist'); require('pdf-lib'); console.log('OK')"
```

Expected: `OK` printed with no errors.

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "deps: add pdfjs-dist and pdf-lib for PDF editor"
```

---

## Task 2: Server — PUT /api/files/:id Endpoint

**Files:**
- Modify: `server/src/controllers/fileManagerController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Add replaceFile handler to fileManagerController.js**

Add this function after the existing `downloadFile` function (around line 230):

```javascript
async function replaceFile(req, res, next) {
    try {
        const id = Number(req.params.id);
        const file = await prisma.adminFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        await storage.upload(file.storageKey, req.file.buffer, file.mimeType || 'application/octet-stream');

        const oldSize = file.fileSize;
        await prisma.adminFile.update({
            where: { id },
            data: { fileSize: req.file.size },
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'AdminFile', entityId: id,
            entityName: file.name,
            changes: [{ field: 'fileSize', oldValue: oldSize, newValue: req.file.size }],
        });

        res.json({ success: true, fileSize: req.file.size });
    } catch (err) { next(err); }
}
```

- [ ] **Step 2: Export replaceFile from the controller**

Add `replaceFile` to the module.exports object at the bottom of `fileManagerController.js`.

- [ ] **Step 3: Register the route in api.js**

In `server/src/routes/api.js`, find the file routes section (where `router.patch('/files/:id'` is registered) and add immediately before it:

```javascript
router.put('/files/:id', requireRole('admin'), uploadLarge.single('file'), replaceFile);
```

Import `replaceFile` in the destructured require from `fileManagerController.js`.

- [ ] **Step 4: Test the endpoint manually**

Start the server (`cd server && npm run dev`), then test with curl using any existing PDF file ID:

```bash
curl -X PUT http://localhost:4000/api/files/1 \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@/tmp/test.pdf" \
  -w "%{http_code}"
```

Expected: `200` with `{"success":true,"fileSize":...}` (or 404 if file ID doesn't exist — that's fine, confirms the route works).

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/fileManagerController.js server/src/routes/api.js
git commit -m "feat: add PUT /api/files/:id endpoint for file replacement"
```

---

## Task 3: Client API — replaceAdminFile Function

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add replaceAdminFile function**

Add after the existing `uploadAdminFile` function (around line 710):

```javascript
export async function replaceAdminFile(id, blob) {
    const form = new FormData();
    form.append('file', blob);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${BASE}/files/${id}`, { method: 'PUT', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
    return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat: add replaceAdminFile API client function"
```

---

## Task 4: PDF Save Utility (pdf-lib Flattening)

**Files:**
- Create: `client/src/utils/pdfSave.js`

- [ ] **Step 1: Create pdfSave.js**

```javascript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function parseColor(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return rgb(r, g, b);
}

export async function flattenAnnotations(pdfBytes, annotations, scale) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const ann of annotations) {
        const page = pdfDoc.getPage(ann.page);
        const { height } = page.getSize();
        const s = 1 / scale;

        switch (ann.type) {
            case 'text':
                page.drawText(ann.content, {
                    x: ann.x * s,
                    y: height - (ann.y * s) - (ann.fontSize * s),
                    size: ann.fontSize * s,
                    font,
                    color: parseColor(ann.color),
                });
                break;
            case 'drawing':
                for (let i = 1; i < ann.points.length; i++) {
                    page.drawLine({
                        start: { x: ann.points[i - 1].x * s, y: height - ann.points[i - 1].y * s },
                        end: { x: ann.points[i].x * s, y: height - ann.points[i].y * s },
                        thickness: ann.strokeWidth * s,
                        color: parseColor(ann.color),
                    });
                }
                break;
            case 'highlight':
                page.drawRectangle({
                    x: ann.x * s,
                    y: height - (ann.y * s) - (ann.height * s),
                    width: ann.width * s,
                    height: ann.height * s,
                    color: parseColor(ann.color),
                    opacity: 0.3,
                });
                break;
        }
    }

    return pdfDoc.save();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/pdfSave.js
git commit -m "feat: add pdfSave utility for flattening annotations into PDF"
```

---

## Task 5: Annotation Model Helpers

**Files:**
- Create: `client/src/utils/pdfAnnotations.js`

- [ ] **Step 1: Create pdfAnnotations.js**

```javascript
let nextId = 1;

export function createTextAnnotation(page, x, y, fontSize = 16, color = '#000000') {
    return { id: nextId++, page, type: 'text', x, y, content: '', fontSize, color };
}

export function createDrawingAnnotation(page, startX, startY, strokeWidth = 2, color = '#000000') {
    return { id: nextId++, page, type: 'drawing', points: [{ x: startX, y: startY }], strokeWidth, color };
}

export function createHighlightAnnotation(page, x, y, color = '#FFFF00') {
    return { id: nextId++, page, type: 'highlight', x, y, width: 0, height: 0, color };
}

export function moveAnnotation(ann, dx, dy) {
    if (ann.type === 'drawing') {
        return { ...ann, points: ann.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    }
    return { ...ann, x: ann.x + dx, y: ann.y + dy };
}

export function getAnnotationBounds(ann) {
    if (ann.type === 'text') {
        const approxWidth = ann.content.length * ann.fontSize * 0.6;
        return { x: ann.x, y: ann.y, width: approxWidth || 100, height: ann.fontSize + 4 };
    }
    if (ann.type === 'highlight') {
        return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
    }
    if (ann.type === 'drawing') {
        const xs = ann.points.map(p => p.x);
        const ys = ann.points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
}

export function hitTest(ann, px, py, tolerance = 5) {
    const b = getAnnotationBounds(ann);
    return px >= b.x - tolerance && px <= b.x + b.width + tolerance &&
           py >= b.y - tolerance && py <= b.y + b.height + tolerance;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/pdfAnnotations.js
git commit -m "feat: add annotation model helpers (create, move, hitTest, bounds)"
```

---

## Task 6: PdfToolbar Component

**Files:**
- Create: `client/src/components/pdf/PdfToolbar.jsx`

- [ ] **Step 1: Create the toolbar component**

```javascript
import { useState, useRef, useEffect } from 'react';
import Icons from '../common/Icons';

const TOOLS = [
    { id: 'select', label: 'Select', icon: 'cursor' },
    { id: 'text', label: 'Text', icon: 'edit' },
    { id: 'draw', label: 'Draw', icon: 'pen' },
    { id: 'highlight', label: 'Highlight', icon: 'highlight' },
    { id: 'eraser', label: 'Eraser', icon: 'trash' },
];

const FONT_SIZES = [12, 16, 20, 24];
const STROKE_WIDTHS = [1, 2, 4, 8];
const HIGHLIGHT_COLORS = ['#FFFF00', '#90EE90', '#87CEEB', '#FFB6C1'];
const COLORS = ['#000000', '#FF0000', '#0000FF', '#008000', '#FF6600'];

export default function PdfToolbar({
    activeTool, setActiveTool,
    toolOptions, setToolOptions,
    canUndo, canRedo, onUndo, onRedo,
    zoom, setZoom,
    currentPage, totalPages, onPageChange,
    onSave, onSaveAs, onClose,
    saving,
    hasChanges,
}) {
    const [showOptions, setShowOptions] = useState(false);

    useEffect(() => {
        setShowOptions(activeTool === 'text' || activeTool === 'draw' || activeTool === 'highlight');
    }, [activeTool]);

    return (
        <div className="pdf-toolbar">
            <div className="pdf-toolbar__left">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        className={`pdf-toolbar__tool ${activeTool === t.id ? 'pdf-toolbar__tool--active' : ''}`}
                        onClick={() => setActiveTool(t.id)}
                        title={t.label}
                    >
                        {Icons[t.icon] || t.label}
                    </button>
                ))}
            </div>

            <div className="pdf-toolbar__center">
                <button className="pdf-toolbar__btn" onClick={onUndo} disabled={!canUndo} title="Undo">
                    {Icons.undo}
                </button>
                <button className="pdf-toolbar__btn" onClick={onRedo} disabled={!canRedo} title="Redo">
                    {Icons.redo}
                </button>
                <span className="pdf-toolbar__separator" />
                <button className="pdf-toolbar__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out">
                    −
                </button>
                <span className="pdf-toolbar__zoom">{Math.round(zoom * 100)}%</span>
                <button className="pdf-toolbar__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom in">
                    +
                </button>
                <span className="pdf-toolbar__separator" />
                <button className="pdf-toolbar__btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
                    ‹
                </button>
                <span className="pdf-toolbar__page">{currentPage} / {totalPages}</span>
                <button className="pdf-toolbar__btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
                    ›
                </button>
            </div>

            <div className="pdf-toolbar__right">
                <div className="pdf-toolbar__save-group">
                    <button
                        className="btn btn--primary"
                        onClick={onSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        className="btn btn--secondary"
                        onClick={onSaveAs}
                        disabled={saving || !hasChanges}
                    >
                        Save as Version
                    </button>
                </div>
                <button className="pdf-toolbar__btn" onClick={onClose} title="Close">
                    ✕
                </button>
            </div>

            {showOptions && (
                <div className="pdf-toolbar__options">
                    {activeTool === 'text' && (
                        <>
                            <label>Size:</label>
                            {FONT_SIZES.map(s => (
                                <button
                                    key={s}
                                    className={`pdf-toolbar__option ${toolOptions.fontSize === s ? 'pdf-toolbar__option--active' : ''}`}
                                    onClick={() => setToolOptions(o => ({ ...o, fontSize: s }))}
                                >
                                    {s}
                                </button>
                            ))}
                            <label>Color:</label>
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    className={`pdf-toolbar__color-swatch`}
                                    style={{ background: c, outline: toolOptions.color === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, color: c }))}
                                />
                            ))}
                        </>
                    )}
                    {activeTool === 'draw' && (
                        <>
                            <label>Width:</label>
                            {STROKE_WIDTHS.map(w => (
                                <button
                                    key={w}
                                    className={`pdf-toolbar__option ${toolOptions.strokeWidth === w ? 'pdf-toolbar__option--active' : ''}`}
                                    onClick={() => setToolOptions(o => ({ ...o, strokeWidth: w }))}
                                >
                                    {w}px
                                </button>
                            ))}
                            <label>Color:</label>
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    className={`pdf-toolbar__color-swatch`}
                                    style={{ background: c, outline: toolOptions.color === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, color: c }))}
                                />
                            ))}
                        </>
                    )}
                    {activeTool === 'highlight' && (
                        <>
                            <label>Color:</label>
                            {HIGHLIGHT_COLORS.map(c => (
                                <button
                                    key={c}
                                    className={`pdf-toolbar__color-swatch`}
                                    style={{ background: c, outline: toolOptions.highlightColor === c ? '2px solid hsl(var(--primary))' : 'none' }}
                                    onClick={() => setToolOptions(o => ({ ...o, highlightColor: c }))}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Create directory if needed and commit**

```bash
mkdir -p client/src/components/pdf
git add client/src/components/pdf/PdfToolbar.jsx
git commit -m "feat: add PdfToolbar component with tool selection and options"
```

---

## Task 7: PdfPageCanvas Component

**Files:**
- Create: `client/src/components/pdf/PdfPageCanvas.jsx`

- [ ] **Step 1: Create the page canvas + SVG overlay component**

```javascript
import { useRef, useEffect, useState, useCallback } from 'react';
import { createTextAnnotation, createDrawingAnnotation, createHighlightAnnotation, hitTest } from '../../utils/pdfAnnotations';

export default function PdfPageCanvas({
    pdfPage,
    pageIndex,
    zoom,
    activeTool,
    toolOptions,
    annotations,
    selectedId,
    onAnnotationAdd,
    onAnnotationUpdate,
    onAnnotationSelect,
    onAnnotationDelete,
}) {
    const canvasRef = useRef(null);
    const [rendered, setRendered] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [activeTextId, setActiveTextId] = useState(null);

    const viewport = pdfPage.getViewport({ scale: zoom });
    const width = viewport.width;
    const height = viewport.height;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !pdfPage) return;
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
        renderTask.promise.then(() => setRendered(true)).catch(() => {});
        return () => renderTask.cancel();
    }, [pdfPage, zoom, width, height, viewport]);

    const getSvgCoords = useCallback((e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    const handleMouseDown = useCallback((e) => {
        const { x, y } = getSvgCoords(e);

        if (activeTool === 'select') {
            const pageAnns = annotations.filter(a => a.page === pageIndex);
            const hit = [...pageAnns].reverse().find(a => hitTest(a, x, y));
            onAnnotationSelect(hit ? hit.id : null);
            if (hit) {
                setDragStart({ x, y, annX: hit.x, annY: hit.y, id: hit.id });
            }
            return;
        }

        if (activeTool === 'eraser') {
            const pageAnns = annotations.filter(a => a.page === pageIndex);
            const hit = [...pageAnns].reverse().find(a => hitTest(a, x, y));
            if (hit) onAnnotationDelete(hit.id);
            return;
        }

        if (activeTool === 'text') {
            const ann = createTextAnnotation(pageIndex, x, y, toolOptions.fontSize, toolOptions.color);
            onAnnotationAdd(ann);
            setActiveTextId(ann.id);
            return;
        }

        if (activeTool === 'draw') {
            const ann = createDrawingAnnotation(pageIndex, x, y, toolOptions.strokeWidth, toolOptions.color);
            onAnnotationAdd(ann);
            setDrawing(true);
            return;
        }

        if (activeTool === 'highlight') {
            const ann = createHighlightAnnotation(pageIndex, x, y, toolOptions.highlightColor);
            onAnnotationAdd(ann);
            setDragStart({ x, y, id: ann.id });
            return;
        }
    }, [activeTool, toolOptions, annotations, pageIndex, getSvgCoords, onAnnotationAdd, onAnnotationSelect, onAnnotationDelete]);

    const handleMouseMove = useCallback((e) => {
        const { x, y } = getSvgCoords(e);

        if (activeTool === 'draw' && drawing) {
            const lastAnn = annotations.filter(a => a.page === pageIndex && a.type === 'drawing').pop();
            if (lastAnn) {
                onAnnotationUpdate({ ...lastAnn, points: [...lastAnn.points, { x, y }] });
            }
            return;
        }

        if (activeTool === 'highlight' && dragStart) {
            const ann = annotations.find(a => a.id === dragStart.id);
            if (ann) {
                const nx = Math.min(dragStart.x, x);
                const ny = Math.min(dragStart.y, y);
                onAnnotationUpdate({ ...ann, x: nx, y: ny, width: Math.abs(x - dragStart.x), height: Math.abs(y - dragStart.y) });
            }
            return;
        }

        if (activeTool === 'select' && dragStart) {
            const ann = annotations.find(a => a.id === dragStart.id);
            if (ann) {
                const dx = x - dragStart.x;
                const dy = y - dragStart.y;
                if (ann.type === 'drawing') {
                    const moved = { ...ann, points: ann.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                    onAnnotationUpdate(moved);
                } else {
                    onAnnotationUpdate({ ...ann, x: dragStart.annX + dx, y: dragStart.annY + dy });
                }
            }
            return;
        }
    }, [activeTool, drawing, dragStart, annotations, pageIndex, getSvgCoords, onAnnotationUpdate]);

    const handleMouseUp = useCallback(() => {
        setDrawing(false);
        setDragStart(null);
    }, []);

    const handleTextInput = useCallback((e, annId) => {
        const ann = annotations.find(a => a.id === annId);
        if (ann) {
            onAnnotationUpdate({ ...ann, content: e.target.value });
        }
    }, [annotations, onAnnotationUpdate]);

    const handleTextBlur = useCallback(() => {
        setActiveTextId(null);
    }, []);

    const pageAnnotations = annotations.filter(a => a.page === pageIndex);

    return (
        <div className="pdf-page" style={{ position: 'relative', width, height, margin: '8px auto' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width, height }} />
            <svg
                className="pdf-page__overlay"
                width={width}
                height={height}
                style={{ position: 'absolute', top: 0, left: 0, cursor: activeTool === 'draw' ? 'crosshair' : activeTool === 'text' ? 'text' : 'default' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {pageAnnotations.map(ann => {
                    if (ann.type === 'drawing') {
                        const d = ann.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                        return (
                            <path
                                key={ann.id}
                                d={d}
                                fill="none"
                                stroke={ann.color}
                                strokeWidth={ann.strokeWidth}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={selectedId === ann.id ? 'pdf-ann--selected' : ''}
                            />
                        );
                    }
                    if (ann.type === 'highlight') {
                        return (
                            <rect
                                key={ann.id}
                                x={ann.x}
                                y={ann.y}
                                width={ann.width}
                                height={ann.height}
                                fill={ann.color}
                                opacity={0.3}
                                className={selectedId === ann.id ? 'pdf-ann--selected' : ''}
                            />
                        );
                    }
                    if (ann.type === 'text') {
                        return (
                            <foreignObject
                                key={ann.id}
                                x={ann.x}
                                y={ann.y}
                                width={Math.max(200, ann.content.length * ann.fontSize * 0.6 + 20)}
                                height={ann.fontSize + 10}
                                className={selectedId === ann.id ? 'pdf-ann--selected' : ''}
                            >
                                {activeTextId === ann.id ? (
                                    <input
                                        type="text"
                                        autoFocus
                                        value={ann.content}
                                        onChange={(e) => handleTextInput(e, ann.id)}
                                        onBlur={handleTextBlur}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleTextBlur(); }}
                                        style={{
                                            fontSize: ann.fontSize,
                                            color: ann.color,
                                            background: 'transparent',
                                            border: '1px dashed hsl(var(--primary))',
                                            outline: 'none',
                                            width: '100%',
                                            fontFamily: 'Helvetica, Arial, sans-serif',
                                            padding: 0,
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => { if (activeTool === 'select') setActiveTextId(ann.id); }}
                                        style={{
                                            fontSize: ann.fontSize,
                                            color: ann.color,
                                            fontFamily: 'Helvetica, Arial, sans-serif',
                                            cursor: 'text',
                                            display: 'block',
                                        }}
                                    >
                                        {ann.content || ' '}
                                    </span>
                                )}
                            </foreignObject>
                        );
                    }
                    return null;
                })}
            </svg>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/pdf/PdfPageCanvas.jsx
git commit -m "feat: add PdfPageCanvas component with SVG annotation overlay"
```

---

## Task 8: PdfEditorPage — Main Editor Page

**Files:**
- Create: `client/src/pages/PdfEditorPage.jsx`

- [ ] **Step 1: Create PdfEditorPage.jsx**

```javascript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import PdfToolbar from '../components/pdf/PdfToolbar';
import PdfPageCanvas from '../components/pdf/PdfPageCanvas';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { flattenAnnotations } from '../utils/pdfSave';
import * as api from '../api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();

export default function PdfEditorPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [pdfDoc, setPdfDoc] = useState(null);
    const [pages, setPages] = useState([]);
    const [pdfBytes, setPdfBytes] = useState(null);
    const [fileName, setFileName] = useState('');
    const [folderId, setFolderId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [annotations, setAnnotations] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [selectedId, setSelectedId] = useState(null);

    const [activeTool, setActiveTool] = useState('select');
    const [toolOptions, setToolOptions] = useState({
        fontSize: 16,
        color: '#000000',
        strokeWidth: 2,
        highlightColor: '#FFFF00',
    });
    const [zoom, setZoom] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [saving, setSaving] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);

    const scrollRef = useRef(null);
    const hasChanges = annotations.length > 0 || undoStack.length > 0;

    useEffect(() => {
        async function loadPdf() {
            try {
                const token = api.getToken();
                const res = await fetch(`/api/files/${fileId}/download`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('Failed to load PDF');
                const arrayBuffer = await res.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                setPdfBytes(bytes);

                const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
                setPdfDoc(doc);

                const loadedPages = [];
                for (let i = 1; i <= doc.numPages; i++) {
                    const page = await doc.getPage(i);
                    loadedPages.push(page);
                }
                setPages(loadedPages);

                const disposition = res.headers.get('content-disposition') || '';
                const match = disposition.match(/filename="?([^"]+)"?/);
                setFileName(match ? decodeURIComponent(match[1]) : `file-${fileId}.pdf`);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        loadPdf();
    }, [fileId]);

    const pushUndo = useCallback((prevAnnotations) => {
        setUndoStack(s => [...s, prevAnnotations]);
        setRedoStack([]);
    }, []);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prev = undoStack[undoStack.length - 1];
        setRedoStack(s => [...s, annotations]);
        setAnnotations(prev);
        setUndoStack(s => s.slice(0, -1));
    }, [undoStack, annotations]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setUndoStack(s => [...s, annotations]);
        setAnnotations(next);
        setRedoStack(s => s.slice(0, -1));
    }, [redoStack, annotations]);

    const handleAnnotationAdd = useCallback((ann) => {
        pushUndo(annotations);
        setAnnotations(s => [...s, ann]);
        setSelectedId(ann.id);
    }, [annotations, pushUndo]);

    const handleAnnotationUpdate = useCallback((updated) => {
        setAnnotations(s => s.map(a => a.id === updated.id ? updated : a));
    }, []);

    const handleAnnotationDelete = useCallback((id) => {
        pushUndo(annotations);
        setAnnotations(s => s.filter(a => a.id !== id));
        if (selectedId === id) setSelectedId(null);
    }, [annotations, pushUndo, selectedId]);

    const handleSave = useCallback(async () => {
        if (!pdfBytes || annotations.length === 0) return;
        setSaving(true);
        try {
            const modified = await flattenAnnotations(pdfBytes, annotations, zoom);
            const blob = new Blob([modified], { type: 'application/pdf' });
            await api.replaceAdminFile(fileId, blob);
            setPdfBytes(new Uint8Array(modified));
            setAnnotations([]);
            setUndoStack([]);
            setRedoStack([]);
            showToast('PDF saved successfully', 'success');
        } catch (err) {
            showToast('Failed to save: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [pdfBytes, annotations, zoom, fileId, showToast]);

    const handleSaveAs = useCallback(async () => {
        if (!pdfBytes || annotations.length === 0) return;
        setSaving(true);
        try {
            const modified = await flattenAnnotations(pdfBytes, annotations, zoom);
            const base = fileName.replace(/\.pdf$/i, '');
            const versionMatch = base.match(/_v(\d+)$/);
            let newName;
            if (versionMatch) {
                newName = base.replace(/_v\d+$/, `_v${Number(versionMatch[1]) + 1}`) + '.pdf';
            } else {
                newName = base + '_v2.pdf';
            }
            const blob = new File([modified], newName, { type: 'application/pdf' });

            const folderRes = await api.getFolder(folderId || undefined);
            const targetFolderId = folderRes?.id || folderId;
            if (targetFolderId) {
                await api.uploadAdminFile(targetFolderId, blob);
            }

            setAnnotations([]);
            setUndoStack([]);
            setRedoStack([]);
            showToast(`Saved as ${newName}`, 'success');
        } catch (err) {
            showToast('Failed to save version: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [pdfBytes, annotations, zoom, fileName, folderId, showToast]);

    const handleClose = useCallback(() => {
        if (hasChanges) {
            setConfirmClose(true);
        } else {
            navigate('/files');
        }
    }, [hasChanges, navigate]);

    const handlePageChange = useCallback((page) => {
        const clamped = Math.max(1, Math.min(page, pages.length));
        setCurrentPage(clamped);
        const el = scrollRef.current?.querySelector(`[data-page="${clamped - 1}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [pages.length]);

    useEffect(() => {
        const handler = (e) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasChanges]);

    if (loading) return <div className="pdf-editor__loading">Loading PDF…</div>;
    if (error) return <div className="pdf-editor__error">Error: {error}</div>;

    return (
        <div className="pdf-editor">
            <PdfToolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                toolOptions={toolOptions}
                setToolOptions={setToolOptions}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                onUndo={handleUndo}
                onRedo={handleRedo}
                zoom={zoom}
                setZoom={setZoom}
                currentPage={currentPage}
                totalPages={pages.length}
                onPageChange={handlePageChange}
                onSave={handleSave}
                onSaveAs={handleSaveAs}
                onClose={handleClose}
                saving={saving}
                hasChanges={hasChanges}
            />

            <div className="pdf-editor__canvas-area" ref={scrollRef}>
                {pages.map((page, idx) => (
                    <div key={idx} data-page={idx}>
                        <PdfPageCanvas
                            pdfPage={page}
                            pageIndex={idx}
                            zoom={zoom}
                            activeTool={activeTool}
                            toolOptions={toolOptions}
                            annotations={annotations}
                            selectedId={selectedId}
                            onAnnotationAdd={handleAnnotationAdd}
                            onAnnotationUpdate={handleAnnotationUpdate}
                            onAnnotationSelect={setSelectedId}
                            onAnnotationDelete={handleAnnotationDelete}
                        />
                    </div>
                ))}
            </div>

            {confirmClose && (
                <ConfirmModal
                    title="Unsaved changes"
                    message="You have unsaved annotations. Discard changes and close?"
                    confirmLabel="Discard"
                    onConfirm={() => navigate('/files')}
                    onCancel={() => setConfirmClose(false)}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/PdfEditorPage.jsx
git commit -m "feat: add PdfEditorPage with full annotation editing and save"
```

---

## Task 9: Route and FilesPage Integration

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/FilesPage.jsx`

- [ ] **Step 1: Add route in App.jsx**

Add the lazy import at the top with the other page imports (after the `FilesPage` import, around line 32):

```javascript
const PdfEditorPage = lazy(() => import('./pages/PdfEditorPage'));
```

Add the route inside the `<Routes>` block, right after the `/files` route (after line 80):

```javascript
<Route path="/files/edit/:fileId" element={<ProtectedRoute adminOnly><Layout><PdfEditorPage /></Layout></ProtectedRoute>} />
```

- [ ] **Step 2: Add "Edit" button in FilesPage.jsx**

In the file action buttons section (around line 410-443, inside the `.files-page__item-actions` div), add an "Edit" button before the download button, conditionally shown for PDFs:

```javascript
{!item.isDirectory && item.mimeType === 'application/pdf' && (
    <button
        className="btn--icon"
        title="Edit PDF"
        onClick={(e) => {
            e.stopPropagation();
            navigate(`/files/edit/${item.id}`);
        }}
    >
        {Icons.edit}
    </button>
)}
```

Also add `useNavigate` to the imports from `react-router-dom` at the top of FilesPage.jsx if not already present:

```javascript
import { useNavigate } from 'react-router-dom';
```

And inside the component, before any early returns:

```javascript
const navigate = useNavigate();
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/pages/FilesPage.jsx
git commit -m "feat: wire PdfEditorPage route and Edit button in FilesPage"
```

---

## Task 10: CSS Styles for PDF Editor

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add PDF editor styles**

Add at the end of `client/src/index.css`:

```css
/* ===== PDF Editor ===== */
.pdf-editor {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    background: hsl(var(--muted));
}

.pdf-editor__loading,
.pdf-editor__error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 16px;
    color: hsl(var(--muted-foreground));
}

.pdf-editor__error { color: hsl(var(--destructive)); }

.pdf-editor__canvas-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.pdf-page {
    background: white;
    box-shadow: 0 2px 8px hsl(0 0% 0% / 0.15);
    border-radius: 2px;
}

.pdf-page__overlay { user-select: none; }

.pdf-ann--selected {
    outline: 2px dashed hsl(var(--primary));
    outline-offset: 2px;
}

/* Toolbar */
.pdf-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: hsl(var(--card));
    border-bottom: 1px solid hsl(var(--border));
    flex-shrink: 0;
    flex-wrap: wrap;
}

.pdf-toolbar__left,
.pdf-toolbar__center,
.pdf-toolbar__right {
    display: flex;
    align-items: center;
    gap: 4px;
}

.pdf-toolbar__left { flex: 0 0 auto; }
.pdf-toolbar__center { flex: 1; justify-content: center; }
.pdf-toolbar__right { flex: 0 0 auto; }

.pdf-toolbar__tool {
    padding: 6px 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--foreground));
    font-size: 13px;
    transition: background 0.15s, border-color 0.15s;
}

.pdf-toolbar__tool:hover { background: hsl(var(--muted)); }
.pdf-toolbar__tool--active {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
}

.pdf-toolbar__btn {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--foreground));
    font-size: 14px;
}

.pdf-toolbar__btn:hover:not(:disabled) { background: hsl(var(--muted)); }
.pdf-toolbar__btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pdf-toolbar__separator {
    width: 1px;
    height: 20px;
    background: hsl(var(--border));
    margin: 0 4px;
}

.pdf-toolbar__zoom,
.pdf-toolbar__page {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    min-width: 50px;
    text-align: center;
}

.pdf-toolbar__save-group {
    display: flex;
    gap: 4px;
}

.pdf-toolbar__options {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding-top: 6px;
    border-top: 1px solid hsl(var(--border));
    margin-top: 4px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}

.pdf-toolbar__option {
    padding: 2px 8px;
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
}

.pdf-toolbar__option--active {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary));
}

.pdf-toolbar__color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid hsl(var(--border));
    cursor: pointer;
    padding: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "style: add CSS for PDF editor toolbar, canvas, and annotations"
```

---

## Task 11: Integration Test — Full Flow

**Files:** None (manual testing)

- [ ] **Step 1: Build and run**

```bash
cd client && npm run build && cd ../server && npm run dev
```

- [ ] **Step 2: Test the edit flow**

1. Open `http://localhost:4000/files` (logged in as admin)
2. Upload a PDF file if none exists
3. Click the "Edit" button on a PDF file
4. Verify the PDF renders in the editor at `/files/edit/:fileId`
5. Select the Text tool → click on the page → type some text → press Enter
6. Select the Draw tool → draw a freehand stroke on the page
7. Select the Highlight tool → drag a rectangle over some area
8. Click Undo — last annotation removed. Click Redo — it comes back.
9. Click Save — PDF is saved back. Reload page — annotations are baked in.
10. Test "Save as Version" — creates a new file in the same folder with `_v2` suffix.
11. Test Close with unsaved changes — confirm modal appears.

- [ ] **Step 3: Fix any issues found during testing**

Address any rendering, coordinate, or save issues discovered.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during PDF editor integration testing"
```

---

## Task 12: PDF.js Worker Configuration for Vite

**Files:**
- Modify: `client/vite.config.js` (if needed)

- [ ] **Step 1: Verify PDF.js worker loading**

The worker is configured in `PdfEditorPage.jsx` using:
```javascript
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();
```

This relies on Vite's native `new URL(..., import.meta.url)` asset handling. Run the dev server and check the browser console for worker errors:

```bash
cd client && npm run dev
```

Open `/files/edit/<id>` and check for errors in DevTools console.

- [ ] **Step 2: If worker fails, add optimizeDeps config**

If the worker doesn't load, add to `vite.config.js`:

```javascript
optimizeDeps: {
    include: ['pdfjs-dist'],
},
```

- [ ] **Step 3: Commit if changes needed**

```bash
git add client/vite.config.js
git commit -m "fix: configure Vite for pdfjs-dist worker loading"
```
