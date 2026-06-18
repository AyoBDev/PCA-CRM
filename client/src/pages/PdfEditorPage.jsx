import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const folderId = searchParams.get('folder') || null;

    const [pdfDoc, setPdfDoc] = useState(null);
    const [pages, setPages] = useState([]);
    const [pdfBytes, setPdfBytes] = useState(null);
    const [fileName, setFileName] = useState('');
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
    const hasChanges = annotations.length > 0;

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
                setPdfBytes(bytes.slice());

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

    const handleMoveStart = useCallback(() => {
        pushUndo(annotations);
    }, [annotations, pushUndo]);

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
            const newBytes = new Uint8Array(modified);
            setPdfBytes(newBytes);

            const doc = await pdfjsLib.getDocument({ data: newBytes }).promise;
            setPdfDoc(doc);
            const loadedPages = [];
            for (let i = 1; i <= doc.numPages; i++) {
                loadedPages.push(await doc.getPage(i));
            }
            setPages(loadedPages);

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

            if (!folderId) throw new Error('Cannot determine target folder');
            await api.uploadAdminFile(folderId, blob);

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
            navigate(-1);
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
                            onMoveStart={handleMoveStart}
                        />
                    </div>
                ))}
            </div>

            {confirmClose && (
                <ConfirmModal
                    title="Unsaved changes"
                    message="You have unsaved annotations. Discard changes and close?"
                    confirmLabel="Discard"
                    onConfirm={() => navigate(-1)}
                    onCancel={() => setConfirmClose(false)}
                />
            )}
        </div>
    );
}
