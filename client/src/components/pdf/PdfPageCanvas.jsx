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
    onMoveStart,
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
        const { x, y } = getSvgCoords(e);

        if (activeTool === 'select') {
            const pageAnns = annotations.filter(a => a.page === pageIndex);
            const hit = [...pageAnns].reverse().find(a => hitTest(a, x, y));
            onAnnotationSelect(hit ? hit.id : null);
            if (hit) {
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
    }, [activeTool, toolOptions, annotations, pageIndex, getSvgCoords, onAnnotationAdd, onAnnotationSelect, onAnnotationDelete, onMoveStart]);

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
                                width={Math.max(250, ann.content.length * ann.fontSize * 0.6 + 40)}
                                height={ann.fontSize * 2}
                                className={selectedId === ann.id ? 'pdf-ann--selected' : ''}
                            >
                                <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
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
                                                background: 'rgba(255,255,255,0.8)',
                                                border: '1px dashed hsl(215 20% 50%)',
                                                outline: 'none',
                                                width: '100%',
                                                fontFamily: 'Helvetica, Arial, sans-serif',
                                                padding: '2px 4px',
                                                borderRadius: '2px',
                                                boxSizing: 'border-box',
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
                                                padding: '2px 4px',
                                            }}
                                        >
                                            {ann.content || ' '}
                                        </span>
                                    )}
                                </div>
                            </foreignObject>
                        );
                    }
                    return null;
                })}
            </svg>
        </div>
    );
}
