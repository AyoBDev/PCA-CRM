import { useRef, useEffect, useState, useCallback } from 'react';
import { createTextAnnotation, createDrawingAnnotation, createHighlightAnnotation, hitTest } from '../../utils/pdfAnnotations';
import PdfFormField from './PdfFormField';

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
    onMoveStart,
    formFields,
    formValues,
    onFormFieldChange,
    pageHeight,
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [rendered, setRendered] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [editingText, setEditingText] = useState(null);

    const viewport = pdfPage.getViewport({ scale: zoom });
    const width = viewport.width;
    const height = viewport.height;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !pdfPage) return;
        const vp = pdfPage.getViewport({ scale: zoom });
        const ctx = canvas.getContext('2d');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const renderTask = pdfPage.render({ canvasContext: ctx, viewport: vp });
        renderTask.promise.then(() => setRendered(true)).catch(() => {});
        return () => renderTask.cancel();
    }, [pdfPage, zoom]);

    const getSvgCoords = useCallback((e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    const handleMouseDown = useCallback((e) => {
        if (editingText) return;
        const { x, y } = getSvgCoords(e);

        if (activeTool === 'select') {
            const pageAnns = annotations.filter(a => a.page === pageIndex);
            const hit = [...pageAnns].reverse().find(a => hitTest(a, x, y));
            onAnnotationSelect(hit ? hit.id : null);
            if (hit) {
                if (hit.type === 'text') {
                    setEditingText(hit.id);
                    return;
                }
                if (onMoveStart) onMoveStart();
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
            setEditingText(ann.id);
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
    }, [activeTool, toolOptions, annotations, pageIndex, getSvgCoords, onAnnotationAdd, onAnnotationSelect, onAnnotationDelete, onMoveStart, editingText]);

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

    const handleTextChange = useCallback((e) => {
        const ann = annotations.find(a => a.id === editingText);
        if (ann) {
            onAnnotationUpdate({ ...ann, content: e.target.value });
        }
    }, [annotations, editingText, onAnnotationUpdate]);

    const handleTextCommit = useCallback(() => {
        setEditingText(null);
    }, []);

    const pageAnnotations = annotations.filter(a => a.page === pageIndex);
    const editingAnn = editingText ? annotations.find(a => a.id === editingText) : null;

    return (
        <div ref={containerRef} className="pdf-page" style={{ position: 'relative', width, height, margin: '8px auto' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width, height }} />
            <svg
                className="pdf-page__overlay"
                width={width}
                height={height}
                style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, cursor: activeTool === 'draw' ? 'crosshair' : activeTool === 'text' ? 'text' : 'default', pointerEvents: editingText ? 'none' : 'auto' }}
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
                    if (ann.type === 'text' && ann.id !== editingText) {
                        return (
                            <text
                                key={ann.id}
                                x={ann.x}
                                y={ann.y + ann.fontSize}
                                fontSize={ann.fontSize}
                                fill={ann.color}
                                fontFamily="Helvetica, Arial, sans-serif"
                                className={selectedId === ann.id ? 'pdf-ann--selected' : ''}
                            >
                                {ann.content || ' '}
                            </text>
                        );
                    }
                    return null;
                })}
            </svg>

            {formFields && formFields
                .filter(f => f.page === pageIndex)
                .map(field => (
                    <PdfFormField
                        key={field.name + '-' + field.page}
                        field={field}
                        pageHeight={pageHeight || height}
                        zoom={zoom}
                        value={formValues ? formValues[field.name] : undefined}
                        onChange={onFormFieldChange}
                    />
                ))
            }

            {editingAnn && (
                <input
                    ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
                    type="text"
                    value={editingAnn.content}
                    onChange={handleTextChange}
                    onBlur={handleTextCommit}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleTextCommit(); if (e.key === 'Escape') handleTextCommit(); }}
                    className="pdf-text-input"
                    style={{
                        position: 'absolute',
                        left: editingAnn.x,
                        top: editingAnn.y,
                        fontSize: editingAnn.fontSize,
                        color: editingAnn.color,
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        minWidth: '200px',
                        zIndex: 10,
                    }}
                />
            )}
        </div>
    );
}
