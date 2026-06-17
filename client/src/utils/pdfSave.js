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
                if (ann.content) {
                    page.drawText(ann.content, {
                        x: ann.x * s,
                        y: height - (ann.y * s) - (ann.fontSize * s),
                        size: ann.fontSize * s,
                        font,
                        color: parseColor(ann.color),
                    });
                }
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
