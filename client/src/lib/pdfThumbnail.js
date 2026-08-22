let workerConfigured = false;

// Load pdfjs with its worker configured exactly once. Shared by the thumbnail
// renderer and the full-document viewer so worker setup lives in one place.
export async function getPdfjs() {
    const pdfjs = await import('pdfjs-dist');
    if (!workerConfigured) {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        workerConfigured = true;
    }
    return pdfjs;
}

// Open a PDF document for interactive rendering (multi-page viewer). Caller is
// responsible for calling `pdf.destroy()` when done. `data` is consumed by
// pdf.js, so pass a copy if you need the buffer afterwards.
export async function loadPdfDocument(arrayBuffer) {
    const pdfjs = await getPdfjs();
    return pdfjs.getDocument({ data: arrayBuffer }).promise;
}

export async function renderPdfFirstPage(arrayBuffer, targetPx = 96) {
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = targetPx / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
    } finally {
        pdf.destroy();
    }
}
