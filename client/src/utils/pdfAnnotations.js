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
